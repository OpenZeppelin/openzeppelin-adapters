---
description: "Task list for RI POC Adapter Capabilities (ERC-3643 / ERC-4626 / IRS)"
---

# Tasks: RI POC Adapter Capabilities (ERC-3643 / ERC-4626 / IRS)

**Input**: Design documents from `/specs/002-ri-evm-capabilities/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: INCLUDED — the spec mandates them (FR-019 factory-creation + mocked-RPC behavioral tests; FR-020 tier-isolation conformance; each user story defines an Independent Test). TDD per Constitution VI.

**Organization**: Tasks are grouped by user story. This feature spans two repositories:

- **Repo A — `openzeppelin-ui`** (`@openzeppelin/ui-types`): `packages/types/src/adapters/`
- **Repo B — `openzeppelin-adapters`** (`@openzeppelin/adapter-evm-core` + `@openzeppelin/adapter-evm`): `packages/adapter-evm-core/src/`, `packages/adapter-evm/`

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US7 maps to the user stories in spec.md
- Absolute repo names are prefixed because tasks span two repos

## Path Conventions

- Repo A types package: `openzeppelin-ui/packages/types/src/adapters/`
- Repo B core adapter: `openzeppelin-adapters/packages/adapter-evm-core/src/`
- Repo B public adapter: `openzeppelin-adapters/packages/adapter-evm/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare both repos and the local cross-repo dev loop

- [X] T001 [P] In `openzeppelin-ui`, confirm the local build/test loop for `@openzeppelin/ui-types` (`pnpm --filter @openzeppelin/ui-types build` / `test`) runs clean on the feature branch
- [X] T002 [P] In `openzeppelin-adapters`, confirm `pnpm build`, `pnpm test`, `pnpm lint:adapters`, and `pnpm typecheck` run clean on `002-ri-evm-capabilities`
- [X] T003 Configure local cross-repo linking so `adapter-evm-core` resolves the in-progress `@openzeppelin/ui-types` so adapter work can type-check against the new interfaces before publish. ACTIVATED at US2 via `pnpm dev:local` (the `oz-ui-dev` + `.pnpmfile.cjs` `LOCAL_UI` mechanism), which packs the sibling `../openzeppelin-ui` packages to `.packed-packages/local-dev/` and resolves the local `@openzeppelin/ui-types@3.0.0` (incl. the new ERC3643/ERC4626/IRS capability interfaces) into the consumer. No publish required.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared chain-agnostic types + error model in `@openzeppelin/ui-types` that ALL three capabilities and all adapter stories depend on. This is the hard cross-repo gate (FR-022: ui-types lands first).

**⚠️ CRITICAL**: No adapter-story (US2–US7) work can begin until this phase is complete and the types are consumable (published or locally linked).

- [X] T004 [P] Create the common `Amount` alias + `OnboardingClaim` + `ClaimPayload` + `IdentityRegistration` + `OnchainIdLookup` + `TransferSimulationResult` types in `openzeppelin-ui/packages/types/src/adapters/erc3643.ts`, `erc4626.ts`, `irs.ts` (per data-model.md) with JSDoc (`Amount` placed in shared `common.ts` as a single source to avoid duplicate `export *` bindings; `erc3643.ts` adds `TransferSimulationResult`/`HolderTokenState`, `erc4626.ts` adds `VaultDepositResult`/`VaultWithdrawResult`, `irs.ts` adds claim/identity/lookup types + `DeployOnchainIdResult`)
- [X] T005 Create the typed error model in `openzeppelin-ui/packages/types/src/adapters/ri-capability-errors.ts`: abstract `RICapabilityError` base + the 9 concrete classes with stable codes/detail fields per FR-012a — including `InvalidAmount` (`INVALID_AMOUNT`, details `value`/`reason`) for malformed-amount rejection (FR-003a) — mirroring `access-control-errors.ts`
- [X] T006 Export the new domain types + error classes from `openzeppelin-ui/packages/types/src/adapters/index.ts` (additive; alongside `access-control` / `access-control-errors`)

**Checkpoint**: Shared types/errors exist — capability interfaces (US1) can be authored on top.

---

