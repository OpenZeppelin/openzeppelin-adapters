# Implementation Plan: RI POC Adapter Capabilities (ERC-3643 / ERC-4626 / IRS)

**Branch**: `002-ri-evm-capabilities` | **Date**: 2026-05-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-ri-evm-capabilities/spec.md`

## Summary

Add three new Tier 3 capabilities — `ERC3643Capability` (T-REX token), `ERC4626Capability` (vault), and `IRSCapability` (identity registry / ONCHAINID) — to the adapter stack so the Tokenized Deposits RI plugin can dispatch all on-chain mechanics through `openzeppelin-adapters` instead of hand-rolling chain wrappers. The work spans two repositories and follows the existing `AccessControlCapability` precedent end-to-end:

- **`@openzeppelin/ui-types`** (openzeppelin-ui) — define the three capability interfaces (each extending `RuntimeCapability`), their chain-agnostic domain types, and typed error classes; register optional entries in `CapabilityFactoryMap`.
- **`@openzeppelin/adapter-evm-core`** — implement viem-based services + capability factories (`createERC3643`, `createERC4626`, `createIRS`) that read over RPC and write through an injected `signAndBroadcast` execution callback (no `WalletCapability`, no React/Wagmi, no Relayer coupling); add sub-path exports and tsdown entries.
- **`@openzeppelin/adapter-evm`** — re-export the three capabilities, add them to `capabilityFactories`/`ecosystemDefinition.capabilities`, and add matching `package.json` exports + tsdown entries.

Amounts are base-unit decimal `string` at the interface boundary (factory converts `string ↔ bigint`). The async `AdapterExecutionStrategy` submit-then-poll model is verified (not extended) so the plugin's future `RelayerPluginExecutionStrategy` fits without a new primitive. No new smart contracts; capabilities bundle existing audited ABIs.

## Technical Context

**Language/Version**: TypeScript ^5.9 (strict mode), ES2020 target, ESM + CJS dual output
**Primary Dependencies**: `viem` ^2.x (EVM chain I/O); `@openzeppelin/ui-types` (interfaces), `@openzeppelin/ui-utils` (`logger`, validation); `tsdown` (build); `vitest` (test). NO `wagmi`/React in the new capabilities' import graphs.
**Storage**: N/A — capabilities are stateless beyond per-instance runtime context; off-chain state (KV) lives in the consuming plugin, out of scope.
**Testing**: Vitest — factory-creation tests + mocked-RPC behavioral tests per read/write method; tier-isolation conformance via `lint:adapters` / sub-path import-graph checks.
**Target Platform**: Node/server-side (the RI plugin runs inside the OZ Relayer) AND browser bundlers (existing adapter consumers). Sub-path imports MUST resolve in plain Node with no DOM.
**Project Type**: Multi-package TypeScript monorepo libraries across two repos (openzeppelin-ui types package + openzeppelin-adapters EVM packages).
**Performance Goals**: No regression to adapter build time / `dist` size beyond the per-capability sub-path cost (consistent with the 001 spec's NFR-001/002 envelope: ≤2x build time vs. pre-entry-point baseline, ≤30% dist growth per added entry).
**Constraints**: Tier 3 capabilities; writes depend only on injected `signAndBroadcast` (mirrors `createAccessControl(config, { signAndBroadcast })`); chain-agnostic types only in `@openzeppelin/ui-types` (no `viem` leakage); adapter MUST NOT depend on the Relayer plugin runtime (`PluginContext`, `api.sendTransaction`).
**Scale/Scope**: 3 capability interfaces + supporting types/errors in ui-types; 3 viem services + 3 capability factories + ABIs in adapter-evm-core; re-exports + packaging in adapter-evm. ~5–6 days adapter-side per the POC proposal; interfaces locked first, reads before writes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Capability-Compliant, Adapter-Led Architecture | PASS | Three new capabilities implement interfaces defined in `@openzeppelin/ui-types`; factories live in `adapter-evm-core`, re-exported by `adapter-evm` via sub-path exports; registered in `CapabilityFactoryMap`/`ecosystemDefinition`. Mirrors the `AccessControlCapability` reference. |
| II. Chain-Specific Encapsulation | PASS | All ERC-3643/4626/IRS viem logic + ABIs live inside the adapter; interfaces stay chain-agnostic (amounts as `string`). No cross-adapter SDK imports. RPC URLs resolved via existing config, never hardcoded. |
| III. Type Safety & Code Quality | PASS | Strict TS, no `any` without justification; `logger` over `console`; JSDoc on all new public interfaces/factories/errors. |
| IV. Consumer-First API Design | PASS | Capability interface additions are coordinated with `openzeppelin-ui` (types-first release). New (additive) capabilities → MINOR; no breaking change to existing APIs. Validated against the real RI plugin consumer scenario. |
| V. Shared Core & Reuse-First | PASS | Reuses `RuntimeCapability`, `ExecutionConfig`, `guardRuntimeCapability`, `asTypedEvmNetworkConfig`, `resolveRpcUrl`, the access-control service/executor pattern, and shared error-class base. New types in `@openzeppelin/ui-types` only (single source of truth). |
| VI. Testing & TDD | PASS | TDD for all service/factory logic (failing test → minimal impl → refactor); Vitest per package; IRS pre-check tests live in the adapter repo per the spec. |
| VII. Packaging, Build Integration & Release | PASS | pnpm workspace; tsdown entries + `package.json` `exports` per sub-path; Changesets MINOR bump for `@openzeppelin/ui-types`, `@openzeppelin/adapter-evm-core`, `@openzeppelin/adapter-evm`; explicit named exports (no new barrels causing tree-shaking issues). |

**Additional constraints**: dependency arrow stays one-directional (adapters → ui-types, never the reverse); contract comparisons N/A; no secrets hardcoded; the new server-side capabilities introduce no React/Wagmi to other adapters' bundles.

**Result**: PASS — no violations. Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/002-ri-evm-capabilities/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output — capability interface contracts
│   ├── erc3643-capability.md
│   ├── erc4626-capability.md
│   └── irs-capability.md
├── checklists/
│   └── requirements.md  # Spec quality checklist (already present)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

This feature touches two repositories. Real directories below.

**Repo A — `openzeppelin-ui` (`@openzeppelin/ui-types`)**

```text
packages/types/src/adapters/
├── capabilities/
│   ├── erc3643.ts            # NEW — ERC3643Capability interface
│   ├── erc4626.ts            # NEW — ERC4626Capability interface
│   ├── irs.ts                # NEW — IRSCapability interface
│   └── index.ts              # UPDATE — re-export the three interfaces
├── erc3643.ts                # NEW — ERC-3643 domain types (TransferSimulationResult, etc.)
├── erc4626.ts                # NEW — ERC-4626 domain types
├── irs.ts                    # NEW — IRS/ONCHAINID domain types (claim, jurisdiction, identity)
├── ri-capability-errors.ts   # NEW — typed error classes (base + per-condition)
├── runtime.ts                # UPDATE — add 3 optional CapabilityFactoryMap entries (+ optional EcosystemRuntime accessors)
└── index.ts                  # UPDATE — export new domain types + errors
```

**Repo B — `openzeppelin-adapters` (`@openzeppelin/adapter-evm-core` + `@openzeppelin/adapter-evm`)**

```text
packages/adapter-evm-core/src/
├── erc3643/                  # NEW — service.ts, actions.ts, onchain-reader.ts, abi.ts, types.ts, index.ts, __tests__/
├── erc4626/                  # NEW — service.ts, actions.ts, onchain-reader.ts, abi.ts, types.ts, index.ts, __tests__/
├── irs/                      # NEW — service.ts, actions.ts, onchain-reader.ts, abi/ (IRS, ONCHAINID, ClaimTopics, TrustedIssuers, IdentityVerifier), claim-payload.ts, types.ts, index.ts, __tests__/
├── capabilities/
│   ├── erc3643.ts            # NEW — createERC3643(config, { signAndBroadcast })
│   ├── erc4626.ts            # NEW — createERC4626(config, { signAndBroadcast })
│   ├── irs.ts                # NEW — createIRS(config, { signAndBroadcast })
│   ├── helpers.ts            # REUSE — asTypedEvmNetworkConfig, guardRuntimeCapability
│   └── index.ts              # UPDATE — export 3 new factories
├── index.ts                  # UPDATE — re-export factories/types
└── tsdown.config.ts          # UPDATE — add erc3643/erc4626/irs entries

packages/adapter-evm/
├── src/index.ts              # UPDATE — re-export capabilities + add to capabilityFactories/ecosystemDefinition
├── src/capabilities/         # NEW thin re-export modules: erc3643.ts, erc4626.ts, irs.ts (re-export from evm-core)
├── tsdown.config.ts          # UPDATE — add erc3643/erc4626/irs entries
└── package.json              # UPDATE — add ./erc3643, ./erc4626, ./irs exports
```

**Structure Decision**: Follow the `AccessControlCapability` topology exactly — interfaces + types + errors in `@openzeppelin/ui-types`; viem service modules (`src/<domain>/`) wrapped by thin capability factories (`src/capabilities/<domain>.ts`) in `adapter-evm-core`; sub-path re-exports through `adapter-evm`. This maximizes reuse (Principle V) and satisfies the constitution's mandate that all new adapters mirror the EVM reference structure. The `adapter-stellar` equivalents are explicitly out of scope (future chain work).

## Complexity Tracking

> No constitution violations — section intentionally empty.
