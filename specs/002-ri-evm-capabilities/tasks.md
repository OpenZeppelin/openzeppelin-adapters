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

- [ ] T001 [P] In `openzeppelin-ui`, confirm the local build/test loop for `@openzeppelin/ui-types` (`pnpm --filter @openzeppelin/ui-types build` / `test`) runs clean on the feature branch
- [ ] T002 [P] In `openzeppelin-adapters`, confirm `pnpm build`, `pnpm test`, `pnpm lint:adapters`, and `pnpm typecheck` run clean on `002-ri-evm-capabilities`
- [ ] T003 Configure local cross-repo linking so `adapter-evm-core` resolves the in-progress `@openzeppelin/ui-types` (per `LOCAL_ADAPTERS_PATH` / `docs/LOCAL_DEVELOPMENT.md`) so adapter work can type-check against the new interfaces before publish

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared chain-agnostic types + error model in `@openzeppelin/ui-types` that ALL three capabilities and all adapter stories depend on. This is the hard cross-repo gate (FR-022: ui-types lands first).

**⚠️ CRITICAL**: No adapter-story (US2–US7) work can begin until this phase is complete and the types are consumable (published or locally linked).

- [ ] T004 [P] Create the common `Amount` alias + `OnboardingClaim` + `ClaimPayload` + `IdentityRegistration` + `OnchainIdLookup` + `TransferSimulationResult` types in `openzeppelin-ui/packages/types/src/adapters/erc3643.ts`, `erc4626.ts`, `irs.ts` (per data-model.md) with JSDoc
- [ ] T005 Create the typed error model in `openzeppelin-ui/packages/types/src/adapters/ri-capability-errors.ts`: abstract `RICapabilityError` base + the 8 concrete classes with stable codes/detail fields per FR-012a (mirror `access-control-errors.ts`)
- [ ] T006 Export the new domain types + error classes from `openzeppelin-ui/packages/types/src/adapters/index.ts` (additive; alongside `access-control` / `access-control-errors`)

**Checkpoint**: Shared types/errors exist — capability interfaces (US1) can be authored on top.

---

## Phase 3: User Story 1 - Capability interfaces defined in the shared types package (Priority: P1) 🎯 MVP

**Goal**: `ERC3643Capability`, `ERC4626Capability`, `IRSCapability` exist in `@openzeppelin/ui-types`, each extending `RuntimeCapability`, with optional `CapabilityFactoryMap` entries — the foundation everything downstream types against.

**Independent Test**: Import the three interfaces in a type-check harness, declare a stub satisfying each, and confirm `@openzeppelin/ui-types` builds and type-checks with zero adapter code present (SC-001).

### Tests for User Story 1 ⚠️

- [ ] T007 [P] [US1] Add a type-level conformance test (stub-implements-interface) for all three capabilities in `openzeppelin-ui/packages/types/src/adapters/__tests__/ri-capabilities.types.test.ts` (must fail until interfaces exist)

### Implementation for User Story 1

- [ ] T008 [P] [US1] Define `ERC3643Capability` in `openzeppelin-ui/packages/types/src/adapters/capabilities/erc3643.ts` — reads `balanceOf`/`isVerified`/`isFrozen`/`getJurisdiction`/`simulateTransfer`, writes `mint`/`burn`/`transfer`/`freeze`/`unfreeze`; amounts as `Amount`; writes accept `ExecutionConfig` + optional status callback + runtime API key (FR-006, FR-003a, FR-004)
- [ ] T009 [P] [US1] Define `ERC4626Capability` in `openzeppelin-ui/packages/types/src/adapters/capabilities/erc4626.ts` — reads `convertToAssets`/`convertToShares`/`totalAssets`, writes `deposit`/`withdraw` (with optional `sharesIssued`/`amountReturned` as `Amount`) (FR-007)
- [ ] T010 [P] [US1] Define `IRSCapability` in `openzeppelin-ui/packages/types/src/adapters/capabilities/irs.ts` — reads `getOnchainId`(→`OnchainIdLookup`)/`isVerified`/`getJurisdiction`, pure `buildClaimPayload`, writes `deployOnchainId`/`registerTrustedIssuer`/`attachClaim`/`registerIdentity` (FR-008, FR-008a, FR-008b, FR-008c)
- [ ] T011 [US1] Re-export the three interfaces from `openzeppelin-ui/packages/types/src/adapters/capabilities/index.ts` (alongside `AccessControlCapability`)
- [ ] T012 [US1] Add optional `erc3643?`/`erc4626?`/`irs?` factory entries to `CapabilityFactoryMap` and optional accessors to `EcosystemRuntime` in `openzeppelin-ui/packages/types/src/adapters/runtime.ts` (FR-005)
- [ ] T013 [US1] Run `@openzeppelin/ui-types` build + type-check; ensure T007 passes and the package exports the new surface

