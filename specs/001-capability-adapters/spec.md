# Feature Specification: Capability-Based Adapter Architecture

**Feature Branch**: `001-capability-adapters`  
**Created**: 2026-03-30  
**Status**: Draft  
**Input**: User description: "Refactor into Capability-Based Adapter Architecture"  
**Reference**: [Capability-Based Adapter Architecture (Notion)](https://www.notion.so/327cbd127860819281b3f97b08a8afc3)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Lightweight App Consumes Only Declarative Capabilities (Priority: P1)

A developer building a code-generation app (like RWA Wizard) needs address validation, network catalogs, explorer URLs, and UI labels from an adapter — without pulling in wallet initialization, RPC connections, or access-control services. They import only the capabilities they need via sub-path exports, with zero runtime side-effects and no heavyweight dependencies.

**Why this priority**: This is the primary pain point that motivated the entire refactoring. Lightweight apps are currently forced into all-or-nothing adoption. Unblocking Declarative-profile consumption is the highest-value deliverable.

**Independent Test**: Can be fully tested by importing `@openzeppelin/adapter-stellar/addressing` in isolation and verifying that address validation works without any wallet, RPC, or access-control initialization occurring.

**Acceptance Scenarios**:

1. **Given** a new app that only needs address validation and network info, **When** the developer imports `addressing` and `networks` from the adapter sub-path exports, **Then** they receive working capability instances without any wallet or RPC initialization side-effects.
2. **Given** a Declarative-profile consumption, **When** the developer calls `createRuntime('declarative', networkConfig)`, **Then** they receive an object containing only Addressing, Explorer, NetworkCatalog, and UiLabels capabilities — no Tier 2 or Tier 3 capabilities are instantiated.
3. **Given** a lightweight app consuming only Tier 1 capabilities, **When** the app's bundle is analyzed, **Then** wallet SDKs, RPC clients, and access-control modules are tree-shaken out of the final bundle.

---

### User Story 2 - Shared UI Components Accept Narrow Capability Props (Priority: P1)

A shared component like `AddressField` currently requires a full `ContractAdapter` prop even though it only calls `isValidAddress()`. After refactoring, it accepts an `AddressingCapability` instead, allowing any app — including lightweight generators — to use the component without instantiating a full adapter. The old `ContractAdapter` prop is removed; all consumers must pass capability props.

**Why this priority**: Shared UI components are consumed across all apps. Narrowing their dependencies is required before any consumer app can adopt capability-based consumption. Without this, the new architecture has no practical integration point.

**Independent Test**: Can be fully tested by passing an `AddressingCapability` object (not a full adapter) to `AddressField` and verifying validation works.

**Acceptance Scenarios**:

1. **Given** an `AddressField` component, **When** it receives an `AddressingCapability` instead of a full `ContractAdapter`, **Then** address validation works identically to the current behavior.
2. **Given** an existing app that was passing a full `ContractAdapter` to `AddressField`, **When** the component is updated to accept only `AddressingCapability`, **Then** the old `adapter` prop is no longer accepted — the consumer must update its integration.
3. **Given** `ExecutionConfigDisplay` component, **When** it is updated to accept `ExecutionCapability`, **Then** it no longer accepts a full `ContractAdapter` — consumers must pass the narrow capability prop.

---

### User Story 3 - Adapter Internals Restructured Into Capability Modules (Priority: P1)

Adapter packages (adapter-evm, adapter-stellar) restructure their internal code so that each capability is implemented in a dedicated module under `src/capabilities/`, with sub-path exports in `package.json`. The monolithic adapter class (`StellarAdapter`, `EvmAdapter`) is removed and replaced by capability modules and profile factories.

**Why this priority**: This is the foundational refactoring that enables all other stories. Without restructured internals and sub-path exports, neither direct capability consumption nor profile-based consumption can work.

**Independent Test**: Can be fully tested by verifying that `import { createAddressing } from '@openzeppelin/adapter-stellar/addressing'` resolves and returns a working `AddressingCapability`, and that the monolithic `StellarAdapter` class no longer exists in the package's public API.

**Acceptance Scenarios**:

1. **Given** the adapter-stellar package, **When** it is restructured with capability modules, **Then** all 13 capabilities are individually importable via sub-path exports.
2. **Given** the restructured adapter-stellar package, **When** a consumer tries to import the old `StellarAdapter` class, **Then** it is no longer available — consumers must use capability or profile imports instead.
3. **Given** the restructured adapter-evm package, **When** each capability module is imported independently, **Then** it does not trigger initialization of unrelated capabilities (e.g., importing `addressing` does not initialize wallet).

---

### User Story 4 - Capability Interfaces Defined in Shared Types Package (Priority: P1)

All 13 capability interfaces (AddressingCapability, ExplorerCapability, etc.), the `RuntimeCapability` base, profile types, and `EcosystemRuntime` are added to `@openzeppelin/ui-types`. The monolithic `ContractAdapter` interface is replaced by the new capability interfaces.

**Why this priority**: Type definitions are the foundation everything else depends on. Adapter restructuring, component refactoring, and consumer migration all require the capability interfaces to exist first.

**Independent Test**: Can be fully tested by importing capability interfaces from `@openzeppelin/ui-types` and type-checking adapter implementations against them.

**Acceptance Scenarios**:

1. **Given** the `@openzeppelin/ui-types` package, **When** capability interfaces are added, **Then** all 13 capability interfaces are importable and the old `ContractAdapter` interface is removed.
2. **Given** the new `RuntimeCapability` base interface, **When** Tier 2 and Tier 3 capability interfaces extend it, **Then** each exposes a `readonly networkConfig: NetworkConfig` property.
3. **Given** the `AccessControlCapability` interface, **When** it is defined, **Then** it matches the existing `AccessControlService` interface (19 methods + supporting types) — a direct promotion, not a redesign.

---

### User Story 5 - Profile-Based Consumption for Common App Archetypes (Priority: P2)

An app developer chooses a profile (Declarative, Viewer, Transactor, Composer, or Operator) that matches their app's functional archetype and receives a pre-composed bundle of capabilities in a single call, with shared internal state and lifecycle management handled automatically.

**Why this priority**: Profiles are convenience types that simplify adoption. They're important for developer experience but not strictly required — direct capability consumption (P1) already works. Profiles add value once the underlying capability infrastructure is in place.

**Independent Test**: Can be fully tested by calling `createRuntime('operator', networkConfig)` and verifying that the returned object contains all Tier 1 capabilities, all Tier 2 capabilities, and Tier 3 capabilities Execution, Wallet, UiKit, and AccessControl — with shared wallet state across capabilities.

**Acceptance Scenarios**:

1. **Given** a developer building a governance tool, **When** they create an Operator runtime, **Then** they receive all Tier 1 capabilities (Addressing, Explorer, NetworkCatalog, UiLabels), all Tier 2 capabilities (ContractLoading, Schema, TypeMapping, Query), and Tier 3 capabilities Execution, Wallet, UiKit, and AccessControl. Relayer is not included by default but can be consumed directly via the capability factory.
2. **Given** capabilities from the same profile runtime, **When** the developer connects a wallet via WalletCapability, **Then** the connected address is available to ExecutionCapability and AccessControlCapability without separate initialization.
3. **Given** a profile runtime, **When** the network changes, **Then** `dispose()` on the old runtime cleans up runtime-owned listeners and subscriptions, a new runtime is created for the new network config, and any ecosystem-scoped wallet session is preserved or restored separately when supported by the wallet library.

---

### User Story 6 - Adapter Author Implements Partial Capabilities (Priority: P2)

A contributor adding support for a new blockchain ecosystem (e.g., Polkadot, Solana) can implement only the capabilities they support — starting with just Addressing + Explorer + NetworkCatalog — and ship a valid adapter that integrates with any app using the Declarative profile. They don't need to stub ~40 methods.

**Why this priority**: Lowering the barrier for adapter authors expands ecosystem coverage. However, this depends on the capability interfaces (P1) and package structure (P1) being in place first.

**Independent Test**: Can be fully tested by creating a new adapter package that implements only `AddressingCapability`, `ExplorerCapability`, and `NetworkCatalogCapability`, and verifying it works with a Declarative-profile consumer.

**Acceptance Scenarios**:

1. **Given** a new adapter package implementing only 3 Tier 1 capabilities, **When** a Declarative-profile app consumes it, **Then** the app functions correctly for address validation, network selection, and explorer links.
2. **Given** a new adapter that does not implement ExecutionCapability, **When** a consumer checks `capabilities.execution`, **Then** it returns `undefined` and the app can gracefully handle the absence.
3. **Given** a new adapter author, **When** they implement AddressingCapability, **Then** they can run a per-capability conformance test suite to verify their implementation without needing a full adapter harness.

---

### User Story 7 - Consumer Apps Migrate to Capability-Based Consumption (Priority: P1)

All existing consumer apps (RWA Wizard, UI Builder, Role Manager) must migrate from full `ContractAdapter` consumption to profile-based or direct capability consumption. This is a breaking change — no legacy fallback is provided.

**Why this priority**: Since there is no backward compatibility, consumer migration is part of the core deliverable, not a deferred follow-up. All apps must be updated as part of the same release cycle.

**Independent Test**: Can be fully tested by migrating each consumer app to its target profile and verifying all existing functionality works using capability-based props.

**Acceptance Scenarios**:

1. **Given** RWA Wizard currently instantiating a full adapter, **When** it migrates to `DeclarativeProfile` consumption, **Then** all existing wizard functionality works with reduced bundle size and no wallet/RPC initialization.
2. **Given** UI Builder using `ContractAdapter`, **When** it migrates to `ComposerProfile`, **Then** all existing builder functionality is preserved using capability-based consumption.
3. **Given** Role Manager using `ContractAdapter` + `getAccessControlService()`, **When** it migrates to `OperatorProfile`, **Then** all existing role management functionality works via `AccessControlCapability` directly from the profile runtime.
4. **Given** all three consumer apps, **When** the migration is complete, **Then** no app imports `ContractAdapter`, `createAdapter`, or the monolithic adapter classes.

---

### User Story 8 - Remaining Published Adapters Converge on Capability Exports (Priority: P3)

The remaining published adapter packages (`adapter-polkadot`, `adapter-solana`, and `adapter-midnight`) migrate to the same `capabilities` + `createRuntime` package surface after the initial ecosystem rollout is stable. `adapter-polkadot` preserves its current EVM-backed behavior first, while `adapter-solana` and `adapter-midnight` expose the capability sets they actually support and reject unsupported profiles explicitly.

**Why this priority**: This does not block the initial breaking-change release, but it is required to eliminate the long-term dual architecture where some published adapters still expose `createAdapter` and monolithic adapter classes.

**Independent Test**: Can be fully tested by verifying that each of the three packages exports `ecosystemDefinition.capabilities` and `createRuntime`, no longer exports `createAdapter`, and its Tier 1 sub-paths pass the isolation validator.

**Acceptance Scenarios**:

1. **Given** `@openzeppelin/adapter-polkadot`, **When** it is migrated, **Then** EVM-backed Polkadot networks expose capability and profile sub-paths instead of `PolkadotAdapter`, and unsupported non-EVM execution paths fail explicitly instead of relying on missing methods.
2. **Given** `@openzeppelin/adapter-solana` or `@openzeppelin/adapter-midnight`, **When** the package is migrated, **Then** supported capabilities are exposed via `CapabilityFactoryMap`, unsupported capabilities are `undefined`, and `createRuntime` throws `UnsupportedProfileError` when a profile requires unsupported capabilities.
3. **Given** all published adapter packages, **When** release validation runs, **Then** no package exports `createAdapter` or a public monolithic adapter class.

---

### Edge Cases

- What happens when an app consumes capabilities from two different capability factories created with different NetworkConfigs? They must operate in complete isolation — no shared wallet or RPC state.
- How does the system handle a profile that requests a capability the adapter doesn't implement? The profile factory MUST throw `UnsupportedProfileError` at creation time listing the missing capabilities, not fail silently at method call time.
- What happens when `dispose()` is called on a runtime while async operations (e.g., `signAndBroadcast`) are in flight? The runtime MUST reject pending operations with `RuntimeDisposedError` and release resources. `dispose()` is idempotent — calling it twice is a no-op (does not throw), and cleanup runs in staged order so listeners/subscriptions are released before wallet or RPC teardown.
- What happens to an external wallet session when a runtime is disposed during a network change? Runtime disposal cleans up runtime-owned resources only; it MUST NOT count as a user-owned wallet disconnect. Consumer orchestration may keep or later restore one dormant wallet session per ecosystem when the underlying wallet library supports it.
- What happens when an adapter author implements a capability interface but with incorrect runtime behavior (e.g., `isValidAddress` always returns true)? Conformance test suites (stretch goal) should catch this.
- What happens when `createRuntime` is called with an invalid `ProfileName` string? It MUST throw a `TypeError` with a message listing the valid profile names.
- What happens when a consumer imports a profile runtime AND a standalone capability from the factory map for the same `NetworkConfig`? They are fully isolated — the standalone capability does not share state with the profile runtime.
- What happens when a consumer accesses a capability property on `EcosystemRuntime` that the profile does not include (e.g., `runtime.accessControl` on a Viewer runtime)? The property is `undefined` at runtime. TypeScript's type system reflects this via optional properties on profile-specific runtime types.
- What happens when a standalone capability (created via `CapabilityFactoryMap`) is no longer needed? Tier 1 capabilities are stateless and need no disposal. Tier 2+ standalone capabilities expose a `dispose()` method on the capability instance itself for resource cleanup.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST define 13 capability interfaces in the shared types package (`@openzeppelin/ui-types`), replacing the monolithic `ContractAdapter` interface.
- **FR-002**: System MUST define a `RuntimeCapability` base interface with `readonly networkConfig: NetworkConfig` that all Tier 2 and Tier 3 capability interfaces extend.
- **FR-003**: System MUST restructure adapter packages (adapter-evm-core, adapter-evm, adapter-stellar) to implement each capability in a dedicated module under `src/capabilities/`. EVM capabilities are implemented in `adapter-evm-core`; `adapter-evm` re-exports them via sub-path exports. The monolithic adapter classes are removed.
- **FR-004**: System MUST expose all 13 capabilities and all 5 profiles as sub-path exports in each adapter package's `package.json`.
- **FR-005**: *(Merged into FR-003 — monolithic class removal is covered there.)*
- **FR-006**: System MUST enforce tier isolation via sub-path exports — importing a Tier 1 capability (e.g., `@openzeppelin/adapter-evm/addressing`) MUST NOT physically include any Tier 2 or Tier 3 code (wallet, RPC, access-control) in the import graph, regardless of bundler configuration.
- **FR-007**: System MUST replace the `createAdapter` factory on `EcosystemExport` with a `capabilities` map that provides factory functions for each capability and a `createRuntime` function for profile-based consumption.
- **FR-008**: System MUST implement 5 profile factories (Declarative, Viewer, Transactor, Composer, Operator) that compose capabilities with shared internal state.
- **FR-009**: System MUST ensure that capabilities created within the same profile runtime share runtime-scoped internal state (for example wallet/session state, cached contract-loading dependencies, and adapter-specific runtime resources) while standalone factory invocations and capabilities from different runtimes remain isolated.
- **FR-010**: System MUST provide a `dispose()` method on profile runtimes (`EcosystemRuntime`) to clean up event listeners, subscriptions, and stateful resources.
- **FR-011**: System MUST update all shared UI components and hooks that accept `ContractAdapter` or `FullContractAdapter` props to accept only narrow capability props. The complete list (13 components + hooks/providers):
  - Components with `ContractAdapter` props: `AddressField`, `ContractDefinitionSettingsPanel`, `ObjectField`, `ArrayObjectField`, `AddAliasDialog`, `NetworkSettingsDialog`, `DynamicFormField`, `NetworkServiceSettingsPanel`, `ExecutionConfigDisplay`, `ViewFunctionsPanel`, `NetworkSwitchManager`
  - Components with `FullContractAdapter` props: `TransactionStatusDisplay`, `ContractStateWidget`
  - Hooks/Providers: `AdapterProvider` (`resolveAdapter` function), `useNetworkErrorAwareAdapter`, `useExecutionValidation`, field registry typing
  - The `FullContractAdapter` type alias is removed alongside `ContractAdapter`.
- **FR-012**: System MUST update all existing consumer apps (RWA Wizard, UI Builder, Role Manager) to use capability-based or profile-based consumption in the same release cycle.
- **FR-013**: System MUST promote the existing `AccessControlService` interface (19 methods + 20 supporting types + 5 error classes) to `AccessControlCapability` as a direct rename — not a redesign.
- **FR-014**: All functionality currently delivered through the monolithic adapter MUST be preserved in the capability-based architecture — no features are lost in the migration.
- **FR-015**: `createRuntime` MUST be synchronous — it composes pre-built capability instances and returns the `EcosystemRuntime` immediately. Async initialization (RPC connection, wallet discovery) happens lazily on first capability method call. If the adapter does not support all capabilities required by the requested profile, `createRuntime` MUST throw `UnsupportedProfileError` synchronously.
- **FR-016**: The `ContractStateCapabilities` interface (`isViewFunction`, `queryViewFunction`, `formatFunctionResult`) MUST be absorbed into the `QueryCapability` and `SchemaCapability` interfaces. The `FullContractAdapter` type alias is removed as part of FR-003's monolithic interface removal.
- **FR-017**: The `initialAppServiceKitName` property MUST move to an optional `options` parameter on `createRuntime` (e.g., `createRuntime(profile, config, { uiKit?: string })`). The `getExportBootstrapFiles` method MUST remain on `EcosystemExport` as a build-time concern, not a runtime capability.
- **FR-018**: Tier 2+ standalone capabilities created via `CapabilityFactoryMap` MUST expose a `dispose()` method for resource cleanup, matching the lifecycle contract of profile runtimes.
- **FR-019**: System MUST define follow-up migration work for `@openzeppelin/adapter-polkadot`, `@openzeppelin/adapter-solana`, and `@openzeppelin/adapter-midnight` so all published adapters converge on the `capabilities` + `createRuntime` surface. Adapters with incomplete capability coverage MUST expose unsupported capabilities as `undefined` and reject unsupported profiles with `UnsupportedProfileError`.
- **FR-020**: Consumer-facing wallet orchestration MUST treat `EcosystemRuntime` instances as network-scoped and disposable while allowing wallet provider/session lifetime to be ecosystem-scoped. Disposing a runtime MUST release runtime-owned listeners, subscriptions, and async work without forcing an external wallet disconnect; explicit disconnect remains a user-owned action.

### Key Entities

- **Capability**: A small, composable interface representing a focused area of adapter functionality (e.g., address validation, transaction execution, wallet connection). 13 capabilities organized in 3 tiers.
- **Profile**: A pre-composed bundle of capabilities matching a common app archetype (Declarative, Viewer, Transactor, Composer, Operator). Convenience type, not enforcement mechanism.
- **EcosystemRuntime**: The runtime object returned by a profile factory. Contains capability accessors, the network config, and a `dispose()` method for lifecycle management. Immutable once created — network changes require disposing and recreating.
- **Capability Factory**: A function on `EcosystemExport.capabilities` that creates a standalone capability instance for a given `NetworkConfig`. Standalone factory invocations are isolated from each other and from profile runtimes unless an adapter explicitly composes them through a runtime-scoped factory map.
- **RuntimeCapability**: Base interface for Tier 2+ capabilities exposing `readonly networkConfig: NetworkConfig`.
- **Wallet Session**: Consumer-owned wallet/provider lifetime for a single ecosystem (for example EVM or Stellar). Wallet sessions may survive network-scoped runtime recreation and may be restored after reactivation when the connector or wallet library supports it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A Declarative-profile app (e.g., RWA Wizard) can consume adapter capabilities without instantiating wallet, RPC, or access-control infrastructure — verified by importing `@openzeppelin/adapter-evm/addressing` in a test harness and asserting that `require.resolve` / dynamic `import()` does not load any module from `wallet/`, `transaction/`, or `access-control/` paths.
- **SC-002**: An adapter author can ship a valid adapter with only 3 capabilities (Addressing, Explorer, NetworkCatalog) and have it integrate with Declarative-profile consumers — reducing the minimum implementation surface from ~45 methods/properties on `ContractAdapter` to the 3 methods across those 3 capability interfaces (`isValidAddress`, `getExplorerUrl`, `getNetworks`).
- **SC-003**: All functionality previously delivered through the monolithic adapter is fully preserved in the capability-based architecture — no features are lost. Consumer app test suites are updated to use the new capability-based API and all pass. Test suite updates are part of the migration scope (not a separate effort).
- **SC-004**: Shared UI components accept only narrow capability props — no component or hook accepts `ContractAdapter` or `FullContractAdapter` after the migration. Verified by `grep -r 'ContractAdapter' packages/` returning zero matches in component/hook source files.
- **SC-005**: Each of the 13 capabilities can be imported individually via sub-path exports without triggering initialization of unrelated capabilities — verified by a test that dynamically imports each Tier 1 sub-path and asserts that the module's transitive dependency graph does not include any Tier 2/3 module files (e.g., via Node's `--experimental-loader` or bundle analysis).
- **SC-006**: Capabilities created from the same profile runtime share wallet/RPC state — verified by a test that creates an Operator runtime, calls `connectWallet()` on `WalletCapability`, and asserts that `ExecutionCapability` and `AccessControlCapability` can observe the connected wallet address without separate `connectWallet()` calls.
- **SC-007**: Same-ecosystem network switching (for example EVM mainnet → EVM testnet) preserves the wallet provider/session boundary — verified by a consumer-level test that recreates the runtime for the new network, switches chain if needed, and does not require the user to reconnect the wallet manually.

