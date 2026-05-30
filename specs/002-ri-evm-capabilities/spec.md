# Feature Specification: RI POC Adapter Capabilities (ERC-3643 / ERC-4626 / IRS)

**Feature Branch**: `002-ri-evm-capabilities`  
**Created**: 2026-05-29  
**Status**: Draft  
**Input**: User description: "Implement all the prerequisites for the Reference Implementation POC that go into adapters and the openzeppelin-ui packages."  
**Reference**: [Plugin (@openzeppelin/ri-tokenized-deposits-evm-plugin)](https://www.notion.so/36ecbd12786081d895b2f37d082636a5) §2e, §6e · [Tokenized Deposits — POC Scope Proposal](https://www.notion.so/36ccbd12786081c99b43ea74d666e565) §3i · [Reference Implementations — User Stories & Requirements v0.3](https://www.notion.so/351cbd127860816197c9c89bfa27fcfb) §5, Q12 · [Identity Onboarding HLD](https://www.notion.so/368cbd12786081de8c9fdfc462af3072)

## Overview

The Tokenized Deposits Reference Implementation (RI) POC needs all of its on-chain mechanics — T-REX (ERC-3643) token operations, ERC-4626 vault operations, and Identity Registry (IRS) / ONCHAINID identity operations — to live in `openzeppelin-adapters` as new capabilities, not inside the RI plugin. This is the same architectural pattern as the existing `AccessControlCapability` that powers Role Manager: a domain-specific contract wrapper exposed as a capability and consumed by many products.

This feature covers **only the adapter-and-types prerequisites** that must land before (and alongside) the RI plugin's Week 1 work. Concretely, it spans two repositories:

- **`@openzeppelin/ui-types`** (in `openzeppelin-ui`) — three new capability interfaces (`ERC3643Capability`, `ERC4626Capability`, `IRSCapability`) plus their supporting types and error classes, defined as the single source of truth, pattern-matched against `AccessControlCapability` / `AccessControlService`.
- **`@openzeppelin/adapter-evm-core`** (in `openzeppelin-adapters`), re-exported through `@openzeppelin/adapter-evm` — viem-based factory implementations of the three capabilities, exposed as sub-path exports for physical tier isolation and validated to import cleanly in a Node/server-side context.

Everything specific to the RI plugin — the `RelayerPluginExecutionStrategy`, the `CustodyBackend`, route handlers, KV state, business orchestration — is **out of scope** here and ships in the plugin package. The write side of these capabilities reuses the adapter's **existing** execution-strategy extension point (`ExecutionCapability` + `AdapterExecutionStrategy`); no new write-side primitive is introduced in `@openzeppelin/ui-types`.

## Clarifications

### Session 2026-05-29

- Q: How should token/share amounts be represented in the chain-agnostic capability interfaces? → A: Base-unit decimal `string` everywhere in the `@openzeppelin/ui-types` interfaces; the viem-based factory converts `string ↔ bigint` internally at the chain boundary. Chosen for JSON/serialization safety, parity with the plugin's KV schema and route DTOs, and portability to non-EVM chains.
- Q: Which identity primitives does `IRSCapability` own? → A: All on-chain identity primitives — deploy ONCHAINID, idempotent trusted-issuer registration, attach claim, `registerIdentity`, plus `getOnchainId`/`isVerified`/jurisdiction reads. The plugin's `/onboard` route orchestrates ordering; each on-chain step is a capability primitive (chain mechanics stay in the adapter per §2e).
- Q: Does `IRSCapability` hold or use the trusted-issuer key for claim signing? → A: No. Claim attachment accepts a pre-signed claim (`topic`, `scheme`, `data`, `signature`) and submits `addClaim`; the consumer owns issuer-key custody and signing. The capability MAY expose a pure, key-free helper to construct the canonical claim payload/digest. Keeps sensitive key material out of the adapter (aligns with Identity Onboarding HLD §9 Q1 deferral).
- Q: How are known on-chain failure conditions surfaced? → A: Typed error classes defined in `@openzeppelin/ui-types` (each with a stable code + structured details), thrown by write methods on known failures — mirroring the `AccessControlCapability` 5-error-class precedent. Expected negative-but-not-failure outcomes stay as return values (`isVerified` → `false`; `simulateTransfer` → `{ allowed: false, blockingModule }`).
- Q: Tier classification, and do writes depend on a connected wallet? → A: Tier 3, but writes depend ONLY on an injected `signAndBroadcast` execution callback (the selected `AdapterExecutionStrategy`), never on `WalletCapability`. This mirrors the verified `createAccessControl(config, { signAndBroadcast })` precedent: the factory takes `NetworkConfig` + an injected execution callback, reads run over RPC, and the service is decoupled from wallet/signing infrastructure (no React/Wagmi in the import graph) — making server-side, wallet-free consumption work.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Capability interfaces defined in the shared types package (Priority: P1)

The `@openzeppelin/ui-types` package gains three new capability interfaces — `ERC3643Capability`, `ERC4626Capability`, `IRSCapability` — alongside the supporting domain types and structured error classes they need. They follow the `AccessControlCapability` precedent exactly: a Tier 3 capability that extends `RuntimeCapability` and promotes a chain-agnostic service interface, with write operations accepting an `ExecutionConfig` and optional status callback (the same shape `AccessControlService` methods use). No new write-side primitive is added; writes flow through the existing `ExecutionCapability` contract.

**Why this priority**: Type definitions are the foundation everything else depends on. The adapter factories implement these interfaces, and the RI plugin's `Capabilities` port is typed against them. Per the POC sequencing, interface shapes must be locked by end of Week 0 so plugin Week 1 work and adapter factory work can proceed in parallel. Nothing downstream can be built or type-checked until these exist.

**Independent Test**: Can be fully tested by importing the three capability interfaces from `@openzeppelin/ui-types` in a type-check harness, declaring a stub object that satisfies each interface, and confirming the package builds and type-checks with the new exports — without any adapter implementation present.

**Acceptance Scenarios**:

1. **Given** the `@openzeppelin/ui-types` package, **When** the three capability interfaces are added, **Then** `ERC3643Capability`, `ERC4626Capability`, and `IRSCapability` are importable from the package's public type surface, each extending `RuntimeCapability`.
2. **Given** the new interfaces, **When** a write method (e.g. `ERC3643Capability.mint`) is declared, **Then** its signature accepts an `ExecutionConfig` (and optional status callback / runtime API key) in the same shape used by `AccessControlService` methods — confirming reuse of the existing execution contract rather than a bespoke callback.
3. **Given** the supporting types, **When** read methods are declared, **Then** their return shapes (e.g. `simulateTransfer` returning `{ allowed, modulesEvaluated, blockingModule? }`, balance/verification/jurisdiction reads) are defined as chain-agnostic types in the types package, not as EVM-specific (`viem`) types.
4. **Given** the capability factory map, **When** the three capabilities are added, **Then** `CapabilityFactoryMap` exposes optional factory entries for them (consistent with all entries being optional), so an adapter that does not implement them leaves them `undefined`.

---

### User Story 2 - IRS / identity capability available to the adapter (Priority: P1)

`@openzeppelin/adapter-evm-core` implements `IRSCapability` as a viem-based factory: ONCHAINID lookup for a holder, identity registration in the IRS, claim attachment, an `isVerified(holder)` membership read, and jurisdiction queries. The RI plugin's `/onboard`, `/mint`, and `/transfer` routes depend on this capability — `isVerified` is the IRS pre-check that turns T-REX's opaque on-chain reverts into structured, actionable errors before any submission.

**Why this priority**: The IRS pre-check is called out as the single most important shared helper. T-REX reverts opaquely if a recipient is not in the IRS, and `/mint` and `/transfer` cannot safely submit without `isVerified`. Keeping this in the adapter (not the plugin) means any future non-Relayer backend implementing the same routes gets the same pre-check semantics for free.

**Independent Test**: Can be fully tested by constructing the capability against a mocked RPC, calling `isVerified` for a known-registered and a known-unregistered address and asserting the boolean results, and calling the identity-registration write path against a mocked execution strategy and asserting the correct calldata is produced — no live chain required.

**Acceptance Scenarios**:

1. **Given** a configured `IRSCapability` instance, **When** `isVerified(holder)` is called for a holder registered in the IRS, **Then** it resolves `true`; for an unregistered holder it resolves `false`.
2. **Given** a holder address, **When** `getOnchainId(holder)` (ONCHAINID lookup) is called, **Then** it returns the holder's identity contract address, or a documented "not found" result when none exists.
3. **Given** the identity-registration and claim-attachment write methods, **When** they are invoked with an `ExecutionConfig`, **Then** they build the correct on-chain calldata and submit it through the supplied execution strategy, returning a structured operation result.
4. **Given** the capability is imported via its sub-path in a Node/server-side process, **When** it is constructed and `isVerified` is called, **Then** no React or Wagmi module is present in the import graph.

---

### User Story 3 - ERC-3643 (T-REX) token capability available to the adapter (Priority: P1)

`@openzeppelin/adapter-evm-core` implements `ERC3643Capability` as a viem-based factory covering both reads — `balanceOf`, `isVerified`, `isFrozen`, jurisdiction lookup, and `simulateTransfer` (compliance-module evaluation returning `{ allowed, modulesEvaluated, blockingModule? }`) — and writes — `mint`, `burn`, `transfer`, `freeze`, `unfreeze`. Writes go through the existing `ExecutionCapability` so the RI plugin can inject its own submission strategy. Structured mapping of on-chain reverts into actionable signals (e.g. recipient-not-verified, compliance-module-rejected) lives in this capability.

**Why this priority**: ERC-3643 is the API spine's chain layer — minting, burning, transferring, and freezing are the core business actions of the RI. The plugin's `/mint`, `/burn`, `/transfer`, `/freeze`, `/unfreeze` routes all dispatch to this capability. Without it, no mutating route can function.

**Independent Test**: Can be fully tested by constructing the capability against a mocked RPC: assert read methods decode mocked contract responses correctly (balance, frozen state, jurisdiction, `simulateTransfer` shape), and assert each write method produces the expected calldata and submits via a mocked execution strategy.

**Acceptance Scenarios**:

1. **Given** a configured `ERC3643Capability`, **When** `balanceOf`, `isFrozen`, and jurisdiction reads are called against mocked RPC responses, **Then** each returns the correctly decoded chain-agnostic value.
2. **Given** the `simulateTransfer({ from, to, amount })` read, **When** the simulated compliance evaluation passes, **Then** it returns `{ allowed: true, modulesEvaluated }`; when a module blocks it, **Then** it returns `{ allowed: false, blockingModule }`.
3. **Given** the write methods (`mint`, `burn`, `transfer`, `freeze`, `unfreeze`), **When** each is invoked with an `ExecutionConfig`, **Then** it builds the correct calldata for the T-REX token and submits it through the configured execution strategy.
4. **Given** an on-chain revert surfaced by the execution path, **When** it maps to a known condition (e.g. recipient not verified), **Then** the capability surfaces a structured, decodable error rather than an opaque raw revert.

---

### User Story 4 - ERC-4626 vault capability available to the adapter (Priority: P2)

`@openzeppelin/adapter-evm-core` implements `ERC4626Capability` as a viem-based factory: reads `convertToAssets`, `convertToShares`, `totalAssets`; writes `deposit`, `withdraw`. The RI plugin's `/vault-deposit` and `/vault-withdraw` routes dispatch to this capability, and `/balance` uses `convertToAssets` to render a holder's vault balance.

**Why this priority**: The yield-vault flow is a complete demo loop but lands in Week 3, after the core token and identity flows. Vault share-price math (`convertToAssets`) is needed for balance display, but the vault is not on the critical path for the first end-to-end route (`/balance` token reads) or the Week 2 mint/transfer/onboard work.

**Independent Test**: Can be fully tested by constructing the capability against a mocked RPC, asserting `convertToAssets` / `convertToShares` / `totalAssets` decode correctly, and asserting `deposit` / `withdraw` build the correct calldata and submit via a mocked execution strategy.

**Acceptance Scenarios**:

1. **Given** a configured `ERC4626Capability`, **When** `convertToAssets(shares)` and `convertToShares(assets)` are called against mocked RPC, **Then** each returns the correctly decoded converted amount.
2. **Given** `deposit` and `withdraw`, **When** each is invoked with an `ExecutionConfig`, **Then** it builds the correct ERC-4626 calldata and submits via the execution strategy, returning the resulting shares/assets in the operation result where available.
3. **Given** the vault capability imported via its sub-path in a server-side process, **When** it is constructed, **Then** no React or Wagmi module is present in the import graph.

---

### User Story 5 - Server-side consumption via sub-path imports without UI dependencies (Priority: P1)

The three capabilities are published as individual sub-path exports (`@openzeppelin/adapter-evm/erc3643`, `/erc4626`, `/irs`), wired into the package's `package.json` `exports` and `tsdown.config.ts` entry list per the adapter contribution checklist, and re-exported from the public `@openzeppelin/adapter-evm` package. Crucially, importing any of these sub-paths in a Node/server-side context (as the RI plugin does — it runs inside the Relayer process, not a browser) pulls in **no** React or Wagmi dependencies.

**Why this priority**: The RI plugin is a server-side Relayer plugin. If the capabilities can't be imported cleanly outside a browser/bundler context, the plugin can't consume them at all. The architecture guide states sub-path exports are designed for physical tier isolation; this story makes that property an explicit, verified requirement for the new capabilities rather than an assumption.

**Independent Test**: Can be fully tested by importing each new sub-path in a plain Node process (no bundler, no DOM) and asserting the module loads and a capability can be constructed; and by analyzing each sub-path's transitive import graph and asserting it contains no React/Wagmi modules.

**Acceptance Scenarios**:

1. **Given** the published adapter package, **When** `@openzeppelin/adapter-evm/erc3643`, `/erc4626`, and `/irs` are each imported in a Node process, **Then** each resolves and a capability instance can be constructed without error.
2. **Given** any of the three new sub-path imports, **When** its transitive dependency graph is analyzed, **Then** it includes no React, Wagmi, or other browser-only UI modules.
3. **Given** the package configuration, **When** the build runs, **Then** `package.json` `exports`, `tsdown.config.ts` entries, and the `@openzeppelin/adapter-evm` re-exports all include the three new capabilities, and `pnpm validate:vite-configs` (and equivalent export validation) passes.

---

### User Story 6 - Write path conforms to the existing execution-strategy extension point (Priority: P2)

The three capabilities consume the adapter's existing `ExecutionCapability` exactly as `AccessControlCapability` does — they do not know or care which `AdapterExecutionStrategy` is wired in. This feature includes the explicit design check (Q5) that the `AdapterExecutionStrategy` interface — `signAndBroadcast` plus the optional `waitForTransactionConfirmation(txHash)` — cleanly accommodates an asynchronous submit-then-poll submission model (the model the RI plugin's future `RelayerPluginExecutionStrategy` will use when delegating to its custody backend). If a gap is found, it is recorded as an interface concern; no Relayer/plugin coupling is added to the adapter.

