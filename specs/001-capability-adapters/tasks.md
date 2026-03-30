# Tasks: Capability-Based Adapter Architecture

**Input**: Design documents from `/specs/001-capability-adapters/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US3, US4)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Branch creation and workspace preparation

- [ ] T001 Create feature branch `001-capability-adapters` from `main` in openzeppelin-adapters repo
- [ ] T002 [P] Create feature branch `001-capability-adapters` from `main` in openzeppelin-ui repo

**Checkpoint**: Branches ready in both repositories

---

## Phase 2: Foundational — US4 Capability Interfaces (Priority: P1)

**Goal**: Define all 13 capability interfaces, `RuntimeCapability` base, profile types, `EcosystemRuntime`, error classes, and updated `EcosystemExport` in `@openzeppelin/ui-types`. Remove `ContractAdapter`.

**Independent Test**: `pnpm typecheck` passes in the types package. All 13 interfaces importable from `@openzeppelin/ui-types`.

**⚠️ CRITICAL**: No adapter restructuring, component migration, or consumer app work can begin until this phase is complete.

**📝 JSDoc Requirement**: All capability interfaces MUST include JSDoc comments documenting: interface purpose, tier classification, method parameters, return types, and thrown errors. These interfaces form the public API contract and are the primary documentation for adapter authors and consumers.

**⚠️ Constitution Waiver**: This phase removes `ContractAdapter`, which violates Constitution Principle I ("Every adapter MUST implement the `ContractAdapter` interface"). This violation is acknowledged and intentional — the entire feature replaces `ContractAdapter` with capability interfaces. The formal amendment is tracked in T125 (Phase 9), but the waiver is granted from Phase 2 onward.

### Implementation

- [ ] T003 [US4] Create `RuntimeCapability` base interface in `packages/types/src/adapters/runtime.ts` (openzeppelin-ui repo) — define `interface RuntimeCapability { readonly networkConfig: NetworkConfig; }`
- [ ] T004 [P] [US4] Create `AddressingCapability` interface in `packages/types/src/adapters/capabilities/addressing.ts` (openzeppelin-ui repo) — Tier 1, does not extend RuntimeCapability
- [ ] T005 [P] [US4] Create `ExplorerCapability` interface in `packages/types/src/adapters/capabilities/explorer.ts` (openzeppelin-ui repo) — Tier 1, includes optional `getExplorerTxUrl`
- [ ] T006 [P] [US4] Create `NetworkCatalogCapability` interface in `packages/types/src/adapters/capabilities/network-catalog.ts` (openzeppelin-ui repo) — Tier 1
- [ ] T007 [P] [US4] Create `UiLabelsCapability` interface in `packages/types/src/adapters/capabilities/ui-labels.ts` (openzeppelin-ui repo) — Tier 1
- [ ] T008 [P] [US4] Create `ContractLoadingCapability` interface in `packages/types/src/adapters/capabilities/contract-loading.ts` (openzeppelin-ui repo) — Tier 2, extends RuntimeCapability. Methods: `loadContract`, `loadContractWithMetadata?`, `getContractDefinitionInputs`, `getSupportedContractDefinitionProviders?`, `compareContractDefinitions?`, `validateContractDefinition?`, `hashContractDefinition?`, `getArtifactPersistencePolicy?`, `prepareArtifactsForFunction?`
- [ ] T009 [P] [US4] Create `SchemaCapability` interface in `packages/types/src/adapters/capabilities/schema.ts` (openzeppelin-ui repo) — Tier 2, extends RuntimeCapability. Absorbs `isViewFunction` from `ContractStateCapabilities`
- [ ] T010 [P] [US4] Create `TypeMappingCapability` interface in `packages/types/src/adapters/capabilities/type-mapping.ts` (openzeppelin-ui repo) — Tier 2, extends RuntimeCapability
- [ ] T011 [P] [US4] Create `QueryCapability` interface in `packages/types/src/adapters/capabilities/query.ts` (openzeppelin-ui repo) — Tier 2, extends RuntimeCapability. Absorbs `queryViewFunction` + `formatFunctionResult` from `ContractStateCapabilities`
- [ ] T012 [P] [US4] Create `ExecutionCapability` interface in `packages/types/src/adapters/capabilities/execution.ts` (openzeppelin-ui repo) — Tier 3, extends RuntimeCapability
- [ ] T013 [P] [US4] Create `WalletCapability` interface in `packages/types/src/adapters/capabilities/wallet.ts` (openzeppelin-ui repo) — Tier 3, extends RuntimeCapability
- [ ] T014 [P] [US4] Create `UiKitCapability` interface in `packages/types/src/adapters/capabilities/ui-kit.ts` (openzeppelin-ui repo) — Tier 3, extends RuntimeCapability
- [ ] T015 [P] [US4] Create `RelayerCapability` interface in `packages/types/src/adapters/capabilities/relayer.ts` (openzeppelin-ui repo) — Tier 3, extends RuntimeCapability
- [ ] T016 [P] [US4] Create `AccessControlCapability` interface in `packages/types/src/adapters/capabilities/access-control.ts` (openzeppelin-ui repo) — Tier 3, extends RuntimeCapability. Direct promotion of `AccessControlService` (19 methods + 20 types + 5 errors)
- [ ] T017 [US4] Create capabilities barrel export in `packages/types/src/adapters/capabilities/index.ts` (openzeppelin-ui repo) — re-export all 13 interfaces
- [ ] T018 [US4] Create `ProfileName` type union and profile-specific runtime types in `packages/types/src/adapters/profiles/declarative.ts`, `viewer.ts`, `transactor.ts`, `composer.ts`, `operator.ts` (openzeppelin-ui repo)
- [ ] T019 [US4] Create profiles barrel export in `packages/types/src/adapters/profiles/index.ts` (openzeppelin-ui repo)
- [ ] T020 [US4] Define `EcosystemRuntime` interface in `packages/types/src/adapters/runtime.ts` (openzeppelin-ui repo) — capability accessors (Tier 1 required, Tier 2/3 optional), `dispose()`, `readonly networkConfig`
- [ ] T021 [US4] Define `CapabilityFactoryMap` interface in `packages/types/src/adapters/runtime.ts` (openzeppelin-ui repo) — factory functions keyed by capability name
- [ ] T022 [US4] Define `RuntimeDisposedError` and `UnsupportedProfileError` classes in `packages/types/src/adapters/errors.ts` (openzeppelin-ui repo)
- [ ] T023 [US4] Update `EcosystemExport` in `packages/types/src/adapters/ecosystem-export.ts` (openzeppelin-ui repo) — remove `createAdapter`, add `capabilities: CapabilityFactoryMap` + `createRuntime: (profile: ProfileName, config: NetworkConfig, options?: { uiKit?: string }) => EcosystemRuntime`. The `options.uiKit` replaces the legacy `initialAppServiceKitName` property (FR-017)
- [ ] T024 [US4] Remove `ContractAdapter` interface from `packages/types/src/adapters/base.ts` (openzeppelin-ui repo) — delete or gut the file, removing all ContractAdapter types
- [ ] T025 [US4] Remove `ContractStateCapabilities` interface and `FullContractAdapter` type alias from `packages/types/src/adapters/contract-state.ts` and `packages/types/src/adapters/index.ts` (openzeppelin-ui repo)
- [ ] T026 [US4] Update barrel export in `packages/types/src/adapters/index.ts` (openzeppelin-ui repo) — re-export capabilities, profiles, runtime, errors; remove base.ts and contract-state.ts re-exports
- [ ] T027 [US4] Run `pnpm typecheck` in `packages/types` (openzeppelin-ui repo) — verify all interfaces compile. Fix any type errors from removed ContractAdapter references in other parts of ui-types

**Checkpoint**: All 13 capability interfaces, 5 profile types, `EcosystemRuntime`, `CapabilityFactoryMap`, and error classes are importable from `@openzeppelin/ui-types`. `ContractAdapter` and `FullContractAdapter` no longer exist.

---

## Phase 3: US3 — Adapter Restructuring (Priority: P1)

**Goal**: Restructure adapter-evm-core and adapter-stellar to implement capabilities in dedicated modules under `src/capabilities/`, with sub-path exports. Remove monolithic adapter classes.

**Independent Test**: `import { createAddressing } from '@openzeppelin/adapter-stellar/addressing'` resolves. `StellarAdapter` class no longer exists in public API.

### adapter-evm-core Implementation

- [ ] T028 [P] [US3] Create `packages/adapter-evm-core/src/capabilities/addressing.ts` — wrap `../validation/` into `createAddressing(config?) => AddressingCapability`
- [ ] T029 [P] [US3] Create `packages/adapter-evm-core/src/capabilities/explorer.ts` — wrap explorer URL generation into `createExplorer(config?) => ExplorerCapability`
- [ ] T030 [P] [US3] Create `packages/adapter-evm-core/src/capabilities/network-catalog.ts` — wrap network list into `createNetworkCatalog() => NetworkCatalogCapability`
- [ ] T031 [P] [US3] Create `packages/adapter-evm-core/src/capabilities/ui-labels.ts` — wrap label generation into `createUiLabels() => UiLabelsCapability`
- [ ] T032 [P] [US3] Create `packages/adapter-evm-core/src/capabilities/contract-loading.ts` — wrap `../abi/`, `../proxy/`, `../configuration/` into `createContractLoading(config) => ContractLoadingCapability`
- [ ] T033 [P] [US3] Create `packages/adapter-evm-core/src/capabilities/schema.ts` — wrap `../transform/` into `createSchema(config) => SchemaCapability`, include `isViewFunction` from ContractStateCapabilities
- [ ] T034 [P] [US3] Create `packages/adapter-evm-core/src/capabilities/type-mapping.ts` — wrap `../mapping/` into `createTypeMapping(config) => TypeMappingCapability`
- [ ] T035 [P] [US3] Create `packages/adapter-evm-core/src/capabilities/query.ts` — wrap `../query/` into `createQuery(config) => QueryCapability`, include `queryViewFunction` + `formatFunctionResult`
- [ ] T036 [P] [US3] Create `packages/adapter-evm-core/src/capabilities/execution.ts` — wrap `../transaction/` into `createExecution(config) => ExecutionCapability`
- [ ] T037 [P] [US3] Create `packages/adapter-evm-core/src/capabilities/wallet.ts` — wrap `../wallet/` into `createWallet(config) => WalletCapability`
- [ ] T038 [P] [US3] Create `packages/adapter-evm-core/src/capabilities/ui-kit.ts` — wrap UI kit logic into `createUiKit(config) => UiKitCapability`
- [ ] T039 [P] [US3] Create `packages/adapter-evm-core/src/capabilities/relayer.ts` — wrap relayer/network service logic into `createRelayer(config) => RelayerCapability`
- [ ] T040 [P] [US3] Create `packages/adapter-evm-core/src/capabilities/access-control.ts` — wrap `../access-control/service.ts` into `createAccessControl(config) => AccessControlCapability`
- [ ] T041 [US3] Create capabilities barrel in `packages/adapter-evm-core/src/capabilities/index.ts` — re-export all 13 factory functions
- [ ] T042 [US3] Update `packages/adapter-evm-core/src/index.ts` — export capabilities and profile factories. Remove monolithic adapter re-exports
- [ ] T043 [US3] Update `packages/adapter-evm-core/tsdown.config.ts` — add 13 capability entry points under `src/capabilities/` and 5 profile entry points under `src/profiles/`
- [ ] T044 [US3] Update `packages/adapter-evm-core/package.json` — add 18 sub-path exports (13 capabilities + 5 profiles) with dual ESM/CJS + types pattern. Note: `adapter-evm-core` is a private package — sub-path exports serve internal build resolution and `adapter-evm` re-exports, not direct consumer imports

### adapter-evm Re-export Layer

- [ ] T045 [US3] Create re-export modules in `packages/adapter-evm/src/capabilities/` — one file per capability, each re-exporting from `@openzeppelin/adapter-evm-core`'s corresponding module
- [ ] T046 [US3] Create re-export modules in `packages/adapter-evm/src/profiles/` — one file per profile, each re-exporting from `@openzeppelin/adapter-evm-core`
- [ ] T047 [US3] Update `packages/adapter-evm/tsdown.config.ts` — add 18 new entry points matching adapter-evm-core's capability/profile entries
- [ ] T048 [US3] Update `packages/adapter-evm/package.json` — add 18 sub-path exports with dual ESM/CJS + types. Ensure `noExternal: ['@openzeppelin/adapter-evm-core']` still works
- [ ] T049 [US3] Remove monolithic adapter class from `packages/adapter-evm/src/adapter.ts` — delete file or remove `EvmAdapter` class
- [ ] T050 [US3] Update `packages/adapter-evm/src/index.ts` — export `ecosystemDefinition` with new `EcosystemExport` shape (capabilities map + createRuntime, no createAdapter)

### adapter-stellar Implementation

- [ ] T051 [P] [US3] Create `packages/adapter-stellar/src/capabilities/addressing.ts` — wrap `../validation/` into `createAddressing(config?) => AddressingCapability`
- [ ] T052 [P] [US3] Create `packages/adapter-stellar/src/capabilities/explorer.ts` — wrap explorer logic into `createExplorer(config?) => ExplorerCapability`
- [ ] T053 [P] [US3] Create `packages/adapter-stellar/src/capabilities/network-catalog.ts` — `createNetworkCatalog() => NetworkCatalogCapability`
- [ ] T054 [P] [US3] Create `packages/adapter-stellar/src/capabilities/ui-labels.ts` — `createUiLabels() => UiLabelsCapability`
- [ ] T055 [P] [US3] Create `packages/adapter-stellar/src/capabilities/contract-loading.ts` — wrap `../contract/` into `createContractLoading(config) => ContractLoadingCapability`
- [ ] T056 [P] [US3] Create `packages/adapter-stellar/src/capabilities/schema.ts` — wrap schema logic + `isViewFunction` into `createSchema(config) => SchemaCapability`
- [ ] T057 [P] [US3] Create `packages/adapter-stellar/src/capabilities/type-mapping.ts` — wrap `../mapping/` into `createTypeMapping(config) => TypeMappingCapability`
- [ ] T058 [P] [US3] Create `packages/adapter-stellar/src/capabilities/query.ts` — wrap `../query/` into `createQuery(config) => QueryCapability`
- [ ] T059 [P] [US3] Create `packages/adapter-stellar/src/capabilities/execution.ts` — wrap `../transaction/` into `createExecution(config) => ExecutionCapability`
- [ ] T060 [P] [US3] Create `packages/adapter-stellar/src/capabilities/wallet.ts` — wrap `../wallet/` into `createWallet(config) => WalletCapability`
- [ ] T061 [P] [US3] Create `packages/adapter-stellar/src/capabilities/ui-kit.ts` — `createUiKit(config) => UiKitCapability`
- [ ] T062 [P] [US3] Create `packages/adapter-stellar/src/capabilities/relayer.ts` — `createRelayer(config) => RelayerCapability`
- [ ] T063 [P] [US3] Create `packages/adapter-stellar/src/capabilities/access-control.ts` — wrap `../access-control/` into `createAccessControl(config) => AccessControlCapability`
- [ ] T064 [US3] Create capabilities barrel in `packages/adapter-stellar/src/capabilities/index.ts`
- [ ] T065 [US3] Update `packages/adapter-stellar/tsdown.config.ts` — add 18 new entry points
- [ ] T066 [US3] Update `packages/adapter-stellar/package.json` — add 18 sub-path exports
- [ ] T067 [US3] Remove monolithic adapter class from `packages/adapter-stellar/src/adapter.ts`
- [ ] T068 [US3] Update `packages/adapter-stellar/src/index.ts` — export `ecosystemDefinition` with new `EcosystemExport` shape

### Capability Wrapper Tests

- [ ] T069a [P] [US3] Create unit tests for EVM-core capability wrappers in `packages/adapter-evm-core/src/capabilities/__tests__/` — each factory function (`createAddressing`, `createExplorer`, etc.) MUST have at least one test verifying it returns an object satisfying the corresponding capability interface
- [ ] T069b [P] [US3] Create unit tests for Stellar capability wrappers in `packages/adapter-stellar/src/capabilities/__tests__/` — same coverage as EVM-core

### CI & Build Verification

- [ ] T069 [US3] Update or temporarily disable `lint:adapters` CI check — it will break when `ContractAdapter` is removed
- [ ] T070 [US3] Run `pnpm build` across all adapter packages — verify all 23 entry points compile per package
- [ ] T071 [US3] Run `pnpm test` across all adapter packages — fix any broken tests due to removed adapter classes

**Checkpoint**: All capabilities individually importable via sub-path exports. Monolithic adapter classes removed. `pnpm build && pnpm test` pass.

---

## Phase 4: US1 — Declarative Consumption Verification (Priority: P1)

**Goal**: Verify that Tier 1 capabilities can be consumed in isolation without pulling Tier 2/3 dependencies. This validates the physical tier isolation requirement (FR-006).

**Independent Test**: Import `@openzeppelin/adapter-stellar/addressing` in a test harness and assert no wallet/RPC modules are loaded.

### Implementation

- [ ] T072 [US1] Create tier isolation verification test in `packages/adapter-evm/src/__tests__/tier-isolation.test.ts` — dynamically import each Tier 1 sub-path and assert transitive dependencies don't include wallet/transaction/access-control modules
- [ ] T073 [P] [US1] Create tier isolation verification test in `packages/adapter-stellar/src/__tests__/tier-isolation.test.ts` — same assertions for Stellar adapter
- [ ] T074 [US1] Verify Declarative profile runtime creation — test that `createRuntime('declarative', networkConfig)` returns only Tier 1 capabilities with no Tier 2/3 initialization

**Checkpoint**: Tier isolation verified for both EVM and Stellar adapters. Declarative profile works without Tier 2/3 dependencies.

---

## Phase 5: US5 — Profile Factories (Priority: P2)

**Goal**: Implement 5 profile factories that compose capabilities with shared internal state and lifecycle management.

**Independent Test**: `createRuntime('operator', networkConfig)` returns an `EcosystemRuntime` with shared wallet state across capabilities.

### adapter-evm-core Profile Factories

- [ ] T075 [US5] Create shared state factory infrastructure in `packages/adapter-evm-core/src/profiles/shared-state.ts` — internal factory that creates shared wallet manager, RPC client, and event bus for a given `NetworkConfig`
- [ ] T076 [P] [US5] Create `packages/adapter-evm-core/src/profiles/declarative.ts` — compose Tier 1 capabilities only, no shared state needed
- [ ] T077 [P] [US5] Create `packages/adapter-evm-core/src/profiles/viewer.ts` — compose Tier 1 + Tier 2, shared RPC client
- [ ] T078 [P] [US5] Create `packages/adapter-evm-core/src/profiles/transactor.ts` — compose Tier 1 + Tier 2 (except Query) + Execution + Wallet, shared wallet + RPC
- [ ] T079 [P] [US5] Create `packages/adapter-evm-core/src/profiles/composer.ts` — compose Tier 1 + Tier 2 + Execution + Wallet + UiKit + Relayer, shared state
- [ ] T080 [P] [US5] Create `packages/adapter-evm-core/src/profiles/operator.ts` — compose Tier 1 + Tier 2 + Execution + Wallet + UiKit + AccessControl, shared state
- [ ] T081 [US5] Implement `dispose()` lifecycle on `EcosystemRuntime` in profile factories — idempotent, 6-step cleanup (mark disposed → reject pending → remove listeners → cancel subscriptions → disconnect wallet → release RPC), `RuntimeDisposedError` on post-dispose access
- [ ] T082 [US5] Implement `createRuntime` function and profiles barrel export in `packages/adapter-evm-core/src/profiles/index.ts` — synchronous, validates profile capabilities, throws `UnsupportedProfileError` if missing, throws `TypeError` for invalid profile name. Accept optional `options` parameter for `uiKit` (FR-017). Export `createRuntime` and individual profile factories

### adapter-stellar Profile Factories

- [ ] T084 [P] [US5] Create shared state factory in `packages/adapter-stellar/src/profiles/shared-state.ts` — Stellar-specific shared resources (Stellar SDK client, wallet kit)
- [ ] T085 [P] [US5] Create all 5 profile factories in `packages/adapter-stellar/src/profiles/` — `declarative.ts`, `viewer.ts`, `transactor.ts`, `composer.ts`, `operator.ts`
- [ ] T086 [US5] Implement `dispose()` and `createRuntime` for Stellar profiles in `packages/adapter-stellar/src/profiles/index.ts`

### Standalone Capability Dispose (FR-018)

- [ ] T083 [US5] Implement `dispose()` method on Tier 2+ standalone capabilities returned by `CapabilityFactoryMap` factory functions — matching the lifecycle contract of profile runtimes. Each factory function for Tier 2+ capabilities MUST return an object that includes `dispose()` for resource cleanup

### Verification

- [ ] T087 [US5] Create profile integration test — verify shared wallet state: connect wallet via WalletCapability, assert address visible on ExecutionCapability and AccessControlCapability
- [ ] T088 [US5] Create dispose lifecycle test — verify `dispose()` is idempotent, rejects pending ops with `RuntimeDisposedError`, blocks post-dispose method calls
- [ ] T088b [US5] Create standalone capability dispose test — verify that Tier 2+ capabilities from `CapabilityFactoryMap` expose `dispose()` and clean up resources (FR-018)

**Checkpoint**: All 5 profiles functional for both EVM and Stellar adapters. Shared state + dispose lifecycle verified.

---

## Phase 6: US2 — Shared UI Component Migration (Priority: P1)

**Goal**: Update all shared UI components and hooks to accept narrow capability props instead of `ContractAdapter` / `FullContractAdapter`.

**Independent Test**: Pass an `AddressingCapability` object (not a full adapter) to `AddressField` and verify validation works.

### ui-components Package (openzeppelin-ui repo)

- [ ] T089 [P] [US2] Update `AddressField` in `packages/components/src/components/fields/AddressField.tsx` — replace `ContractAdapter` prop with `AddressingCapability`
- [ ] T090 [P] [US2] Update `ContractDefinitionSettingsPanel` in `packages/components/src/components/contract-definition/ContractDefinitionSettingsPanel.tsx` — replace `ContractAdapter` prop with `ContractLoadingCapability`
- [ ] T091 [P] [US2] Update `ObjectField` in `packages/components/src/components/fields/ObjectField.tsx` — replace `ContractAdapter` prop with `AddressingCapability`
- [ ] T092 [P] [US2] Update `ArrayObjectField` in `packages/components/src/components/fields/ArrayObjectField.tsx` — replace `ContractAdapter` prop with `AddressingCapability`

### ui-renderer Package (openzeppelin-ui repo)

- [ ] T093 [P] [US2] Update `AddAliasDialog` in `packages/renderer/src/components/AddressBookWidget/AddAliasDialog.tsx` — replace `ContractAdapter` prop with `AddressingCapability`
- [ ] T094 [P] [US2] Update `NetworkSettingsDialog` in `packages/renderer/src/components/network/NetworkSettingsDialog.tsx` — replace `ContractAdapter` prop with `RelayerCapability`
- [ ] T095 [P] [US2] Update `DynamicFormField` in `packages/renderer/src/components/DynamicFormField.tsx` — replace `ContractAdapter` prop with `TypeMappingCapability` + `AddressingCapability`
- [ ] T096 [P] [US2] Update `NetworkServiceSettingsPanel` in `packages/renderer/src/components/network/NetworkServiceSettingsPanel.tsx` — replace `ContractAdapter` prop with `RelayerCapability`
- [ ] T097 [P] [US2] Update `ExecutionConfigDisplay` in `packages/renderer/src/components/ExecutionConfigDisplay/ExecutionConfigDisplay.tsx` — replace `ContractAdapter` prop with `ExecutionCapability`
- [ ] T098 [P] [US2] Update `ViewFunctionsPanel` in `packages/renderer/src/components/ContractStateWidget/components/ViewFunctionsPanel.tsx` — replace `ContractAdapter` prop with `QueryCapability` + `SchemaCapability`
- [ ] T099 [P] [US2] Update `TransactionStatusDisplay` in `packages/renderer/src/components/transaction/TransactionStatusDisplay.tsx` — replace `FullContractAdapter` prop with `QueryCapability` + `ExplorerCapability`
- [ ] T100 [P] [US2] Update `ContractStateWidget` in `packages/renderer/src/components/ContractStateWidget/ContractStateWidget.tsx` — replace `FullContractAdapter` prop with `QueryCapability` + `SchemaCapability`

### ui-react Package (openzeppelin-ui repo)

- [ ] T101 [US2] Update `NetworkSwitchManager` in `packages/react/src/components/NetworkSwitchManager.tsx` — replace `ContractAdapter` prop with `WalletCapability` + `NetworkCatalogCapability`
- [ ] T102 [US2] Update `AdapterProvider` in `packages/react/src/hooks/AdapterProvider.tsx` — rename to `RuntimeProvider`, replace `resolveAdapter` with `resolveRuntime` function prop
- [ ] T103 [P] [US2] Update `useNetworkErrorAwareAdapter` hook in `packages/components/src/components/network-errors/NetworkErrorAwareAdapter.tsx` — accept `RuntimeCapability` instead of `ContractAdapter`
- [ ] T104 [P] [US2] Update `useExecutionValidation` hook in `packages/renderer/src/components/ExecutionConfigDisplay/hooks/useExecutionValidation.ts` — accept `ExecutionCapability`
- [ ] T105 [US2] Update field registry typing to use `TypeMappingCapability` + `AddressingCapability` instead of `ContractAdapter`

### Verification

- [ ] T106 [US2] Run `grep -r 'ContractAdapter' packages/` in openzeppelin-ui repo — verify zero matches in component/hook source files (excluding type definition files being actively deleted)
- [ ] T107 [US2] Run `pnpm typecheck && pnpm test` across ui-components, ui-renderer, ui-react — fix any broken tests

**Checkpoint**: All 13 components + hooks/providers accept narrow capability props. No `ContractAdapter` or `FullContractAdapter` references remain.

---

## Phase 7: US7 — Consumer App Migration (Priority: P1)

**Goal**: Migrate UI Builder, Role Manager, and RWA Wizard from `ContractAdapter` consumption to profile-based capability consumption.

**Independent Test**: Each app's test suite passes. No app imports `ContractAdapter`, `createAdapter`, or monolithic adapter classes.

### UI Builder (ui-builder repo) — Composer Profile

- [ ] T108 [US7] Update `apps/builder/src/core/ecosystemManager.ts` — replace `getAdapter(networkConfig): Promise<ContractAdapter>` with `getRuntime('composer', networkConfig): Promise<EcosystemRuntime>`. Preserve `loadAdapterModule` caching. Update `def.createAdapter(config)` to `def.createRuntime('composer', config)`
- [ ] T109 [US7] Update all React hooks in ui-builder that hold `ContractAdapter | null` state to use `EcosystemRuntime | null` — add `dispose()` in `useEffect` cleanup on runtime replacement
- [ ] T110 [US7] Update all component callsites in ui-builder that pass `adapter` prop — pass specific capabilities from runtime (e.g., `runtime.addressing`, `runtime.execution`)
- [ ] T111 [US7] Run `pnpm test` in ui-builder — update test mocks from `ContractAdapter` to capability mocks, fix broken tests

### Role Manager (role-manager repo) — Operator Profile

- [ ] T112 [US7] Update `apps/role-manager/src/core/ecosystems/ecosystemManager.ts` — replace `getAdapter` with `getRuntime('operator', networkConfig)`. Update `def.createAdapter(config)` to `def.createRuntime('operator', config)`
- [ ] T113 [US7] Simplify `apps/role-manager/src/hooks/useAccessControlService.ts` — replace `adapter.getAccessControlService?.()` extraction with direct `runtime.accessControl` access from Operator profile runtime
- [ ] T114 [US7] Update `apps/role-manager/src/hooks/useContractRegistration.ts` — replace `getAccessControlService` usage with direct capability access
- [ ] T115 [US7] Update all React hooks in role-manager that hold `ContractAdapter | null` state to use `EcosystemRuntime | null` — add `dispose()` cleanup
- [ ] T116 [US7] Update all component callsites in role-manager that pass `adapter` prop — pass specific capabilities
- [ ] T117 [US7] Run `pnpm test` in role-manager — update test mocks, fix broken tests

### RWA Wizard (rwa-wizard repo) — Declarative Profile

- [ ] T118 [US7] Update `apps/rwa-wizard/package.json` — replace legacy `@openzeppelin/ui-builder-adapter-evm` and `@openzeppelin/ui-builder-adapter-stellar` dependencies with `@openzeppelin/adapter-evm` and `@openzeppelin/adapter-stellar`
- [ ] T119 [US7] Update ecosystem/adapter loading in rwa-wizard (if present) to use `createRuntime('declarative', networkConfig)` pattern
- [ ] T120 [US7] Run `pnpm test` in rwa-wizard — verify functionality preserved

### Cross-App Verification

- [ ] T121 [US7] Verify no `ContractAdapter` imports remain across all three consumer apps — `grep -r 'ContractAdapter' apps/` returns zero matches in each repo

**Checkpoint**: All three consumer apps migrated. Test suites pass. No `ContractAdapter` references.

---

## Phase 8: US6 — Partial Adapter Author Support (Priority: P2)

**Goal**: Verify that an adapter author can implement only Tier 1 capabilities and ship a valid adapter for Declarative-profile consumers.

**Independent Test**: Create a minimal adapter with 3 capabilities and verify it integrates with a Declarative-profile consumer.

### Implementation

- [ ] T122 [US6] Create example/test of a minimal adapter implementing only `AddressingCapability`, `ExplorerCapability`, `NetworkCatalogCapability` — verify it satisfies the `CapabilityFactoryMap` type with all other entries as `undefined`
- [ ] T123 [US6] Verify `createRuntime('declarative', config)` succeeds with a minimal adapter and `createRuntime('operator', config)` throws `UnsupportedProfileError` listing missing capabilities
- [ ] T124 [US6] Update `docs/ADAPTER_ARCHITECTURE.md` — document the minimal capability set for new adapter authors and the profile-capability matrix

**Checkpoint**: Partial adapter support verified. Adapter author documentation updated.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Constitution amendment, documentation, release preparation

- [ ] T125 Amend Constitution Principle I in `.specify/memory/constitution.md` — replace "Every adapter package MUST implement the `ContractAdapter` interface" with capability interface compliance language
- [ ] T126 Update or replace `lint:adapters` CI check with capability conformance validation
- [ ] T127 [P] Update `docs/ADAPTER_ARCHITECTURE.md` — document new capability-based structure, sub-path exports, profile factories, lifecycle
- [ ] T128 [P] Update root `README.md` — reflect capability-based architecture
- [ ] T129 Create Changesets files for all modified packages — major version bumps for `@openzeppelin/ui-types`, `@openzeppelin/adapter-evm`, `@openzeppelin/adapter-stellar`, `@openzeppelin/ui-components`, `@openzeppelin/ui-renderer`, `@openzeppelin/ui-react`
- [ ] T130 Run full CI pipeline across all repos — `pnpm build && pnpm test && pnpm lint && pnpm typecheck` in openzeppelin-adapters and openzeppelin-ui
- [ ] T131 Verify NFR-001 (build time ≤ 2x baseline) and NFR-002 (dist size ≤ 130% baseline) for adapter packages

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — can start immediately
- **Phase 2 (US4 — Types)**: Depends on Phase 1 — **BLOCKS all subsequent phases**
- **Phase 3 (US3 — Adapter Restructuring)**: Depends on Phase 2
- **Phase 4 (US1 — Tier Isolation)**: Depends on Phase 3
- **Phase 5 (US5 — Profiles)**: Depends on Phase 3
- **Phase 6 (US2 — UI Components)**: Depends on Phase 2 (types), Phase 3 (adapter implementations)
- **Phase 7 (US7 — Consumer Migration)**: Depends on Phases 3, 5, 6 (all upstream packages)
- **Phase 8 (US6 — Partial Adapters)**: Depends on Phases 2, 3, 5
- **Phase 9 (Polish)**: Depends on all previous phases

### User Story Dependencies

- **US4 (Types)**: BLOCKS everything — must be first
- **US3 (Adapter Restructuring)**: Depends on US4 only
- **US1 (Declarative Consumption)**: Depends on US3 — verification phase
- **US5 (Profiles)**: Depends on US3 — can run in parallel with US1
- **US2 (UI Components)**: Depends on US4 + US3
- **US7 (Consumer Migration)**: Depends on US2 + US3 + US5
- **US6 (Partial Adapters)**: Depends on US4 + US3 + US5 — can run in parallel with US7

### Cross-Repository Publish Order

```
Phase 2: @openzeppelin/ui-types (openzeppelin-ui) → npm publish
    ↓