## Clarifications

### Session 2026-03-30

- Q: Where do EVM capabilities live — in `adapter-evm-core` or merged into `adapter-evm`? → A: Capabilities live in `adapter-evm-core`; `adapter-evm` re-exports them via sub-path exports.
- Q: Is Open Accounts in scope for this release? → A: Exclude for now. It will be built against capability interfaces from the start.
- Q: How should network switching work — dispose-and-recreate or mutable update? → A: Dispose-and-recreate. Consumer calls `dispose()` on the current runtime, then calls the profile/capability factory again with the new `NetworkConfig`. No `switchNetwork()` method.
- Q: How strict should Tier 1 isolation from Tier 2/3 dependencies be? → A: Physical isolation via sub-path exports. Each capability is its own sub-path export; importing a Tier 1 capability physically cannot pull in wallet/RPC code regardless of bundler configuration.
- Q: Who owns the capability interface definitions — types package or adapter packages? → A: All 13 capability interfaces are defined in `@openzeppelin/ui-types`. Adapter packages only implement them. Single source of truth.
- Q: Do standalone capability factory calls share state with profile runtimes or other standalone calls for the same network? → A: No. Shared state is guaranteed only within a single `EcosystemRuntime`; standalone factory invocations are isolated unless an adapter explicitly wraps them in runtime-scoped composition.
- Q: Must each adapter keep its own copy of the profile-composition and lifecycle logic? → A: No. Adapters may reuse shared internal runtime utilities as long as the public capability/profile behavior and lifecycle contract stay unchanged.