**Why this priority**: This is the load-bearing assumption that lets the chain mechanics travel with the API-host swap seam without inventing a new primitive. It must be confirmed before the plugin's Week 2 write-path work, but it is a verification/validation activity layered on top of the capability implementations (P1), not a blocker for scaffolding the interfaces.

**Independent Test**: Can be fully tested by implementing a trivial test `AdapterExecutionStrategy` whose `signAndBroadcast` returns a tx hash immediately and whose `waitForTransactionConfirmation` resolves after a simulated poll, wiring it into one capability write method, and asserting the capability returns a confirmed result through the async two-step flow.

**Acceptance Scenarios**:

1. **Given** a capability write method and a custom `AdapterExecutionStrategy` that submits then polls, **When** the write executes, **Then** the capability obtains the tx hash from `signAndBroadcast` and the confirmation from `waitForTransactionConfirmation` without shape mismatch.
2. **Given** the existing strategies, **When** a capability write is composed with `EoaExecutionStrategy` or the existing `RelayerExecutionStrategy`, **Then** it still functions — confirming the capabilities are strategy-agnostic.
3. **Given** the adapter package, **When** its dependency graph is inspected, **Then** it contains no dependency on the Relayer plugin runtime (`PluginContext`, `api.sendTransaction`) — the plugin-specific strategy lives outside this scope.