## Phase 3: User Story 1 - Capability interfaces defined in the shared types package (Priority: P1) 🎯 MVP

**Goal**: `ERC3643Capability`, `ERC4626Capability`, `IRSCapability` exist in `@openzeppelin/ui-types`, each extending `RuntimeCapability`, with optional `CapabilityFactoryMap` entries — the foundation everything downstream types against.

**Independent Test**: Import the three interfaces in a type-check harness, declare a stub satisfying each, and confirm `@openzeppelin/ui-types` builds and type-checks with zero adapter code present (SC-001).

### Tests for User Story 1 ⚠️

- [X] T007 [P] [US1] Add a type-level conformance test (stub-implements-interface) for all three capabilities, and assert the published type surface matches the `contracts/*.md` method/return shapes (SC-008), in `openzeppelin-ui/packages/types/src/adapters/__tests__/ri-capabilities.types.test.ts` (must fail until interfaces exist) — also dropped the `**/*.test.ts` exclude from `packages/types/tsconfig.json` so `tsc --noEmit` genuinely enforces the `satisfies` checks (vitest erases `import type`/`satisfies`, so the runtime run alone gave a false green)

### Implementation for User Story 1

- [X] T008 [P] [US1] Define `ERC3643Capability` in `openzeppelin-ui/packages/types/src/adapters/capabilities/erc3643.ts` — reads `balanceOf`/`isVerified`/`isFrozen`/`getJurisdiction`/`simulateTransfer`, writes `mint`/`burn`/`transfer`/`freeze`/`unfreeze`; amounts as `Amount`; writes accept `ExecutionConfig` + optional status callback + runtime API key (FR-006, FR-003a, FR-004)
- [X] T009 [P] [US1] Define `ERC4626Capability` in `openzeppelin-ui/packages/types/src/adapters/capabilities/erc4626.ts` — reads `convertToAssets`/`convertToShares`/`totalAssets`, writes `deposit`/`withdraw` (with optional `sharesIssued`/`amountReturned` as `Amount`) (FR-007)
- [X] T010 [P] [US1] Define `IRSCapability` in `openzeppelin-ui/packages/types/src/adapters/capabilities/irs.ts` — reads `getOnchainId`(→`OnchainIdLookup`)/`isVerified`/`getJurisdiction`, pure `buildClaimPayload`, writes `deployOnchainId`/`registerTrustedIssuer`/`attachClaim`/`registerIdentity` (FR-008, FR-008a, FR-008b, FR-008c)
- [X] T011 [US1] Re-export the three interfaces from `openzeppelin-ui/packages/types/src/adapters/capabilities/index.ts` (alongside `AccessControlCapability`)
- [X] T012 [US1] Add optional `erc3643?`/`erc4626?`/`irs?` factory entries to `CapabilityFactoryMap` and optional accessors to `EcosystemRuntime` in `openzeppelin-ui/packages/types/src/adapters/runtime.ts` (FR-005)
- [X] T013 [US1] Run `@openzeppelin/ui-types` build + type-check; ensure T007 passes and the package exports the new surface (typecheck + test + lint + build all green; `ERC3643Capability`/`ERC4626Capability`/`IRSCapability` present in `dist/index.d.mts`)

**Checkpoint**: Interfaces are stable and consumable (SC-008). Publish ui-types as a MINOR / pre-release so adapter stories can link (FR-022). This is the MVP for the plugin team to start typing their `Capabilities` port.

---

## Phase 4: User Story 2 - IRS / identity capability available to the adapter (Priority: P1)

**Goal**: `@openzeppelin/adapter-evm-core` implements `IRSCapability` (viem) — ONCHAINID lookup, identity registration, claim attachment, trusted-issuer registration, `isVerified` pre-check, jurisdiction reads — consuming the injected `signAndBroadcast`.

**Independent Test**: Construct against mocked RPC; assert `isVerified` true/false for known holders; assert identity-registration / claim-attachment write paths produce correct calldata against a mocked execution callback; no live chain (SC-002, SC-004).

**Depends on**: Phase 2 + US1 (types).

### Tests for User Story 2 ⚠️