**Checkpoint**: Interfaces are stable and consumable (SC-008). Publish ui-types as a MINOR / pre-release so adapter stories can link (FR-022). This is the MVP for the plugin team to start typing their `Capabilities` port.

---

## Phase 4: User Story 2 - IRS / identity capability available to the adapter (Priority: P1)

**Goal**: `@openzeppelin/adapter-evm-core` implements `IRSCapability` (viem) — ONCHAINID lookup, identity registration, claim attachment, trusted-issuer registration, `isVerified` pre-check, jurisdiction reads — consuming the injected `signAndBroadcast`.

**Independent Test**: Construct against mocked RPC; assert `isVerified` true/false for known holders; assert identity-registration / claim-attachment write paths produce correct calldata against a mocked execution callback; no live chain (SC-002, SC-004).

**Depends on**: Phase 2 + US1 (types).

### Tests for User Story 2 ⚠️

- [ ] T014 [P] [US2] Factory-creation test for `createIRS(config, { signAndBroadcast })` in `openzeppelin-adapters/packages/adapter-evm-core/src/irs/__tests__/irs.factory.test.ts`
- [ ] T015 [P] [US2] Mocked-RPC behavioral tests for reads (`isVerified` true/false, `getOnchainId` found/not-found, `getJurisdiction`) in `openzeppelin-adapters/packages/adapter-evm-core/src/irs/__tests__/irs.reads.test.ts` (FR-019 — IRS pre-check tests live in the adapter repo)
- [ ] T016 [P] [US2] Mocked-execution behavioral tests for writes (`deployOnchainId`, idempotent `registerTrustedIssuer`, pre-signed `attachClaim`, `registerIdentity` → `IdentityAlreadyRegistered` on re-run) + pure `buildClaimPayload` determinism in `openzeppelin-adapters/packages/adapter-evm-core/src/irs/__tests__/irs.writes.test.ts`

### Implementation for User Story 2

- [ ] T017 [P] [US2] Vendor + pin/document ABIs (IRS/IdentityRegistry, ONCHAINID, ClaimTopics, TrustedIssuersRegistry, IdentityVerifier) under `openzeppelin-adapters/packages/adapter-evm-core/src/irs/abi/` with source-repo + tag/commit + contract-name headers (FR-017, FR-017a)
- [ ] T018 [US2] Implement the viem onchain reader + service in `openzeppelin-adapters/packages/adapter-evm-core/src/irs/onchain-reader.ts` and `service.ts` (reads over RPC; `string ↔ bigint` boundary; map reverts → typed errors)
- [ ] T019 [US2] Implement write actions + pre-signed claim handling + key-free `buildClaimPayload` in `openzeppelin-adapters/packages/adapter-evm-core/src/irs/actions.ts` and `claim-payload.ts` (FR-008a — no issuer key)
- [ ] T020 [US2] Implement `createIRS(config, { signAndBroadcast })` factory in `openzeppelin-adapters/packages/adapter-evm-core/src/capabilities/irs.ts` (mirror `createAccessControl`; wrap with `guardRuntimeCapability`; reuse `asTypedEvmNetworkConfig`) (FR-009, FR-010, FR-010a, FR-016)
- [ ] T021 [US2] Export `createIRS` + types from `openzeppelin-adapters/packages/adapter-evm-core/src/irs/index.ts` and add to `src/capabilities/index.ts`

**Checkpoint**: IRS capability passes its factory + behavioral tests; the IRS pre-check (the most-important shared helper) is adapter-side.

---

## Phase 5: User Story 3 - ERC-3643 (T-REX) token capability available to the adapter (Priority: P1)

**Goal**: `@openzeppelin/adapter-evm-core` implements `ERC3643Capability` (viem) — reads (`balanceOf`/`isVerified`/`isFrozen`/`getJurisdiction`/`simulateTransfer`) and writes (`mint`/`burn`/`transfer`/`freeze`/`unfreeze`) — with revert→typed-error mapping.