---

### User Story 7 - Capability factories are tested and tier-isolation conformant (Priority: P2)

Each of the three capabilities ships with tests per the adapter contribution checklist: factory-creation tests, mocked-RPC behavioral tests for every read and write method, and tier-isolation conformance so the new sub-paths don't pull in higher-tier or browser-only dependencies. Per the Notion doc, IRS pre-check behavior is now adapter-side, so its capability-level tests live in this repo's test suite, not the plugin's.

**Why this priority**: Tests are required by the contribution checklist and give the plugin team confidence to build against the capabilities, but CI assertions land as the work matures and are not on the Week 1 critical path. They depend on the factories (P1) existing first.

**Independent Test**: Can be fully tested by running the adapter test suite and confirming each new capability has factory-creation and behavioral coverage and that the tier-isolation check passes for the three new sub-paths.

**Acceptance Scenarios**:

1. **Given** the adapter test suite, **When** it runs, **Then** each of the three capabilities has a factory-creation test and mocked-RPC behavioral tests covering its read and write methods.
2. **Given** the tier-isolation conformance check, **When** it runs against the three new sub-paths, **Then** it confirms no disallowed cross-tier or browser-only imports are present.
3. **Given** the IRS pre-check logic, **When** its behavior is tested, **Then** the tests live in the adapter repo's suite (not the plugin's).