### Session 2026-04-01

- Q: If runtimes are disposed and recreated on every network change, should wallet sessions also be disposed? → A: No. `EcosystemRuntime` remains network-scoped, but wallet/provider lifetime is ecosystem-scoped at the consumer orchestration layer. Runtime disposal releases runtime-owned resources only.
- Q: Who owns reconnect behavior after the capability refactor? → A: The ecosystem wallet session owns restoration semantics. Same-ecosystem network changes should preserve the active wallet session, while cross-ecosystem reactivation may restore a dormant session when the underlying wallet library supports it.
- Q: Is explicit disconnect part of runtime disposal? → A: No. Disconnect remains an explicit user action and must not be triggered as a side effect of runtime recreation.

### Non-Functional Requirements

- **NFR-001**: Build time for adapter packages with 23 tsdown entry points MUST NOT exceed 2x the current build time with 5 entry points. If it does, investigate tsdown parallel compilation or entry point batching.
- **NFR-002**: Total `dist/` output size per adapter package SHOULD NOT increase by more than 30% compared to the current single-entry bundle, accounting for shared code deduplication across entry points.
- **NFR-003**: Per-sub-path peer dependencies are not required — all peer dependencies are declared at the package level. Consumers importing only Tier 1 sub-paths will have unused peer dependencies (e.g., `viem`) declared but not loaded at runtime. This is acceptable because peer dependencies are not bundled.
- **NFR-004**: The coordinated release MUST use a single Changesets major version bump per modified package. No intermediate minor/patch releases during the migration — the breaking change ships as one atomic version.

