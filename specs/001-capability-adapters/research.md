# Research: Capability-Based Adapter Architecture

**Feature**: 001-capability-adapters | **Date**: 2026-03-30

## R1: Sub-Path Export Strategy with tsdown

**Decision**: Each capability and profile becomes a separate tsdown entry point with a corresponding `package.json` exports sub-path.

**Rationale**: tsdown's `entry` field accepts an array of source files. The current adapters already use 5 entry points (`index`, `metadata`, `networks`, `config`, `vite-config`). Adding 13 capability entries + 5 profile entries = 23 total entries follows the identical pattern. Each entry produces isolated `.mjs`/`.cjs` + `.d.mts`/`.d.cts` output under `dist/`. This is the mechanism that enforces physical tier isolation — a Tier 1 entry point (e.g., `src/capabilities/addressing.ts`) never imports Tier 2/3 modules, so the bundled output physically cannot contain wallet/RPC code.

**Alternatives considered**:
- Single entry point with tree-shaking: Rejected because isolation would depend on consumer bundler configuration, violating FR-006.
- Separate npm packages per capability: Rejected as over-fragmentation for a single adapter ecosystem.

## R2: adapter-evm / adapter-evm-core Bundling Strategy

**Decision**: `adapter-evm-core` implements all EVM capabilities and exports them individually. `adapter-evm` uses `noExternal: ['@openzeppelin/adapter-evm-core']` (existing pattern) to inline core code into its own sub-path exports, acting as the public-facing re-export layer.

**Rationale**: This preserves the existing architecture where `adapter-evm-core` is `private: true` and never published to npm. `adapter-evm` remains the only published EVM adapter package. The `dts.resolve: ['@openzeppelin/adapter-evm-core']` config ensures type declarations also inline correctly. Each `adapter-evm` sub-path export (e.g., `./addressing`) maps to a tsdown entry that imports from `adapter-evm-core`'s corresponding capability module.

**Alternatives considered**:
- Publishing `adapter-evm-core` as a public package: Rejected — would require consumers to add a second dependency and breaks the current architecture. `adapter-polkadot` also depends on `adapter-evm-core`, so the private/inlined model serves both consumers.

## R3: ContractAdapter Method-to-Capability Mapping

**Decision**: All ~45 methods on `ContractAdapter` (required + optional) are mapped to 13 capabilities as follows:

| Capability | Tier | Methods |
|-----------|------|---------|
| **Addressing** | 1 | `isValidAddress` |
| **Explorer** | 1 | `getExplorerUrl`, `getExplorerTxUrl` |
| **NetworkCatalog** | 1 | (network discovery — from `EcosystemExport.networks`) |
| **UiLabels** | 1 | `getUiLabels` |
| **ContractLoading** | 2 | `loadContract`, `loadContractWithMetadata`, `getContractDefinitionInputs`, `getSupportedContractDefinitionProviders`, `compareContractDefinitions`, `validateContractDefinition`, `hashContractDefinition`, `getArtifactPersistencePolicy`, `prepareArtifactsForFunction` |
| **Schema** | 2 | `getWritableFunctions`, `isViewFunction`, `filterAutoQueryableFunctions`, `getFunctionDecorations` |
| **TypeMapping** | 2 | `mapParameterTypeToFieldType`, `getCompatibleFieldTypes`, `generateDefaultField`, `getTypeMappingInfo`, `getRuntimeFieldBinding` |
| **Query** | 2 | `queryViewFunction`, `formatFunctionResult`, `getCurrentBlock` |
| **Execution** | 3 | `formatTransactionData`, `signAndBroadcast`, `waitForTransactionConfirmation`, `getSupportedExecutionMethods`, `validateExecutionConfig` |
| **Wallet** | 3 | `supportsWalletConnection`, `getAvailableConnectors`, `connectWallet`, `disconnectWallet`, `getWalletConnectionStatus`, `onWalletConnectionChange`, `getExportableWalletConfigFiles` |
| **UiKit** | 3 | `getAvailableUiKits`, `configureUiKit`, `getEcosystemReactUiContextProvider`, `getEcosystemReactHooks`, `getEcosystemWalletComponents`, `getRelayerOptionsComponent` |
| **Relayer** | 3 | `getRelayers`, `getRelayer`, `getNetworkServiceForms`, `getDefaultServiceConfig`, `validateNetworkServiceConfig`, `testNetworkServiceConnection`, `validateRpcEndpoint`, `testRpcConnection`, `validateExplorerConfig`, `testExplorerConnection` |
| **AccessControl** | 3 | `getAccessControlService` (promoted: full `AccessControlService` interface — 19 methods) |

**Rationale**: Grouping follows the single-responsibility principle. Each capability represents one concern area. The mapping was validated against both `EvmAdapter` and `StellarAdapter` implementations to ensure complete coverage.