---

### Edge Cases

- **Holder not in IRS**: `isVerified` returns `false` (not an error); the consuming route decides how to surface it. The capability MUST NOT throw for a simply-unregistered holder.
- **ONCHAINID not found**: `getOnchainId` returns a documented "not found" result rather than throwing, so callers can branch on first-time onboarding.
- **`simulateTransfer` blocked by a compliance module**: returns `{ allowed: false, blockingModule }` rather than throwing, so the consuming route can render which module blocked the transfer.
- **Opaque on-chain revert during a write**: the capability maps known revert conditions to structured, decodable errors; unmapped reverts surface with enough context to diagnose, never as a silently-swallowed failure.
- **Capability disposal**: as Tier 3 capabilities, each exposes `dispose()`; calling it is idempotent and subsequent method calls behave per the adapter's standard disposed-runtime contract. A single shared instance per capability is the intended consumption pattern.
- **Idempotent identity operations**: re-running registration/claim attachment for an already-registered holder is safe (idempotent), supporting partial-failure recovery in the onboarding sequence.
- **Server-side import with no wallet connected**: reads and strategy-driven writes succeed without a browser wallet, since submission is delegated to the injected execution strategy.

## Requirements *(mandatory)*

### Functional Requirements

#### Types package (`@openzeppelin/ui-types`)