**Independent Test**: Construct against mocked RPC; assert reads decode correctly and `simulateTransfer` returns `{ allowed, modulesEvaluated }` / `{ allowed:false, blockingModule }`; assert each write produces correct calldata via mocked execution (SC-004).

**Depends on**: Phase 2 + US1. May reuse IRS reads (US2) for `isVerified`, but is independently testable.

### Tests for User Story 3 ⚠️

- [ ] T022 [P] [US3] Factory-creation test for `createERC3643` in `openzeppelin-adapters/packages/adapter-evm-core/src/erc3643/__tests__/erc3643.factory.test.ts`
- [ ] T023 [P] [US3] Mocked-RPC read tests (balance/frozen/jurisdiction decode; `simulateTransfer` allowed + blocked shapes) in `openzeppelin-adapters/packages/adapter-evm-core/src/erc3643/__tests__/erc3643.reads.test.ts`
- [ ] T024 [P] [US3] Mocked-execution write tests (`mint`/`burn`/`transfer`/`freeze`/`unfreeze` calldata) + revert→typed-error mapping (`RecipientNotVerified`/`ComplianceModuleRejected`/`HolderFrozen`/`InsufficientBalance`) in `openzeppelin-adapters/packages/adapter-evm-core/src/erc3643/__tests__/erc3643.writes.test.ts`

### Implementation for User Story 3

- [ ] T025 [P] [US3] Vendor + pin/document the T-REX (ERC-3643) token ABI under `openzeppelin-adapters/packages/adapter-evm-core/src/erc3643/abi.ts` with provenance header (FR-017, FR-017a)
- [ ] T026 [US3] Implement viem onchain reader + service (incl. `simulateTransfer` compliance-module evaluation, amount `string ↔ bigint`) in `openzeppelin-adapters/packages/adapter-evm-core/src/erc3643/onchain-reader.ts` and `service.ts`
- [ ] T027 [US3] Implement write actions + revert→typed-error mapping in `openzeppelin-adapters/packages/adapter-evm-core/src/erc3643/actions.ts` (FR-012, FR-012a)
- [ ] T028 [US3] Implement `createERC3643(config, { signAndBroadcast })` factory in `openzeppelin-adapters/packages/adapter-evm-core/src/capabilities/erc3643.ts` (FR-009, FR-010a, FR-016)
- [ ] T029 [US3] Export from `openzeppelin-adapters/packages/adapter-evm-core/src/erc3643/index.ts` and add to `src/capabilities/index.ts`

**Checkpoint**: ERC-3643 capability passes tests; the mutating-route chain layer is ready.

---

## Phase 6: User Story 5 - Server-side consumption via sub-path imports without UI dependencies (Priority: P1)

**Goal**: The three capabilities are reachable as sub-path exports (`@openzeppelin/adapter-evm/erc3643`, `/erc4626`, `/irs`), wired into `tsdown.config.ts` + `package.json` `exports` + public re-exports, and importable in plain Node with zero React/Wagmi.

**Independent Test**: Import each sub-path in a plain Node process (no bundler/DOM) and construct a capability; analyze each sub-path's transitive import graph and assert no React/Wagmi (SC-002, SC-003).

**Depends on**: US2 + US3 factories existing (US4 sub-path is finalized in Phase 7 but wired here). Sequenced P1 because the server-side plugin cannot consume the work otherwise.

### Tests for User Story 5 ⚠️

- [ ] T030 [P] [US5] Node import-graph / no-React-Wagmi assertion test for the three built sub-paths in `openzeppelin-adapters/packages/adapter-evm/test/ri-capabilities-subpath-isolation.test.ts` (FR-015, SC-003)

### Implementation for User Story 5

- [ ] T031 [P] [US5] Add `erc3643`/`erc4626`/`irs` entries to `openzeppelin-adapters/packages/adapter-evm-core/tsdown.config.ts`
- [ ] T032 [P] [US5] Create thin re-export modules `openzeppelin-adapters/packages/adapter-evm/src/capabilities/erc3643.ts`, `erc4626.ts`, `irs.ts` (re-export factories from `adapter-evm-core`)
- [ ] T033 [US5] Add `erc3643`/`erc4626`/`irs` entries to `openzeppelin-adapters/packages/adapter-evm/tsdown.config.ts`
- [ ] T034 [US5] Add `./erc3643`/`./erc4626`/`./irs` `exports` entries (types + import + require shape) to `openzeppelin-adapters/packages/adapter-evm/package.json`
- [ ] T035 [US5] Re-export capabilities and add `erc3643`/`erc4626`/`irs` to `capabilityFactories` + `ecosystemDefinition.capabilities` in `openzeppelin-adapters/packages/adapter-evm/src/index.ts` and `src/profiles` wiring (FR-014, FR-021)
- [ ] T036 [US5] Run the repo export/vite-config validation (`pnpm validate:vite-configs` + equivalent) and confirm it passes with the new entries (SC-007)