- [X] T014 [P] [US2] Factory-creation test for `createIRS(config, { signAndBroadcast })`, including an idempotent-`dispose()` assertion (FR-016), in `openzeppelin-adapters/packages/adapter-evm-core/src/irs/__tests__/irs.factory.test.ts`
- [X] T015 [P] [US2] Mocked-RPC behavioral tests for reads (`isVerified` true/false, `getOnchainId` found/not-found, `getJurisdiction`) in `openzeppelin-adapters/packages/adapter-evm-core/src/irs/__tests__/irs.reads.test.ts` (FR-019 — IRS pre-check tests live in the adapter repo)
- [X] T016 [P] [US2] Mocked-execution behavioral tests for writes (`deployOnchainId`, idempotent `registerTrustedIssuer`, pre-signed `attachClaim`, `registerIdentity` → `IdentityAlreadyRegistered` on re-run) + pure `buildClaimPayload` determinism in `openzeppelin-adapters/packages/adapter-evm-core/src/irs/__tests__/irs.writes.test.ts`

### Implementation for User Story 2

- [X] T017 [US2] Implement the shared base-unit amount codec (`parseAmount`/`formatAmount`: `string ↔ bigint` with `InvalidAmount` rejection of malformed/fractional/negative/signed/sci-notation input) + unit tests in `openzeppelin-adapters/packages/adapter-evm-core/src/shared/amount.ts` — reused by all three capability services (FR-003a, FR-012a)
- [X] T018 [P] [US2] Vendor + pin/document ABIs (IRS/IdentityRegistry, ONCHAINID, ClaimTopics, TrustedIssuersRegistry, IdentityVerifier) with source-repo + tag/commit + contract-name headers (FR-017, FR-017a). NOTE: vendored as inline fragments in `openzeppelin-adapters/packages/adapter-evm-core/src/irs/abis.ts` (single file, matching the established `access-control/abis.ts` convention rather than an `abi/` directory); covers `IIdentityRegistry`, `ITrustedIssuersRegistry`, ONCHAINID `IIdentity` (ERC-735), and the ONCHAINID `IdFactory`.
- [X] T019 [US2] Implement the viem onchain reader + service in `openzeppelin-adapters/packages/adapter-evm-core/src/irs/onchain-reader.ts` and `service.ts` (reads over RPC; map reverts → typed errors). NOTE: IRS reads/writes carry no token amounts, so the shared amount codec (T017) is exercised by the ERC-3643/ERC-4626 services (US3/US4) rather than IRS.
- [X] T020 [US2] Implement write actions + pre-signed claim handling + key-free `buildClaimPayload` in `openzeppelin-adapters/packages/adapter-evm-core/src/irs/actions.ts` and `claim-payload.ts` (FR-008a — no issuer key; digest = `keccak256(abi.encode(onchainId, topic, data))` per ONCHAINID/ERC-735)
- [X] T021 [US2] Implement `createIRS(config, options)` factory in `openzeppelin-adapters/packages/adapter-evm-core/src/capabilities/irs.ts` (mirror `createAccessControl`; wrap with `guardRuntimeCapability`; reuse `asTypedEvmNetworkConfig`) (FR-009, FR-010, FR-010a, FR-016). NOTE: `CreateIRSOptions` extends `{ signAndBroadcast }` with the deployment-specific `addresses` (identityRegistry/identityFactory/trustedIssuersRegistry) + optional `trustedIssuer`, since the capability methods take holder/claim args rather than per-call contract addresses.
- [X] T022 [US2] Export `createIRS` + types from `openzeppelin-adapters/packages/adapter-evm-core/src/irs/index.ts` and add to `src/capabilities/index.ts` (and the package root `src/index.ts`)

**Checkpoint**: IRS capability passes its factory + behavioral tests; the IRS pre-check (the most-important shared helper) is adapter-side.

---

## Phase 5: User Story 3 - ERC-3643 (T-REX) token capability available to the adapter (Priority: P1)

**Goal**: `@openzeppelin/adapter-evm-core` implements `ERC3643Capability` (viem) — reads (`balanceOf`/`isVerified`/`isFrozen`/`getJurisdiction`/`simulateTransfer`) and writes (`mint`/`burn`/`transfer`/`freeze`/`unfreeze`) — with revert→typed-error mapping.