- **FR-001**: The system MUST define three new capability interfaces in `@openzeppelin/ui-types` as the single source of truth: `ERC3643Capability`, `ERC4626Capability`, and `IRSCapability`.
- **FR-002**: Each new capability interface MUST extend `RuntimeCapability` and be classified Tier 3, mirroring `AccessControlCapability` (which is a direct promotion of a chain-agnostic service interface). Per the Plugin tech doc §2e, each capability spans Tier-2-style reads (RPC-backed) and Tier-3 execution-backed writes within a single interface, exactly as `AccessControlCapability` does.
- **FR-003**: All domain types and structured error types the three capabilities expose (e.g. transfer-simulation result, identity/jurisdiction read shapes, operation results, error classes) MUST be defined as chain-agnostic types in `@openzeppelin/ui-types`, free of EVM-specific (`viem`) types.
- **FR-003a**: All token/share amount values in the capability interfaces (method parameters and return values — e.g. mint/burn/transfer amounts, vault assets/shares, balances, conversion results, total assets) MUST be represented as base-unit decimal `string`. The interfaces MUST NOT expose `bigint`; the viem-based factory converts `string ↔ bigint` internally at the chain boundary.
- **FR-004**: Write methods on the new capabilities MUST accept an `ExecutionConfig` (with the optional status-change callback and runtime API key parameters) consistent with existing `AccessControlService` write methods — reusing the existing execution contract, NOT introducing a new write-side primitive.
- **FR-005**: `CapabilityFactoryMap` MUST gain optional factory entries for the three new capabilities, so adapters that do not implement them leave them `undefined` (consistent with the existing all-optional factory-map contract).
- **FR-006**: `ERC3643Capability` MUST declare methods for: reads `balanceOf`, `isVerified`, `isFrozen`, jurisdiction lookup, and `simulateTransfer` (returning `{ allowed, modulesEvaluated, blockingModule? }`); writes `mint`, `burn`, `transfer`, `freeze`, `unfreeze`.
- **FR-007**: `ERC4626Capability` MUST declare methods for: reads `convertToAssets`, `convertToShares`, `totalAssets`; writes `deposit`, `withdraw`.
- **FR-008**: `IRSCapability` MUST declare methods for the full set of on-chain identity primitives: deploy a holder's ONCHAINID, register the trusted issuer (idempotent — safe to call when already registered), attach a claim, register the identity in the IRS (`registerIdentity`), look up a holder's ONCHAINID (`getOnchainId`), `isVerified`, and jurisdiction query. The capability exposes these as discrete primitives; the multi-step onboarding *orchestration* (ordering, when to run trusted-issuer setup, opening-supply mint) is the consumer's responsibility (out of scope here).
- **FR-008a**: The claim-attachment method MUST accept a pre-signed claim (`topic`, `scheme`, `data`, `signature`) and MUST NOT hold, accept, or use the trusted-issuer signing key — issuer-key custody and claim signing remain the consumer's responsibility. The capability MAY expose a pure, key-free helper that constructs the canonical claim payload/digest for the consumer to sign.