**Checkpoint**: Sub-paths resolve server-side with no UI deps; the RI plugin can import them.

---

## Phase 7: User Story 4 - ERC-4626 vault capability available to the adapter (Priority: P2)

**Goal**: `@openzeppelin/adapter-evm-core` implements `ERC4626Capability` (viem) — `convertToAssets`/`convertToShares`/`totalAssets` reads and `deposit`/`withdraw` writes.

**Independent Test**: Construct against mocked RPC; assert conversions decode; assert `deposit`/`withdraw` build correct calldata via mocked execution and return shares/assets as `string` where available (SC-004).

**Depends on**: Phase 2 + US1. Wired into sub-paths created in US5 (T031–T035 already include `erc4626`).

### Tests for User Story 4 ⚠️

- [ ] T037 [P] [US4] Factory-creation test for `createERC4626` in `openzeppelin-adapters/packages/adapter-evm-core/src/erc4626/__tests__/erc4626.factory.test.ts`
- [ ] T038 [P] [US4] Mocked-RPC read tests (`convertToAssets`/`convertToShares`/`totalAssets`) + mocked-execution write tests (`deposit`/`withdraw`, `InsufficientBalance`/`InsufficientShares`) in `openzeppelin-adapters/packages/adapter-evm-core/src/erc4626/__tests__/erc4626.behavior.test.ts`

### Implementation for User Story 4

- [ ] T039 [P] [US4] Vendor + pin/document the ERC-4626 vault ABI under `openzeppelin-adapters/packages/adapter-evm-core/src/erc4626/abi.ts` with provenance header (FR-017, FR-017a)
- [ ] T040 [US4] Implement viem reader + service + write actions (amount `string ↔ bigint`) in `openzeppelin-adapters/packages/adapter-evm-core/src/erc4626/onchain-reader.ts`, `service.ts`, `actions.ts`
- [ ] T041 [US4] Implement `createERC4626(config, { signAndBroadcast })` factory in `openzeppelin-adapters/packages/adapter-evm-core/src/capabilities/erc4626.ts` (FR-009, FR-010a, FR-016)
- [ ] T042 [US4] Export from `openzeppelin-adapters/packages/adapter-evm-core/src/erc4626/index.ts` and add to `src/capabilities/index.ts`; confirm the `erc4626` sub-path wired in US5 resolves

**Checkpoint**: Vault capability passes tests; full demo loop (balance via `convertToAssets`) is supported.

---

## Phase 8: User Story 6 - Write path conforms to the existing execution-strategy extension point (Priority: P2)

**Goal**: Verify (not extend) that `ExecutionCapability.signAndBroadcast` + optional `waitForTransactionConfirmation(txHash)` — the injected-callback shape — accommodates async submit-then-poll, and that capabilities are strategy-agnostic with no Relayer-runtime coupling.

**Independent Test**: Implement a test injected `signAndBroadcast` that returns a hash then a poll-resolved confirmation, wire into one capability write, assert a confirmed result through the two-step flow; compose the same write with EOA + existing Relayer strategies (SC-006).

**Depends on**: At least one capability factory (US2/US3).

### Tests for User Story 6 ⚠️

- [ ] T043 [P] [US6] Submit-then-poll behavioral test (custom injected callback) wired to an ERC-3643 write in `openzeppelin-adapters/packages/adapter-evm-core/src/erc3643/__tests__/erc3643.execution-strategy.test.ts` (SC-006, FR-018)
- [ ] T044 [P] [US6] Strategy-agnostic test composing a capability write with `EoaExecutionStrategy` and the existing `RelayerExecutionStrategy` in `openzeppelin-adapters/packages/adapter-evm-core/src/erc3643/__tests__/erc3643.strategies.test.ts`

### Implementation for User Story 6

- [ ] T045 [US6] Add a dependency-graph assertion that the adapter package contains no Relayer-plugin-runtime dependency (`PluginContext`, `api.sendTransaction`) in `openzeppelin-adapters/packages/adapter-evm/test/no-plugin-runtime-dep.test.ts` (FR-011, SC-005)
- [ ] T046 [US6] Record the FR-018 verification outcome (confirmed, per research.md R6) in the capability JSDoc / a short note in `openzeppelin-adapters/packages/adapter-evm-core/src/capabilities/` (no new primitive added)