### Cross-Repository Coordination

The breaking change spans multiple repositories and npm packages. The release sequence is:

1. **`@openzeppelin/ui-types`** (openzeppelin-ui repo) — publish first with new capability interfaces and removed `ContractAdapter`
2. **`@openzeppelin/adapter-evm-core`**, **`@openzeppelin/adapter-evm`**, **`@openzeppelin/adapter-stellar`** (openzeppelin-adapters repo) — publish after types, implementing the new interfaces
3. **`@openzeppelin/ui-components`**, **`@openzeppelin/ui-renderer`**, **`@openzeppelin/ui-react`** (openzeppelin-ui repo) — publish after adapters, consuming capability props
4. **Consumer apps** (ui-builder, role-manager, rwa-wizard repos) — update after all packages are published
5. **Follow-on adapter wave** (`@openzeppelin/adapter-polkadot`, `@openzeppelin/adapter-solana`, `@openzeppelin/adapter-midnight`) — migrate after the core ecosystem rollout is stable

All packages in steps 1–3 are published before any consumer app is updated. PRs across repos are prepared in parallel but merged in sequence. If any step fails, the release is halted — no partial migration is acceptable. Step 5 is a follow-on wave and is not a gate for the initial consumer-app migration.

### Rollback Strategy

If the coordinated release encounters a blocking issue after partial publication:
- Published packages with the new major version can coexist with the old version in npm (semver).
- Consumer apps pin the old version until the issue is resolved.
- No rollback of published packages is needed — consumers simply don't upgrade until all packages are ready.
- This is not a runtime rollback; it is a release-gate hold.