**Independent Test**: Construct against mocked RPC; assert reads decode correctly and `simulateTransfer` returns `{ allowed, modulesEvaluated }` / `{ allowed:false, blockingModule }`; assert each write produces correct calldata via mocked execution (SC-004).

**Depends on**: Phase 2 + US1; reuses the amount codec (T017). May reuse IRS reads (US2) for `isVerified`, but is independently testable.

### Tests for User Story 3 ⚠️

- [X] T023 [P] [US3] Factory-creation test for `createERC3643`, including an idempotent-`dispose()` assertion (FR-016), in `openzeppelin-adapters/packages/adapter-evm-core/src/erc3643/__tests__/erc3643.factory.test.ts`
- [X] T024 [P] [US3] Mocked-RPC read tests (balance/frozen/jurisdiction decode; `simulateTransfer` allowed + blocked shapes) in `openzeppelin-adapters/packages/adapter-evm-core/src/erc3643/__tests__/erc3643.reads.test.ts`
- [X] T025 [P] [US3] Mocked-execution write tests (`mint`/`burn`/`transfer`/`freeze`/`unfreeze` calldata), revert→typed-error mapping (`RecipientNotVerified`/`ComplianceModuleRejected`/`HolderFrozen`/`InsufficientBalance`), and a malformed-amount → `InvalidAmount` negative test (FR-003a), in `openzeppelin-adapters/packages/adapter-evm-core/src/erc3643/__tests__/erc3643.writes.test.ts`

### Implementation for User Story 3

- [X] T026 [P] [US3] Vendor + pin/document the T-REX (ERC-3643) token ABI under `openzeppelin-adapters/packages/adapter-evm-core/src/erc3643/abi.ts` with provenance header (FR-017, FR-017a). Signatures (`IToken`, `IModularCompliance`, `IModule`) verified verbatim against ERC-3643/ERC-3643 `main` on 2026-06-01.
- [X] T027 [US3] Implement viem onchain reader + service (incl. `simulateTransfer` compliance-module evaluation, amount codec from T017) in `openzeppelin-adapters/packages/adapter-evm-core/src/erc3643/onchain-reader.ts` and `service.ts`
- [X] T028 [US3] Implement write actions + revert→typed-error mapping in `openzeppelin-adapters/packages/adapter-evm-core/src/erc3643/actions.ts` + `error-mapping.ts` (FR-012, FR-012a). REFACTOR (done): shared write skeleton (run executor → catch → log → wrap-with-fallback) extracted to `shared/executor.ts` as `runCapabilityWrite(params, mapError)` (placed in `shared/` rather than `capabilities/helpers.ts` so services depend sideways, not up into the factory layer); `EvmIRSService.execute` refactored to use it. Per-capability error mapping stays local (`erc3643/error-mapping.ts`, IRS inline). The ERC-3643 mapper keyword set is aligned verbatim to the verified T-REX `require` strings, and additionally walks the viem error chain to recover structured `reason`/decoded custom-error `errorName` (+ optional raw-bytes decode against an extensible vendored custom-error ABI), folding the name into classification and surfacing the raw 4-byte selector in the fallback for diagnosis — so custom-error contracts are handled without revisiting.
- [X] T029 [US3] Implement `createERC3643(config, { signAndBroadcast })` factory in `openzeppelin-adapters/packages/adapter-evm-core/src/capabilities/erc3643.ts` (FR-009, FR-010a, FR-016). Reuses the shared `adaptSignAndBroadcast` + `SignAndBroadcast` helpers from `capabilities/helpers.ts` (added in US2) rather than re-implementing the executor adapter.
- [X] T030 [US3] Export from `openzeppelin-adapters/packages/adapter-evm-core/src/erc3643/index.ts` and add to `src/capabilities/index.ts` (+ root `src/index.ts`)

**Checkpoint**: ERC-3643 capability passes tests; the mutating-route chain layer is ready.

---

## Phase 6: User Story 5 - Server-side consumption via sub-path imports without UI dependencies (Priority: P1)