**Checkpoint**: The load-bearing execution-contract assumption is verified and documented.

---

## Phase 9: User Story 7 - Capability factories tested and tier-isolation conformant (Priority: P2)

**Goal**: All three capabilities have factory + mocked-RPC coverage (consolidating US2–US4 tests) and pass tier-isolation conformance for the new sub-paths.

**Independent Test**: Run the adapter suite; confirm each capability has factory + behavioral coverage and the tier-isolation check passes for the three new sub-paths (SC-003, SC-004).

**Depends on**: US2, US3, US4, US5.

### Implementation for User Story 7

- [ ] T047 [US7] Ensure `pnpm lint:adapters` (Tier-1 isolation + capability export structure) passes for the three new capabilities; fix any conformance gaps (FR-020)
- [ ] T048 [US7] Add/confirm tier-isolation conformance assertions for `erc3643`/`erc4626`/`irs` sub-paths (no disallowed cross-tier or browser-only imports) consistent with existing capability checks (FR-020)
- [ ] T049 [US7] Run the full `openzeppelin-adapters` test suite and confirm SC-004 coverage (every read/write across the three capabilities has ≥1 passing mocked test)

**Checkpoint**: Conformance + coverage gates green.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Release readiness across both repos

- [ ] T050 [P] Add a Changeset (MINOR) in `openzeppelin-ui` for the new `@openzeppelin/ui-types` interfaces/types/errors
- [ ] T051 [P] Add Changesets (MINOR) in `openzeppelin-adapters` for `@openzeppelin/adapter-evm-core` + `@openzeppelin/adapter-evm`, listing pinned ABI source versions (FR-017a)
- [ ] T052 [P] Update `openzeppelin-adapters/packages/adapter-evm-core` README / ABI directory docs with the ABI refresh procedure + pinned versions (FR-017a)
- [ ] T053 [P] Update `docs/ADAPTER_ARCHITECTURE.md` (or capability docs) to list the three new capabilities and their sub-paths
- [ ] T054 Run `openzeppelin-adapters` `pnpm build && pnpm test && pnpm lint && pnpm typecheck && pnpm format:check` and the quickstart.md validation checklist end-to-end
- [ ] T055 Confirm the cross-repo release sequence (ui-types published first, then adapters) and version pins are in sync (FR-022, SC-007)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS US1 and everything after; the ui-types-first cross-repo gate (FR-022)
- **US1 (Phase 3)**: Depends on Phase 2 — BLOCKS all adapter stories (US2–US7); ship/link ui-types at its checkpoint
- **US2 (Phase 4)** and **US3 (Phase 5)**: Depend on US1 — independently testable; can run in parallel
- **US5 (Phase 6)**: Depends on US2 + US3 factories (and wires the `erc4626` sub-path used by US4)
- **US4 (Phase 7)**: Depends on US1; plugs into sub-paths wired in US5
- **US6 (Phase 8)**: Depends on ≥1 factory (US2/US3)
- **US7 (Phase 9)**: Depends on US2–US5
- **Polish (Phase 10)**: Depends on all desired stories complete

### Within Each User Story

- Tests written first and FAIL before implementation (Constitution VI)
- ABI vendoring → onchain reader/service → write actions → factory → exports
- Story complete (tests green) before moving to next priority

### Parallel Opportunities

- Setup: T001, T002 parallel
- Foundational: T004 parallel with itself across the 3 type files; T005 parallel; T006 after
- US1: T008/T009/T010 parallel (different files); T011/T012 after
- US2 vs US3: entire phases parallelizable by different developers once US1 lands
- Within a story: the `[P]` test tasks and ABI-vendoring run parallel to each other
- Polish: T050/T051/T052/T053 parallel

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
# Developer A — IRS (Phase 4):
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

1. US1 (types) → US2 (IRS pre-check, the key shared helper) + US3 (ERC-3643 spine) in parallel
2. US5 (server-side sub-paths) → plugin can import server-side
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
- Commit after each task or logical group; keep ui-types and adapter changes in their respective repos
- Avoid: leaking `viem`/`bigint` into `@openzeppelin/ui-types`; pulling React/Wagmi into a sub-path import graph; coupling the adapter to the Relayer plugin runtime