#### Adapter package (`@openzeppelin/adapter-evm-core` / `@openzeppelin/adapter-evm`)

- **FR-009**: `@openzeppelin/adapter-evm-core` MUST provide a viem-based factory implementation for each of the three capabilities, satisfying the `@openzeppelin/ui-types` interfaces, located under the package's capability module structure consistent with existing capabilities.
- **FR-010**: The capability implementations MUST perform all chain reads through the adapter's network/read primitives and all writes through the existing `ExecutionCapability` (selected via execution config), exactly as `AccessControlCapability` does.
- **FR-010a**: Each capability factory MUST follow the `createAccessControl(config, { signAndBroadcast })` shape — accepting a `NetworkConfig` plus an injected `signAndBroadcast` execution callback — and MUST NOT depend on `WalletCapability` or any connected-wallet state. Reads MUST run over RPC without a wallet; writes MUST delegate to the injected callback, so the capability is usable server-side without a browser wallet.
- **FR-011**: The adapter MUST NOT introduce any dependency on the Relayer plugin runtime (`PluginContext`, `api.sendTransaction`, relayer SDK) — the plugin-specific execution strategy and custody backend are out of scope and live in the plugin package.
- **FR-012**: Structured mapping of known on-chain revert conditions (e.g. recipient-not-verified, compliance-module-rejected, holder-frozen) into decodable errors MUST live in the adapter capabilities, so any consumer of the routes gets the same error semantics. These failures MUST be surfaced as typed error classes defined in `@openzeppelin/ui-types` — each carrying a stable code and structured details — thrown by write methods, mirroring the `AccessControlCapability` error-class precedent. Expected negative-but-not-failure outcomes MUST be returned as values, not thrown: `isVerified` returns `false`, and `simulateTransfer` returns `{ allowed: false, blockingModule }`.
- **FR-013**: The three capabilities MUST be published as individual sub-path exports (`@openzeppelin/adapter-evm/erc3643`, `/erc4626`, `/irs`) with corresponding `package.json` `exports` entries and `tsdown.config.ts` entry points, per the adapter contribution checklist.
- **FR-014**: The public `@openzeppelin/adapter-evm` package MUST re-export the three capabilities (and expose them in its `CapabilityFactoryMap` / `ecosystemDefinition.capabilities`) so consumers reach them through the public package.
- **FR-015**: Each capability sub-path, when imported in a Node/server-side context, MUST NOT include React, Wagmi, or other browser-only UI modules in its transitive import graph.
- **FR-016**: Each Tier 3 capability instance MUST expose `dispose()` per the adapter lifecycle contract; disposal MUST be idempotent.
- **FR-017**: The bundled contract ABIs/artifacts required by the capabilities (T-REX token, ERC-4626 vault, IRS, ONCHAINID, Claim Topics & Issuers, Trusted Issuers Registry, Identity Verifier) MUST ship within the adapter capability implementations, not be supplied by consumers.
- **FR-017a**: Each bundled ABI MUST pin and document its upstream source and version (source repo + release tag/commit + contract name), recorded at the ABI module and in the package Changeset, so decoding is reproducible and any ABI upgrade is an explicit, auditable change. Where an upstream package provides the artifacts, it MUST be pinned as an exact (non-caret) dependency used to generate the bundled ABI.