Phase 3: @openzeppelin/adapter-evm-core + adapter-evm + adapter-stellar (openzeppelin-adapters) → npm publish
    ↓
Phase 6: @openzeppelin/ui-components + ui-renderer + ui-react (openzeppelin-ui) → npm publish
    ↓
Phase 7: Consumer apps (ui-builder, role-manager, rwa-wizard) → deploy
```

### Parallel Opportunities

**Within Phase 2 (Types)**: T004–T016 (all 13 capability interfaces) can run in parallel
**Within Phase 3 (Adapters)**: T028–T040 (EVM-core capabilities) can run in parallel with T051–T063 (Stellar capabilities)
**Phases 4 + 5**: Can run in parallel after Phase 3 completes
**Within Phase 6 (Components)**: T089–T105 (all component updates) can run in parallel
**Phases 7 + 8**: US7 and US6 can run in parallel with different team members

---

## Implementation Strategy

### MVP First (US4 + US3 + US1)

1. Complete Phase 1: Setup
2. Complete Phase 2: US4 — Types (BLOCKS everything)
3. Complete Phase 3: US3 — Adapter Restructuring
4. Complete Phase 4: US1 — Verify Tier Isolation
5. **STOP and VALIDATE**: Tier 1 sub-path imports work in isolation
6. This proves the core architecture without requiring UI or consumer changes

### Incremental Delivery

1. US4 (Types) → publish `@openzeppelin/ui-types` major
2. US3 (Adapters) → publish adapter packages major
3. US5 (Profiles) → included in adapter publish
4. US2 (Components) → publish UI packages major
5. US7 (Apps) → migrate consumer apps
6. US6 (Partial) → update adapter author docs
7. Polish → constitution, CI, changesets

### Parallel Team Strategy

With 2–3 developers after Phase 2 completes:
- **Developer A**: US3 adapter-evm-core + adapter-evm (Phase 3)
- **Developer B**: US3 adapter-stellar (Phase 3)
- **After Phase 3**: Developer A takes US5 (Profiles), Developer B takes US2 (Components)
- **After Phases 5+6**: Both work on US7 (Consumer Migration) — one app each

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- All component file paths reference openzeppelin-ui repo unless stated otherwise
- All adapter file paths reference openzeppelin-adapters repo unless stated otherwise
- Consumer app file paths reference their respective repos (ui-builder, role-manager, rwa-wizard)
- Commit after each logical group of tasks within a phase
- The `ecosystemDefinition` export name is preserved — only the `EcosystemExport` shape changes
- `adapters-vite` package requires NO changes