**Goal**: The three capabilities are reachable as sub-path exports (`@openzeppelin/adapter-evm/erc3643`, `/erc4626`, `/irs`), wired into `tsdown.config.ts` + `package.json` `exports` + public re-exports, and importable in plain Node with zero React/Wagmi.

**Independent Test**: Import each sub-path in a plain Node process (no bundler/DOM), construct a capability, and execute a representative read + a strategy-driven write against a mocked RPC/strategy; analyze each sub-path's transitive import graph and assert no React/Wagmi (SC-002, SC-003).

**Depends on**: US2 + US3 factories existing (and wires the `erc4626` sub-path used by US4). Sequenced P1 because the server-side plugin cannot consume the work otherwise.

### Tests for User Story 5 ⚠️

- [X] T031 [P] [US5] Node import-graph / no-React-Wagmi assertion test for the built sub-paths in `openzeppelin-adapters/packages/adapter-evm/test/ri-capabilities-subpath-isolation.test.ts` (FR-015, SC-003). Build-free static import-graph walk over the capability source subtree + thin re-exports (deterministic, no prior `pnpm build` needed); also confirmed against tree-shaken `dist/erc3643.mjs`/`dist/irs.mjs` (no react/wagmi/rainbowkit). `erc4626` deferred to Phase 7 (US4) — factory not yet implemented.
- [X] T032 [P] [US5] Node server-side integration test (no bundler/DOM, `@vitest-environment node`) that constructs each capability and executes one representative read (mocked RPC via the `public-client` seam) + one strategy-driven write (injected submit-then-poll `signAndBroadcast`) in `openzeppelin-adapters/packages/adapter-evm/test/ri-capabilities-subpath-runtime.test.ts` (SC-002). Imports the `adapter-evm-core` capability factories backing the sub-paths (mirrors `access-control-integration.test.ts`; barrel import pulls React in Node); sub-path resolution validated by the build (T038). `erc4626` deferred to Phase 7.

### Implementation for User Story 5

- [X] T033 [P] [US5] Add `erc3643`/`irs` entries to `openzeppelin-adapters/packages/adapter-evm-core/tsdown.config.ts` (+ companion `./erc3643`/`./irs` `exports` in `adapter-evm-core/package.json`, mirroring `access-control`). `erc4626` deferred to Phase 7 (factory ships in US4).
- [X] T034 [P] [US5] Create thin re-export modules `openzeppelin-adapters/packages/adapter-evm/src/capabilities/erc3643.ts`, `irs.ts` (re-export factories from `adapter-evm-core` barrel; `irs.ts` also re-exports `EvmIRSAddresses`) + barrel them in `src/capabilities/index.ts`. `erc4626.ts` deferred to Phase 7.
- [X] T035 [US5] Add `erc3643`/`irs` entries to `openzeppelin-adapters/packages/adapter-evm/tsdown.config.ts`. `erc4626` deferred to Phase 7.
- [X] T036 [US5] Add `./erc3643`/`./irs` `exports` entries (types + import + require shape) to `openzeppelin-adapters/packages/adapter-evm/package.json`. `erc4626` deferred to Phase 7.
- [ ] T037 [US5] DEFERRED — Re-export capabilities and register `erc3643`/`erc4626`/`irs` in `capabilityFactories` + `ecosystemDefinition.capabilities` (FR-014). BLOCKED by a type-contract mismatch: `CapabilityFactoryMap`'s `(config: NetworkConfig) => Capability` signature cannot supply the per-deployment construction options these factories require (`tokenAddress`/`addresses`/injected `signAndBroadcast`) — unlike `accessControl`, which takes its contract address per call. Per-deployment addresses do not belong in the shared `NetworkConfig`. The factories ARE reachable through the public `@openzeppelin/adapter-evm` package as named exports (`createERC3643`, `createIRS`) via `src/capabilities/index.ts`, satisfying FR-021 (sub-path / direct consumption). Map registration requires evolving the `@openzeppelin/ui-types` `CapabilityFactoryMap` signature — captured as follow-up issue [#42](https://github.com/OpenZeppelin/openzeppelin-adapters/issues/42). Do NOT add to any pre-composed profile (FR-021).
- [X] T038 [US5] Ran `pnpm validate:vite-configs` (pass), `pnpm lint:adapters` (pass), built `adapter-evm-core` + `adapter-evm` (new `dist/erc3643.*`/`dist/irs.*` emitted), typecheck + full test suites green (SC-007).