#### Verification / validation

- **FR-018**: The feature MUST verify that the existing `AdapterExecutionStrategy` interface (`signAndBroadcast` + optional `waitForTransactionConfirmation`) accommodates an asynchronous submit-then-poll write model, and record the outcome (confirmed, or a documented interface gap) — without adding Relayer coupling to the adapter.
- **FR-019**: Each capability MUST ship factory-creation tests and mocked-RPC behavioral tests covering every read and write method, per the adapter contribution checklist; the IRS pre-check (`isVerified`) behavioral tests MUST live in the adapter repo's suite.
- **FR-020**: Tier-isolation conformance MUST be verified for the three new sub-paths (no disallowed cross-tier or browser-only imports), consistent with the existing isolation guarantees for other capabilities.

#### Cross-cutting

- **FR-021**: Whether classified as profile-included or direct-consumption-only, the three capabilities MUST be consumable directly via the `CapabilityFactoryMap` / sub-path imports; adding them to an existing pre-composed profile is NOT required for the POC.
- **FR-022**: The change MUST follow the established cross-repository release sequence — `@openzeppelin/ui-types` published first with the new interfaces, then `@openzeppelin/adapter-evm-core` / `@openzeppelin/adapter-evm` implementing them.

### Key Entities

- **ERC3643Capability**: Tier 3 capability wrapping a T-REX (ERC-3643) token. Reads: balance, verification status, frozen status, jurisdiction, transfer simulation. Writes: mint, burn, transfer, freeze, unfreeze. Consumed by the RI plugin's mint/burn/transfer/freeze/unfreeze and balance routes.
- **ERC4626Capability**: Tier 3 capability wrapping an ERC-4626 vault. Reads: convertToAssets, convertToShares, totalAssets. Writes: deposit, withdraw. Consumed by the vault and balance routes.
- **IRSCapability**: Tier 3 capability wrapping the Identity Registry Storage and ONCHAINID identity infrastructure. Owns all on-chain identity primitives: deploy ONCHAINID, idempotent trusted-issuer registration, attach claim, `registerIdentity`, `getOnchainId` lookup, `isVerified`, jurisdiction query. Provides the IRS pre-check used before mint/transfer and the identity primitives the plugin's `/onboard` route orchestrates.
- **Amount (base-unit `string`)**: The canonical chain-agnostic representation of every token/share quantity in the capability interfaces. A decimal string of the value in the contract's base unit; converted to/from `bigint` only inside the adapter implementation.
- **TransferSimulationResult**: Chain-agnostic result of `simulateTransfer` — `{ allowed, modulesEvaluated, blockingModule? }` — used to render compliance pre-flight in the consumer.
- **ExecutionConfig / AdapterExecutionStrategy**: The existing adapter execution contract reused by all write methods. The strategy is injected by the consumer (the plugin supplies its own, out of scope); the capability is strategy-agnostic.
- **CapabilityFactoryMap entry**: New optional factory entries for the three capabilities, leaving them `undefined` on adapters that do not implement them.
- **Bundled contract ABIs/artifacts**: The T-REX, ERC-4626, IRS, ONCHAINID, Claim Topics & Issuers, Trusted Issuers Registry, and Identity Verifier ABIs the capability implementations encapsulate.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All three capability interfaces are importable from `@openzeppelin/ui-types`, and a stub implementation of each type-checks against the published interfaces — verified by a type-check harness with zero adapter code present.
- **SC-002**: A server-side (Node, no bundler, no DOM) consumer can import `@openzeppelin/adapter-evm/erc3643`, `/erc4626`, and `/irs`, construct each capability, and execute a representative read and a strategy-driven write against a mocked RPC/strategy — verified by an integration test that runs outside any browser/bundler context.
- **SC-003**: Each of the three new sub-paths' transitive import graph contains zero React/Wagmi modules — verified by import-graph analysis of the built sub-path entries.
- **SC-004**: Every read and write method across the three capabilities (ERC-3643: 5 reads incl. `simulateTransfer` + 5 writes; ERC-4626: 3 reads + 2 writes; IRS: lookup + registration + claim attachment + `isVerified` + jurisdiction) has at least one passing mocked-behavior test — verified by the adapter test suite.
- **SC-005**: The adapter package's dependency graph contains no Relayer-plugin-runtime dependency — verified by inspecting the package's declared dependencies and import graph.
- **SC-006**: A capability write composed with a test submit-then-poll `AdapterExecutionStrategy` returns a confirmed result through the async two-step flow, and the same write composed with the existing EOA and Relayer strategies also succeeds — verified by behavioral tests, confirming the FR-018 design check.
- **SC-007**: Export and build validation passes — `package.json` `exports`, `tsdown.config.ts` entries, and `@openzeppelin/adapter-evm` re-exports all include the three capabilities, and the repo's export/vite-config validation succeeds.
- **SC-008**: The capability interfaces are stable enough for the RI plugin to type its `Capabilities` port against them and scaffold route handlers without further interface changes during Week 1 — verified by the plugin team consuming the published (or pre-release) types without requesting interface reshaping.

