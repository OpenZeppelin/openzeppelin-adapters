# Implementation Plan: Capability-Based Adapter Architecture

**Branch**: `001-capability-adapters` | **Date**: 2026-03-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-capability-adapters/spec.md`

## Summary

Decompose the monolithic `ContractAdapter` interface into 13 composable capability interfaces organized in 3 tiers, with 5 pre-composed profiles for common app archetypes. Capability interfaces are defined in `@openzeppelin/ui-types` (single source of truth), implemented in adapter packages under `src/capabilities/` with physical isolation via sub-path exports, and consumed directly or through profile runtimes with dispose-and-recreate lifecycle. This is a coordinated breaking change across the ecosystem — no backward compatibility. After the initial rollout lands, a follow-on wave migrates `adapter-polkadot`, `adapter-solana`, and `adapter-midnight` to the same package surface.

## Technical Context

**Language/Version**: TypeScript ^5.9.x (strict mode), ES2020 target, ESM packages  
**Primary Dependencies**: wagmi/viem/RainbowKit (EVM), @stellar/stellar-sdk + stellar-wallets-kit (Stellar), React 19, @openzeppelin/relayer-sdk  
**Storage**: N/A (no persistent storage — adapters are stateless library code with in-memory runtime state)  
**Testing**: Vitest 3.x with jsdom, @vitejs/plugin-react, v8 coverage  
**Target Platform**: Browser (Vite consumer apps), Node ≥20.19 for tooling  
**Project Type**: Library (npm packages in pnpm monorepo)  
**Build**: tsdown (dual ESM .mjs / CJS .cjs + .d.mts/.d.cts), per-adapter Vite config exports  
**Performance Goals**: Tier 1 imports must not pull Tier 2/3 dependencies — zero-cost abstraction for lightweight consumers  
**Constraints**: Physical sub-path isolation (not tree-shaking-dependent); dispose-and-recreate on network switch (no mutable state)  
**Scale/Scope**: 6 adapter packages across two waves (initial: adapter-evm-core, adapter-evm, adapter-stellar; follow-on: adapter-polkadot, adapter-solana, adapter-midnight), 1 types package updated, 3 consumer apps migrated (UI Builder, Role Manager, RWA Wizard), shared UI component packages updated

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Phase 0 Evaluation

| # | Principle | Status | Notes |
|---|-----------|--------|-------|
| I | Interface-Compliant, Adapter-Led Architecture | **VIOLATION — JUSTIFIED, WAIVER GRANTED** | Constitution mandates `ContractAdapter` interface compliance. This spec *replaces* `ContractAdapter` with 13 capability interfaces. This is intentional — the refactoring is the feature. **Waiver is active from Phase 2 onward.** Constitution amendment tracked in T125 (Phase 9). |
| II | Chain-Specific Encapsulation | **PASS** | Capability decomposition preserves chain encapsulation — each adapter implements capabilities internally. Sub-path isolation strengthens this principle. |
| III | Type Safety & Code Quality | **PASS** | All capability interfaces defined in `@openzeppelin/ui-types` with strict TypeScript. `RuntimeCapability` base enforces `readonly networkConfig`. |
| IV | Consumer-First API Design | **PASS** | Breaking change follows constitution protocol: coordinated with maintainers, conventional commits, migration documentation. Narrow capability props improve consumer DX. |
| V | Shared Core & Reuse-First Development | **PASS** | `adapter-evm-core` remains the shared EVM logic home. Capabilities promote reuse by sharing internal state via factories. Interfaces in `ui-types` as single source of truth. |
| VI | Testing & Test-Driven Development | **PASS** | Vitest remains the standard runner. Per-capability conformance test suites are a stretch goal. Existing test patterns apply to capability modules. |
| VII | Packaging, Build & Release | **PASS** | pnpm workspace, tsdown builds, Changesets versioning all preserved. Sub-path exports in `package.json` follow existing `exports` patterns. Major version bump required per constitution. |

**Gate Result**: PASS (1 justified violation — Principle I is the target of the refactoring itself)

## Project Structure

### Documentation (this feature)

```text
specs/001-capability-adapters/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output — interface contracts
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
# Types package (openzeppelin-ui repo)
packages/types/src/adapters/
├── capabilities/              # NEW — 13 capability interfaces
│   ├── addressing.ts
│   ├── explorer.ts
│   ├── network-catalog.ts
│   ├── ui-labels.ts
│   ├── contract-loading.ts
│   ├── schema.ts
│   ├── type-mapping.ts
│   ├── query.ts
│   ├── execution.ts
│   ├── wallet.ts
│   ├── ui-kit.ts
│   ├── relayer.ts
│   └── access-control.ts
├── profiles/                  # NEW — 5 profile types
│   ├── declarative.ts
│   ├── viewer.ts
│   ├── transactor.ts
│   ├── composer.ts
│   └── operator.ts
├── runtime.ts                 # NEW — RuntimeCapability, EcosystemRuntime
├── ecosystem-export.ts        # MODIFIED — capabilities map + createRuntime
├── base.ts                    # REMOVED — ContractAdapter interface deleted
└── index.ts                   # MODIFIED — re-export new structure

