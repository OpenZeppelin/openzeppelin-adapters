# Quickstart: Capability-Based Adapter Architecture

**Feature**: 001-capability-adapters | **Date**: 2026-03-30

## Implementation Order

The implementation must follow this dependency order. Each phase produces artifacts that subsequent phases depend on.

### Phase A: Interface Definitions (`@openzeppelin/ui-types`)

**Scope**: Define all 13 capability interfaces, `RuntimeCapability` base, profile types, `EcosystemRuntime`, updated `EcosystemExport`, and error classes.

**Why first**: Everything else depends on these type definitions. Adapter restructuring, component updates, and consumer migration all import from `ui-types`.

**Key files**:
- `packages/types/src/adapters/capabilities/` — 13 capability interface files
- `packages/types/src/adapters/profiles/` — 5 profile type files
- `packages/types/src/adapters/runtime.ts` — `RuntimeCapability`, `EcosystemRuntime`, `CapabilityFactoryMap`
- `packages/types/src/adapters/ecosystem-export.ts` — updated `EcosystemExport` (remove `createAdapter`, add `capabilities` + `createRuntime`)
- `packages/types/src/adapters/base.ts` — **delete** `ContractAdapter` interface
- `packages/types/src/adapters/index.ts` — updated barrel exports

**Verification**: `pnpm typecheck` passes in the types package. All 13 interfaces are importable.

---

### Phase B: Adapter Restructuring (`adapter-evm-core`, `adapter-stellar`)

**Scope**: Implement each capability in a dedicated module under `src/capabilities/`, create profile factories under `src/profiles/`, add sub-path exports to `package.json` and tsdown config. Remove monolithic adapter classes.

**Depends on**: Phase A (capability interfaces to implement)

**Key work**:

1. **Create `src/capabilities/` modules** — Each module wraps existing internal code:
   - `addressing.ts` imports from `../validation/` and exports `createAddressing(config) => AddressingCapability`
   - `execution.ts` imports from `../transaction/` and exports `createExecution(config) => ExecutionCapability`
   - (similarly for all 13)

2. **Create `src/profiles/` factories** — Each profile factory composes capabilities with shared state:
   - `declarative.ts` creates only Tier 1 capabilities
   - `operator.ts` creates Tier 1 + 2 + 3 with shared wallet/RPC

3. **Update tsdown config** — Add 18 new entry points (13 capabilities + 5 profiles)

4. **Update package.json exports** — Add sub-path exports matching tsdown entries

5. **Delete monolithic adapter** — Remove `adapter.ts` (the `EvmAdapter`/`StellarAdapter` class)

6. **Update `adapter-evm`** — Re-export capabilities from `adapter-evm-core` via sub-path exports. Maintain `noExternal` bundling.

**Verification**: Each capability importable via sub-path. Tier 1 imports don't pull Tier 2/3. `pnpm build` and `pnpm test` pass.

---

### Phase C: Shared UI Component Migration

**Scope**: Update all shared component packages (`@openzeppelin/ui-components`, `@openzeppelin/ui-renderer`, `@openzeppelin/ui-react`) to accept narrow capability props instead of `ContractAdapter` or `FullContractAdapter`.

**Depends on**: Phase A (capability interface types), Phase B (working adapter implementations)

**Key changes (13 components)**:

| Component | Package | Current Prop | New Props |
|-----------|---------|-------------|-----------|
| `AddressField` | ui-components | `ContractAdapter` | `AddressingCapability` |
| `ContractDefinitionSettingsPanel` | ui-components | `ContractAdapter` | `ContractLoadingCapability` |
| `ObjectField` | ui-components | `ContractAdapter` | `AddressingCapability` (for nested address validation) |
| `ArrayObjectField` | ui-components | `ContractAdapter` | `AddressingCapability` |
| `AddAliasDialog` | ui-renderer | `ContractAdapter` | `AddressingCapability` |
| `NetworkSettingsDialog` | ui-renderer | `ContractAdapter` | `RelayerCapability` |
| `DynamicFormField` | ui-renderer | `ContractAdapter` | `TypeMappingCapability` + `AddressingCapability` |
| `NetworkServiceSettingsPanel` | ui-renderer | `ContractAdapter` | `RelayerCapability` |
| `ExecutionConfigDisplay` | ui-renderer | `ContractAdapter` | `ExecutionCapability` |
| `ViewFunctionsPanel` | ui-renderer | `ContractAdapter` | `QueryCapability` + `SchemaCapability` |
| `NetworkSwitchManager` | ui-react | `ContractAdapter` | `WalletCapability` + `NetworkCatalogCapability` |
| `TransactionStatusDisplay` | ui-renderer | `FullContractAdapter` | `QueryCapability` + `ExplorerCapability` |
| `ContractStateWidget` | ui-renderer | `FullContractAdapter` | `QueryCapability` + `SchemaCapability` |