**Remaining properties**: `networkConfig` (readonly) → `RuntimeCapability` base interface. `initialAppServiceKitName` → moved to `UiKit` capability or profile configuration. `getExportBootstrapFiles` → `AdapterExportContext` remains separate (build-time concern, not runtime capability).

## R4: EcosystemExport Transformation

**Decision**: `EcosystemExport` gains a `capabilities` map and `createRuntime` function. `createAdapter` is removed.

**Rationale**: The current `EcosystemExport` interface has three members: `networks`, `createAdapter`, `adapterConfig`. The new shape:

```typescript
interface EcosystemExport extends EcosystemMetadata {
  networks: NetworkConfig[];
  capabilities: CapabilityFactoryMap;
  createRuntime: (profile: ProfileName, config: NetworkConfig) => EcosystemRuntime;
  adapterConfig?: AdapterConfig;
}
```

Consumer ecosystem managers (`getAdapter()`) become `getRuntime()` or `getCapability()`. The dynamic import + switch pattern is unchanged — only the factory invocation changes.

**Alternatives considered**:
- Keeping `createAdapter` alongside `createRuntime`: Rejected per no-backward-compatibility decision.
- Merging profiles into `createRuntime` as an options bag: Rejected — named profiles are more explicit and self-documenting.

## R5: Consumer App Migration Pattern

**Decision**: Each consumer app's `ecosystemManager.ts` replaces `getAdapter()` with profile-based runtime creation. The dynamic import and caching pattern is preserved.

**Rationale**: Current flow: `getAdapter(networkConfig)` → `loadAdapterModule(ecosystem)` → `def.createAdapter(networkConfig)`. New flow: `getRuntime(profile, networkConfig)` → `loadAdapterModule(ecosystem)` → `def.createRuntime(profile, networkConfig)`. The structural change is minimal — only the factory call and return type change. React hooks that accept `ContractAdapter` props change to accept specific capability types.

**Per-app profile mapping**:
- **UI Builder** → `Composer` profile (full design-time + runtime surface)
- **Role Manager** → `Operator` profile (wallet + execution + access control)
- **RWA Wizard** → `Declarative` profile (metadata only, no wallet/RPC)

**Role Manager's `useAccessControlService` hook**: Currently extracts `AccessControlService` via `adapter.getAccessControlService()`. Post-migration, the hook receives `AccessControlCapability` directly from the `Operator` profile runtime — no extraction needed, the capability *is* the service.

## R6: Physical Tier Isolation Implementation

**Decision**: Tier isolation is enforced by file-system organization + tsdown entry points. Each capability module under `src/capabilities/` imports only from modules within its tier or lower.

**Rationale**: Tier 1 capabilities (`addressing`, `explorer`, `network-catalog`, `ui-labels`) import only from pure utility/validation/config modules — never from `wallet/`, `transaction/`, `query/`, or `access-control/` directories. Tier 2 capabilities import from config/schema modules but not from `wallet/` or `transaction/`. This is enforced structurally (separate entry points produce separate chunks) and can be validated with import-graph analysis.

**Tier Import Rules** (explicit):
- Tier 1 capabilities MAY import from: `../validation/`, `../utils/`, `../configuration/`, `../networks/`, `../types/`. They MUST NOT import from `../wallet/`, `../transaction/`, `../query/`, `../access-control/`, `../contract/`, `../transform/`, `../mapping/`, `../proxy/`, `../abi/`.
- Tier 2 capabilities MAY import from everything Tier 1 can, plus: `../abi/`, `../contract/`, `../transform/`, `../mapping/`, `../proxy/`, `../query/`. They MUST NOT import from `../wallet/`, `../transaction/`, `../access-control/`.
- Tier 3 capabilities MAY import from any internal module.
- Tier 2 capabilities MAY import Tier 1 capability modules (e.g., `SchemaCapability` may depend on types from `AddressingCapability`). Tier 1 capabilities MUST NOT import from Tier 2 or Tier 3 modules.

**Enforcement layers**:
1. **tsdown entry points**: Each capability is a separate build entry — cross-tier imports would be caught as missing exports or bundled unexpectedly.
2. **ESLint import restrictions**: OUT OF SCOPE for the initial release. Will be added as a follow-up after the restructuring is stable. The structural enforcement via tsdown entry points is sufficient for the initial rollout.
3. **Integration test**: Import each Tier 1 sub-path in isolation and assert no wallet/RPC modules are loaded.

## R7: Constitution Amendment Requirements

**Decision**: After implementation, Constitution Principle I must be amended to reference capability interfaces instead of `ContractAdapter`.

**Rationale**: Principle I currently states "Every adapter package MUST implement the `ContractAdapter` interface." Post-refactoring, this becomes "Every adapter package MUST implement capability interfaces from `@openzeppelin/ui-types` and expose them via sub-path exports." The `lint:adapters` check must also be updated to validate capability conformance instead of `ContractAdapter` conformance.