## Assumptions

- The monolithic `ContractAdapter` interface, `StellarAdapter` class, and `EvmAdapter` class will be removed. No backward-compatible facades or shims are provided.
- All existing consumer apps (RWA Wizard, UI Builder, Role Manager) will be migrated to capability-based consumption in the same release cycle. This is a coordinated breaking change across the ecosystem. Open Accounts is excluded from this scope — it will be built against capability interfaces from the start.
- The existing `AccessControlService` interface is mature and battle-tested — it is promoted to `AccessControlCapability` as a direct rename with no method changes.
- `adapter-evm-core`, `adapter-evm`, and `adapter-stellar` are the only adapter packages actively restructured in the initial rollout. `adapter-polkadot`, `adapter-solana`, and `adapter-midnight` are covered by an explicit follow-on migration wave after the initial ecosystem rollout stabilizes.
- The `@openzeppelin/ui-types` package is the single source of truth for all capability interfaces and will be the first package updated.
- Per-capability conformance test suites are a stretch goal for the initial rollout — type-level conformance is sufficient initially.
- Shared UI component packages (`@openzeppelin/ui-components`, `@openzeppelin/ui-renderer`, `@openzeppelin/ui-react`) will be updated simultaneously with the adapter refactoring since no backward compatibility shims are provided.
- RWA Wizard currently depends on legacy `@openzeppelin/ui-builder-adapter-*` packages (not the current `@openzeppelin/adapter-*` namespace). Migration includes updating these dependency names to the new `@openzeppelin/adapter-*` namespace as part of the capability migration.
- `adapter-polkadot` depends on `adapter-evm-core` for shared EVM logic. Its follow-on migration preserves the current EVM-backed execution path first; substrate-specific execution remains an explicit package-level follow-up inside that adapter.
- The `lint:adapters` CI check currently validates `ContractAdapter` interface compliance. It will break when `ContractAdapter` is removed and MUST be updated (or temporarily disabled) in Phase B, then replaced with capability conformance validation in Phase E.
- The `adapters-vite` package (`createOpenZeppelinAdapterIntegration`, `defineOpenZeppelinAdapterViteConfig`) does NOT require changes — it operates on build configuration, not runtime adapter interfaces. The `ecosystemDefinition` export name on each adapter module is preserved.
- The `ecosystemDefinition` named export on each adapter module is preserved. Only the shape of `EcosystemExport` changes (replacing `createAdapter` with `capabilities` + `createRuntime`).