**Hooks/Providers to update**:
- `AdapterProvider` → `RuntimeProvider` (accepts `resolveRuntime` function instead of `resolveAdapter`)
- `useNetworkErrorAwareAdapter` → accepts `RuntimeCapability` instead of `ContractAdapter`
- `useExecutionValidation` → accepts `ExecutionCapability`
- Field registry typing → uses `TypeMappingCapability` + `AddressingCapability`

**Out of scope**: `adapters-vite` package — it operates on build configuration, not runtime adapter interfaces. No changes needed.

**Verification**: All components render and function with capability props. `grep -r 'ContractAdapter' packages/` returns zero matches in source files.

---

### Phase D: Consumer App Migration

**Scope**: Update ecosystem managers, React hooks, and component callsites in UI Builder, Role Manager, and RWA Wizard.

**Depends on**: Phases A, B, C (all upstream packages must be published to npm)

**Key changes per app**:

1. **`ecosystemManager.ts` migration** (all three apps):
   - Replace `getAdapter(networkConfig): Promise<ContractAdapter>` with `getRuntime(profile, networkConfig): Promise<EcosystemRuntime>`
   - The `loadAdapterModule` function and its caching pattern (`adapterPromiseCache`) remain unchanged — only the factory call changes from `def.createAdapter(config)` to `def.createRuntime(profile, config)`
   - The `loadNetworksModule` function and network caching are unchanged
   - The `getEcosystemMetadata` and `getEcosystemDefinition` exports are unchanged
   - Error handling on module load remains the same (clear cache on failure, retry)

2. **React hooks migration** (per app):
   - Hooks that hold `ContractAdapter | null` state change to `EcosystemRuntime | null`
   - Hooks that extract capabilities (e.g., `useAccessControlService` in Role Manager) are simplified — the capability is accessed directly from the runtime (`runtime.accessControl`) instead of extracted via `adapter.getAccessControlService()`
   - `useEffect` cleanup functions MUST call `runtime.dispose()` when the runtime is replaced (network switch, unmount)

3. **Component callsites** (per app):
   - Where apps pass `adapter` to shared UI components, they pass specific capabilities from the runtime (e.g., `runtime.addressing`, `runtime.execution`)
   - This is a prop renaming at each callsite — the component behavior is unchanged

**Profile assignments**:
- UI Builder → `composer`
- Role Manager → `operator`
- RWA Wizard → `declarative` (also: update dependency names from `@openzeppelin/ui-builder-adapter-*` to `@openzeppelin/adapter-*`)

**Verification**: All app test suites pass (test suites themselves are updated as part of migration). No `ContractAdapter` imports remain. Apps function identically.

---

### Phase E: Cleanup & Constitution Amendment

**Scope**: Remove dead code, update documentation, amend constitution.

**Depends on**: Phase D (all migrations complete)

**Key work**:
- Remove `FullContractAdapter` type alias from `ui-types`
- Remove `lint:adapters` check (or update it to validate capability conformance)
- Update `docs/ADAPTER_ARCHITECTURE.md`
- Amend Constitution Principle I to reference capability interfaces
- Create changesets with major version bumps for all modified packages

**Verification**: `pnpm lint`, `pnpm typecheck`, `pnpm test` all pass across all packages. No references to `ContractAdapter` in any package.

---

### Cross-Repository Publish Sequence

```
1. @openzeppelin/ui-types            (openzeppelin-ui)    — capability interfaces
   ↓
2. @openzeppelin/adapter-evm-core    (openzeppelin-adapters) — EVM implementations (private, not published)
   @openzeppelin/adapter-evm         (openzeppelin-adapters) — EVM public adapter
   @openzeppelin/adapter-stellar     (openzeppelin-adapters) — Stellar adapter
   ↓
3. @openzeppelin/ui-components       (openzeppelin-ui)    — updated component props
   @openzeppelin/ui-renderer         (openzeppelin-ui)    — updated component props
   @openzeppelin/ui-react            (openzeppelin-ui)    — updated hooks/providers
   ↓
4. ui-builder app                    (ui-builder)         — Composer profile
   role-manager app                  (role-manager)       — Operator profile
   rwa-wizard app                    (rwa-wizard)         — Declarative profile
```

PRs for steps 1–3 are prepared in parallel but merged and published in sequence. Consumer apps (step 4) update after all packages are available on npm.

## Decision Log

| Decision | Rationale | Reference |
|----------|-----------|-----------|
| No backward compatibility | Coordinated breaking change is cleaner than maintaining parallel APIs | Spec: Clarifications Q2 |
| Capabilities in `adapter-evm-core` | Preserves private package architecture; `adapter-evm` re-exports | Research: R2 |
| Physical sub-path isolation | Guarantees tier isolation regardless of bundler config | Spec: FR-006, Research: R6 |
| Dispose-and-recreate lifecycle | Avoids stale state; aligns with immutable config philosophy | Research: R8 |
| Interfaces in `ui-types` | Single source of truth; consistent with existing architecture | Spec: Clarifications Q5 |
| Open Accounts excluded | Will be built against capability interfaces from the start | Spec: Clarifications Q2 |