**Scope**: Amendment is a follow-up task after the implementation is complete and validated. The constitution's governance section already defines the amendment process (documented proposal + PR review).

## R8: Dispose-and-Recreate Lifecycle

**Decision**: `EcosystemRuntime` is immutable with respect to `NetworkConfig`. Network changes require calling `dispose()` and creating a new runtime.

**Rationale**: Shared internal state (wallet connections, RPC clients, cached data) is all tied to a specific network. Mutating the config would require cascading updates across all capabilities and risk stale state. The dispose-and-recreate model is simpler, more predictable, and aligns with React's data-flow model where components re-render with new props.

**`dispose()` contract**: Must reject pending async operations (e.g., `signAndBroadcast` in flight) with `RuntimeDisposedError`, then run cleanup in staged order so listeners/subscriptions are released before wallet or RPC teardown. The lifecycle trigger remains synchronous and idempotent; async cleanup work may continue in the background once disposal has started.

**Alternatives considered**:
- Mutable `switchNetwork()` method: Rejected — adds complexity, stale-state risk, and makes it harder to reason about capability state in React components.

## R9: AccessControlService → AccessControlCapability Promotion Validation

**Decision**: The promotion is a direct rename with one structural addition: `AccessControlCapability extends RuntimeCapability`, which adds `readonly networkConfig: NetworkConfig`. No existing method signatures change.

**Rationale**: The existing `AccessControlService` interface (19 methods) does not currently extend any base interface — it's a standalone type. Adding `RuntimeCapability` as a base interface is additive and non-breaking. All 19 methods retain their existing signatures. The 20 supporting types and 5 error classes are re-exported alongside the capability interface.

**Validation**: The `AccessControlService` method signatures were audited against the `adapter-evm-core` implementation and the Role Manager hooks. No method signature adjustment is needed — the rename is purely nominal with the `RuntimeCapability` extension added.

## R10: noExternal Scaling to 18+ Entry Points

**Decision**: The `noExternal: ['@openzeppelin/adapter-evm-core']` pattern in `adapter-evm` scales to 18+ entry points without architectural changes. Each `adapter-evm` entry point (e.g., `src/capabilities/addressing.ts`) re-exports from the corresponding `adapter-evm-core` module. tsdown inlines the core code independently per entry point.

**Rationale**: tsdown processes each entry point independently. The `noExternal` directive applies uniformly — each entry's output bundles the core modules it imports. Shared code between entry points may be duplicated in output, but this is acceptable because:
1. Consumers only import the sub-paths they need (no full bundle loaded)
2. The shared code is type definitions and small utilities, not large runtime libraries
3. If duplication becomes excessive, tsdown's `splitting: true` option can extract shared chunks (stretch goal)

**Risk**: Build time may increase linearly with entry count. Mitigated by NFR-001 (2x build time cap) and by tsdown's parallel compilation.

## R11: ContractStateCapabilities Absorption

**Decision**: The `ContractStateCapabilities` interface (`isViewFunction`, `queryViewFunction`, `formatFunctionResult`) is absorbed into existing capability interfaces:
- `isViewFunction` → `SchemaCapability` (it's a schema analysis method)
- `queryViewFunction` → `QueryCapability` (it's a read operation)
- `formatFunctionResult` → `QueryCapability` (it formats query results)

**Rationale**: `ContractStateCapabilities` was an extension interface on `FullContractAdapter` that grouped read-only query methods. These methods naturally belong to SchemaCapability and QueryCapability in the new architecture. The `FullContractAdapter` type alias (`ContractAdapter & ContractStateCapabilities`) is removed entirely.

## R12: Shared Runtime Utility Extraction

**Decision**: Extract profile composition, runtime lifecycle guards, and runtime-scoped capability memoization into an internal workspace package: `packages/adapter-runtime-utils`.

**Rationale**: After Phase 5 landed in both EVM and Stellar adapters, the same logic existed in multiple places: runtime disposal guards, pending-promise rejection, cleanup registration, profile requirement validation, shared capability caching, and lazy runtime-scoped capability assembly. Centralizing that behavior keeps EVM and Stellar aligned, reduces duplication, and makes lifecycle behavior testable in isolation without going through a full adapter package.

**Shared exports**:
- `createRuntimeFromFactories`, `PROFILE_REQUIREMENTS`, `isProfileName`
- `withRuntimeCapability`, `guardRuntimeCapability`, `registerRuntimeCapabilityCleanup`
- `createLazyRuntimeCapabilityFactories`

**Implications**:
1. Adapter-specific `shared-state.ts` and capability helper modules become thin wrappers around the shared runtime utilities.
2. Shared runtime behavior can be unit-tested directly in `packages/adapter-runtime-utils/src/__tests__/` instead of relying only on adapter-level integration coverage.
3. Public adapter APIs remain unchanged — the extraction is an internal maintainability improvement, not a new consumer-facing feature.