**Checkpoint**: Sub-paths resolve server-side with no UI deps and a read+write executes; the RI plugin can import them.

---

## Phase 7: User Story 4 - ERC-4626 vault capability available to the adapter (Priority: P2)

**Goal**: `@openzeppelin/adapter-evm-core` implements `ERC4626Capability` (viem) — `convertToAssets`/`convertToShares`/`totalAssets` reads and `deposit`/`withdraw` writes.

**Independent Test**: Construct against mocked RPC; assert conversions decode; assert `deposit`/`withdraw` build correct calldata via mocked execution and return shares/assets as `string` where available (SC-004).

**Depends on**: Phase 2 + US1; reuses the amount codec (T017). Wired into sub-paths created in US5 (T033–T037 already include `erc4626`).

### Tests for User Story 4 ⚠️

- [X] T039 [P] [US4] Factory-creation test for `createERC4626`, including an idempotent-`dispose()` assertion (FR-016), in `openzeppelin-adapters/packages/adapter-evm-core/src/erc4626/__tests__/erc4626.factory.test.ts`
- [X] T040 [P] [US4] Mocked-RPC read tests (`convertToAssets`/`convertToShares`/`totalAssets`) + mocked-execution write tests (`deposit`/`withdraw`, `InsufficientBalance`/`InsufficientShares`, and a malformed-amount → `InvalidAmount` negative test) in `openzeppelin-adapters/packages/adapter-evm-core/src/erc4626/__tests__/erc4626.behavior.test.ts`

### Implementation for User Story 4

- [X] T041 [P] [US4] Vendor + pin/document the ERC-4626 vault ABI under `openzeppelin-adapters/packages/adapter-evm-core/src/erc4626/abi.ts` with provenance header (FR-017, FR-017a). `IERC4626` signatures verified verbatim against OpenZeppelin Contracts `master` (`contracts/interfaces/IERC4626.sol`) + the finalized EIP-4626 on 2026-06-02. The capability's `withdraw({ from, shares })` takes a share quantity → maps to `redeem(shares, receiver, owner)` (not asset-denominated `withdraw`).
- [X] T042 [US4] Implement viem reader + service + write actions (amount codec from T017) in `openzeppelin-adapters/packages/adapter-evm-core/src/erc4626/onchain-reader.ts`, `service.ts`, `actions.ts` (+ `error-mapping.ts`, `types.ts`). REFACTOR (done): the viem revert-chain walker (`extractRevertInfo` + `includesAny`) was extracted from `erc3643/error-mapping.ts` into shared `shared/revert-info.ts` (parametrized by an optional custom-error ABI) and is now reused by both the ERC-3643 and ERC-4626 mappers; erc3643's existing error-mapping tests guard the refactor. `sharesIssued`/`amountReturned` are omitted on the EVM submit-then-poll path (txHash at submit time; contract VC-3 "where the receipt exposes them") — documented in the service.
- [X] T043 [US4] Implement `createERC4626(config, { signAndBroadcast })` factory in `openzeppelin-adapters/packages/adapter-evm-core/src/capabilities/erc4626.ts` (FR-009, FR-010a, FR-016). `vaultAddress` added to `CreateERC4626Options` (per-deployment address, consistent with `createERC3643`/`createIRS`).
- [X] T044 [US4] Export from `openzeppelin-adapters/packages/adapter-evm-core/src/erc4626/index.ts` and add to `src/capabilities/index.ts` (+ root `src/index.ts`). Wired the `erc4626` sub-path deferred in US5 (core+adapter `tsdown.config.ts` + `package.json` exports + adapter thin re-export) and added `erc4626` to the US5 isolation + runtime sub-path tests; built sub-path confirmed free of React/Wagmi imports.

**Checkpoint**: Vault capability passes tests; full demo loop (balance via `convertToAssets`) is supported.