## Assumptions

- **Scope boundary**: This feature delivers only the adapter (`@openzeppelin/adapter-evm-core` / `-evm`) and types (`@openzeppelin/ui-types`) prerequisites. The RI plugin packages (`-types`, `-core`, `-evm-plugin`), the `RelayerPluginExecutionStrategy`, the `CustodyBackend`, KV state, route handlers, and business orchestration are explicitly out of scope and ship in the `reference-implementations` monorepo.
- **Precedent**: `AccessControlCapability` (a Tier 3 direct promotion of `AccessControlService`, consumed by Role Manager) is the reference pattern. The three new capabilities mirror its interface shape, execution-config-based writes, lifecycle, and sub-path-export packaging.
- **Tier classification**: The capabilities are Tier 3 (network + execution) like `AccessControlCapability`, spanning RPC-backed reads and execution-backed writes in a single interface. They depend only on an injected `signAndBroadcast` execution callback — never on `WalletCapability` — and their import graphs remain free of browser-only (React/Wagmi) dependencies, so the server-side RI plugin can consume them without a connected browser wallet. This is the verified `createAccessControl(config, { signAndBroadcast })` precedent, not a new pattern.
- **Capabilities, not orchestration**: `IRSCapability` exposes identity primitives (lookup, register, attach claim, verify, jurisdiction). The multi-step onboarding sequence (deploy ONCHAINID → attach claims → register in IRS → optional opening-supply mint) is orchestrated by the plugin's `/onboard` route, not by the capability.
- **Write side reuses the existing extension point**: No new write-side primitive is added to `@openzeppelin/ui-types`. Capabilities consume the existing `ExecutionCapability`; the concrete `RelayerPluginExecutionStrategy` is supplied by the plugin (out of scope).
- **Profiles unchanged**: The capabilities are consumed via direct `CapabilityFactoryMap` / sub-path imports. No existing pre-composed profile is required to include them for the POC.
- **Target chain**: EVM (Ethereum Sepolia for the POC). Stellar/Soroban equivalents are a future concern, enabled by the same capability interfaces but out of scope here.
- **Effort framing**: Per the POC proposal, this is roughly 5–6 days of adapter-side work on the RI owner's track, landing ahead of or alongside plugin Week 1; interface shapes locked by end of Week 0, factory implementations landing iteratively (reads first, writes during plugin Week 2).
- **Contract surface**: No new smart contracts are written; the capabilities wrap existing audited T-REX, ERC-4626, and identity contracts, bundling their ABIs at pinned, documented upstream versions (FR-017a).
- **Cross-repo coordination**: Follows the established sequence used by the prior capability work — `@openzeppelin/ui-types` first, then the adapter packages — using a coordinated Changesets version bump per modified package.