# Adapter packages (openzeppelin-adapters repo)
packages/adapter-evm-core/src/
├── capabilities/              # NEW — EVM capability implementations
│   ├── addressing.ts
│   ├── explorer.ts
│   ├── network-catalog.ts
│   ├── ui-labels.ts
│   ├── contract-loading.ts
│   ├── schema.ts
│   ├── type-mapping.ts
│   ├── query.ts
│   ├── execution.ts
│   ├── wallet.ts
│   ├── ui-kit.ts
│   ├── relayer.ts
│   └── access-control.ts
├── profiles/                  # NEW — EVM profile factories
│   ├── declarative.ts
│   ├── viewer.ts
│   ├── transactor.ts
│   ├── composer.ts
│   └── operator.ts
├── abi/                       # EXISTING — reused by capabilities
├── access-control/            # EXISTING → wrapped by access-control capability
├── configuration/             # EXISTING → used by capabilities
├── mapping/                   # EXISTING → used by type-mapping capability
├── proxy/                     # EXISTING → used by contract-loading capability
├── query/                     # EXISTING → wrapped by query capability
├── transaction/               # EXISTING → wrapped by execution capability
├── transform/                 # EXISTING → used by schema capability
├── validation/                # EXISTING → used by addressing capability
├── wallet/                    # EXISTING → wrapped by wallet capability
└── index.ts                   # MODIFIED — export capabilities + profiles

packages/adapter-evm/
├── src/                       # SIMPLIFIED — re-exports from adapter-evm-core
│   ├── index.ts               # MODIFIED — re-export capabilities
│   ├── metadata.ts            # EXISTING
│   ├── networks.ts            # EXISTING
│   └── config.ts              # EXISTING
├── package.json               # MODIFIED — 13 capability + 5 profile sub-path exports
└── adapter.ts                 # REMOVED — monolithic EvmAdapter deleted

packages/adapter-stellar/src/
├── capabilities/              # NEW — Stellar capability implementations
│   └── (same structure as evm-core/capabilities/)
├── profiles/                  # NEW — Stellar profile factories
│   └── (same structure as evm-core/profiles/)
├── access-control/            # EXISTING → wrapped by capability
├── contract/                  # EXISTING → used by capabilities
├── mapping/                   # EXISTING → used by capabilities
├── query/                     # EXISTING → wrapped by capability
├── transaction/               # EXISTING → wrapped by capability
├── wallet/                    # EXISTING → wrapped by capability
└── adapter.ts                 # REMOVED — monolithic StellarAdapter deleted
```

**Structure Decision**: Multi-package monorepo with pnpm workspaces. Changes span two repositories (openzeppelin-ui for types, openzeppelin-adapters for implementations). Each adapter package gains `src/capabilities/` and `src/profiles/` directories. Existing internal modules are preserved and wrapped by capability implementations. The same directory pattern is applied in a follow-on migration wave to `adapter-polkadot`, `adapter-solana`, and `adapter-midnight`, with partial capability support allowed where profiles are not fully implementable yet.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principle I: Removing `ContractAdapter` | The refactoring *is* the feature — decomposing the monolithic interface into capabilities. | Keeping `ContractAdapter` alongside capabilities would create two parallel API surfaces, violating KISS and adding maintenance burden with no backward-compat requirement. |

## Constitution Check — Post-Design Re-Evaluation

| # | Principle | Status | Design Impact |
|---|-----------|--------|---------------|
| I | Interface-Compliant, Adapter-Led Architecture | **VIOLATION — JUSTIFIED, WAIVER GRANTED** | Unchanged. `ContractAdapter` is replaced by 13 capability interfaces. **Waiver is active from Phase 2 onward.** Constitution amendment tracked in T125 (Phase 9 / quickstart Phase E). |
| II | Chain-Specific Encapsulation | **PASS** | Design strengthens this: sub-path isolation enforces chain-specific code stays in adapter packages. Capability modules wrap existing chain-internal code. |
| III | Type Safety & Code Quality | **PASS** | All new interfaces use strict TypeScript. `RuntimeCapability` base enforces `readonly networkConfig`. New error classes (`RuntimeDisposedError`, `UnsupportedProfileError`) provide clear error messages. |
| IV | Consumer-First API Design | **PASS** | Design follows constitution protocol for breaking changes: coordinated across repos, conventional commits, migration guide in quickstart. Consumer DX improves with narrower props. |
| V | Shared Core & Reuse-First Development | **PASS** | `adapter-evm-core` preserves shared EVM logic. Capability implementations wrap existing modules — no rewrite, just restructuring. Existing internal modules (`validation/`, `transaction/`, `wallet/`) are reused. |
| VI | Testing & Test-Driven Development | **PASS** | Vitest stays. Each capability module is independently testable. Profile factories testable via composition. Import-graph tests validate tier isolation. |
| VII | Packaging, Build & Release | **PASS** | tsdown multi-entry pattern is proven (already 5 entries per adapter). Adding 18 more entries follows identical pattern. Sub-path exports in `package.json` use the existing dual ESM/CJS structure. Major version bump via Changesets. |

**Post-Design Gate Result**: PASS — No new violations introduced by the design. The single justified violation (Principle I) remains and is addressed by the constitution amendment in Phase E.