---

## Phase 8: User Story 6 - Write path conforms to the existing execution-strategy extension point (Priority: P2)

**Goal**: Verify (not extend) that `ExecutionCapability.signAndBroadcast` + optional `waitForTransactionConfirmation(txHash)` — the injected-callback shape — accommodates async submit-then-poll, and that capabilities are strategy-agnostic with no Relayer-runtime coupling.

**Independent Test**: Implement a test injected `signAndBroadcast` that returns a hash then a poll-resolved confirmation, wire into one capability write, assert a confirmed result through the two-step flow; compose the same write with EOA + existing Relayer strategies (SC-006).

**Depends on**: At least one capability factory (US2/US3).

### Tests for User Story 6 ⚠️

- [ ] T045 [P] [US6] Submit-then-poll behavioral test (custom injected `signAndBroadcast` callback) wired to an ERC-3643 write in `openzeppelin-adapters/packages/adapter-evm-core/src/erc3643/__tests__/erc3643.execution-strategy.test.ts` (SC-006, FR-018)
- [ ] T046 [P] [US6] Strategy-agnostic test composing a capability write with `EoaExecutionStrategy` and the existing `RelayerExecutionStrategy` behind the injected callback in `openzeppelin-adapters/packages/adapter-evm-core/src/erc3643/__tests__/erc3643.strategies.test.ts`

### Implementation for User Story 6

- [ ] T047 [US6] Add a dependency-graph assertion that the adapter package contains no Relayer-plugin-runtime dependency (`PluginContext`, `api.sendTransaction`) in `openzeppelin-adapters/packages/adapter-evm/test/no-plugin-runtime-dep.test.ts` (FR-011, SC-005)
- [ ] T048 [US6] Record the FR-018 verification outcome (confirmed, per research.md R6) in the capability JSDoc / a short note in `openzeppelin-adapters/packages/adapter-evm-core/src/capabilities/` (no new primitive added)

**Checkpoint**: The load-bearing execution-contract assumption is verified and documented.

---

## Phase 9: User Story 7 - Capability factories tested and tier-isolation conformant (Priority: P2)

**Goal**: All three capabilities have factory + mocked-RPC coverage (consolidating US2–US4 tests) and pass tier-isolation conformance for the new sub-paths.

**Independent Test**: Run the adapter suite; confirm each capability has factory + behavioral coverage and the tier-isolation check passes for the three new sub-paths (SC-003, SC-004).

**Depends on**: US2, US3, US4, US5.

### Implementation for User Story 7

- [ ] T049 [US7] Ensure `pnpm lint:adapters` (Tier-1 isolation + capability export structure) passes for the three new capabilities; fix any conformance gaps (FR-020)
- [ ] T050 [US7] Add/confirm tier-isolation conformance assertions for `erc3643`/`erc4626`/`irs` sub-paths (no disallowed cross-tier or browser-only imports) consistent with existing capability checks (FR-020)
- [ ] T051 [US7] Run the full `openzeppelin-adapters` test suite and confirm SC-004 coverage (every read/write across the three capabilities has ≥1 passing mocked test)

**Checkpoint**: Conformance + coverage gates green.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Release readiness across both repos

- [ ] T052 [P] Add a Changeset (MINOR) in `openzeppelin-ui` for the new `@openzeppelin/ui-types` interfaces/types/errors
- [ ] T053 [P] Add Changesets (MINOR) in `openzeppelin-adapters` for `@openzeppelin/adapter-evm-core` + `@openzeppelin/adapter-evm`, listing pinned ABI source versions (FR-017a)
- [ ] T054 [P] Update `openzeppelin-adapters/packages/adapter-evm-core` README / ABI directory docs with the ABI refresh procedure + pinned versions (FR-017a)
- [ ] T055 [P] Update `docs/ADAPTER_ARCHITECTURE.md` (or capability docs) to list the three new capabilities and their sub-paths
- [ ] T056 Run `openzeppelin-adapters` `pnpm build && pnpm test && pnpm lint && pnpm typecheck && pnpm format:check` and the quickstart.md validation checklist end-to-end
- [ ] T057 Confirm the cross-repo release sequence (ui-types published first, then adapters) and version pins are in sync (FR-022, SC-007)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS US1 and everything after; the ui-types-first cross-repo gate (FR-022)
- **US1 (Phase 3)**: Depends on Phase 2 — BLOCKS all adapter stories (US2–US7); ship/link ui-types at its checkpoint
- **US2 (Phase 4)**: Depends on US1; T017 (shared amount codec) is produced here and reused by US3/US4
- **US3 (Phase 5)**: Depends on US1 + T017 — otherwise independent of US2; can run in parallel with US2 once T017 lands
- **US5 (Phase 6)**: Depends on US2 + US3 factories (and wires the `erc4626` sub-path used by US4)
- **US4 (Phase 7)**: Depends on US1 + T017; plugs into sub-paths wired in US5
- **US6 (Phase 8)**: Depends on ≥1 factory (US2/US3)
- **US7 (Phase 9)**: Depends on US2–US5
- **Polish (Phase 10)**: Depends on all desired stories complete

### Within Each User Story

- Tests written first and FAIL before implementation (Constitution VI)
- Shared amount codec (T017) → ABI vendoring → onchain reader/service → write actions → factory → exports
- Story complete (tests green) before moving to next priority

### Parallel Opportunities

- Setup: T001, T002 parallel
- Foundational: T004 parallel across the 3 type files; T005 parallel; T006 after
- US1: T008/T009/T010 parallel (different files); T011/T012 after
- US2 vs US3: parallelizable by different developers once US1 + T017 land
- Within a story: the `[P]` test tasks and ABI-vendoring run parallel to each other
- US5: T031/T032 (tests) and T033/T034 parallel
- Polish: T052/T053/T054/T055 parallel

---

## Parallel Example: User Story 1

```bash
# After Phase 2, author the three interfaces together (different files):
Task: "Define ERC3643Capability in .../capabilities/erc3643.ts"
Task: "Define ERC4626Capability in .../capabilities/erc4626.ts"
Task: "Define IRSCapability in .../capabilities/irs.ts"
```

## Parallel Example: User Stories 2 & 3 (two developers)

```bash
# Shared first: T017 amount codec (blocks both services)
# Then, Developer A — IRS (Phase 4):
Task: "createIRS factory + service + ABIs + tests"
# Developer B — ERC-3643 (Phase 5):
Task: "createERC3643 factory + service + ABI + tests"
```

---

## Implementation Strategy

### MVP First

1. Phase 1 Setup → Phase 2 Foundational → **Phase 3 US1** (interfaces). Publish/link ui-types.
2. **STOP and VALIDATE**: SC-001 type-check harness passes; the plugin team can type its `Capabilities` port (SC-008). This alone unblocks plugin Week 1.

### Incremental Delivery (critical path for the plugin)

1. US1 (types) → US2 (IRS pre-check, the key shared helper; produces the amount codec T017) + US3 (ERC-3643 spine) in parallel
2. US5 (server-side sub-paths + runtime read/write integration test) → plugin can import server-side
3. US4 (vault) → completes the demo loop
4. US6 (execution-contract verification) + US7 (conformance/coverage)
5. Polish (Changesets, docs, release sequence)

### Cross-repo note

US1 must be published (or pre-released) before US2–US7 can consume it (FR-022). Use local linking (T003) to develop adapter stories against the in-progress types before the ui-types release lands.

---

## Notes

- [P] = different files, no incomplete-task dependencies
- Tests are required by FR-019/FR-020 and precede implementation per Constitution VI
- Every write method reuses the injected `signAndBroadcast` contract — no `WalletCapability`, no new ui-types primitive
- All amounts cross the interface as base-unit `string`; the shared codec (T017) is the single place `string ↔ bigint` conversion + `InvalidAmount` rejection happens (DRY)
- Commit after each task or logical group; keep ui-types and adapter changes in their respective repos
- Avoid: leaking `viem`/`bigint` into `@openzeppelin/ui-types`; pulling React/Wagmi into a sub-path import graph; coupling the adapter to the Relayer plugin runtime; adding the capabilities to a pre-composed profile (not required — FR-021)
