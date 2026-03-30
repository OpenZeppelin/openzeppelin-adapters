# Data Model: Capability-Based Adapter Architecture

**Feature**: 001-capability-adapters | **Date**: 2026-03-30

## Entities

### Capability (Interface)

A focused, composable interface representing one area of adapter functionality. Capabilities are the atomic building blocks of the architecture.

| Field | Type | Description |
|-------|------|-------------|
| (interface methods) | per-capability | Each capability defines its own method signatures |

**Tier Classification**:

| Tier | Category | Network Required | Wallet Required | Capabilities |
|------|----------|-----------------|-----------------|--------------|
| 1 | Lightweight / Declarative | No | No | Addressing, Explorer, NetworkCatalog, UiLabels |
| 2 | Schema / Definition | Yes (async) | No | ContractLoading, Schema, TypeMapping, Query |
| 3 | Runtime / Stateful | Yes | Yes | Execution, Wallet, UiKit, Relayer, AccessControl |

**Validation Rules**:
- All capability interfaces are defined in `@openzeppelin/ui-types`
- Adapter implementations must satisfy the interface contract (type-checked at compile time)
- Tier 2 and Tier 3 capabilities extend `RuntimeCapability`

---

### RuntimeCapability (Base Interface)

Base interface for all Tier 2 and Tier 3 capabilities, providing access to the network configuration.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `networkConfig` | `NetworkConfig` (readonly) | Yes | The network configuration this capability was created for |

**Validation Rules**:
- Immutable after creation — network changes require dispose-and-recreate
- All Tier 2 and Tier 3 capability interfaces extend this base

---

### Profile (Named Composition)

A pre-composed bundle of capabilities matching a common app archetype. Profiles are convenience types, not enforcement mechanisms — direct capability consumption is always available.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `ProfileName` (string union) | Yes | One of: `declarative`, `viewer`, `transactor`, `composer`, `operator` |
| `capabilities` | Capability tuple | Yes | The set of capabilities included in this profile |

**Profile → Capability Mapping**:

| Profile | Tier 1 | Tier 2 | Tier 3 |
|---------|--------|--------|--------|
| **Declarative** | Addressing, Explorer, NetworkCatalog, UiLabels | — | — |
| **Viewer** | Addressing, Explorer, NetworkCatalog, UiLabels | ContractLoading, Schema, TypeMapping, Query | — |
| **Transactor** | Addressing, Explorer, NetworkCatalog, UiLabels | ContractLoading, Schema, TypeMapping | Execution, Wallet |
| **Composer** | Addressing, Explorer, NetworkCatalog, UiLabels | ContractLoading, Schema, TypeMapping, Query | Execution, Wallet, UiKit, Relayer |
| **Operator** | Addressing, Explorer, NetworkCatalog, UiLabels | ContractLoading, Schema, TypeMapping, Query | Execution, Wallet, UiKit, AccessControl |

**Validation Rules**:
- A profile must include all Tier 1 capabilities
- If a profile includes any Tier 3 capability, it must also include all Tier 2 capabilities that Tier 3 depends on
- The Operator profile may optionally include Relayer and Query (included by default)

---

### EcosystemRuntime (Runtime Instance)

The object returned by a profile factory. Holds capability instances with shared internal state and lifecycle management.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `networkConfig` | `NetworkConfig` (readonly) | Yes | The network this runtime was created for |
| `addressing` | `AddressingCapability` | Yes | Address validation |
| `explorer` | `ExplorerCapability` | Yes | Block explorer URL generation |
| `networkCatalog` | `NetworkCatalogCapability` | Yes | Network discovery |
| `uiLabels` | `UiLabelsCapability` | Yes | Display labels |
| `contractLoading` | `ContractLoadingCapability` | Profile-dependent | Contract loading/parsing |
| `schema` | `SchemaCapability` | Profile-dependent | Function schema access |
| `typeMapping` | `TypeMappingCapability` | Profile-dependent | Type system mapping |
| `query` | `QueryCapability` | Profile-dependent | View function queries |
| `execution` | `ExecutionCapability` | Profile-dependent | Transaction execution |
| `wallet` | `WalletCapability` | Profile-dependent | Wallet connection |
| `uiKit` | `UiKitCapability` | Profile-dependent | UI component provision |
| `relayer` | `RelayerCapability` | Profile-dependent | Relayer/service config |
| `accessControl` | `AccessControlCapability` | Profile-dependent | Role/permission management |
| `dispose()` | `() => void` | Yes | Cleanup lifecycle method |

**State Transitions**:

```
Created → Active → Disposed
           │
           └── dispose() called
                 │
                 ├── 1. Mark runtime as disposed (guard flag)
                 ├── 2. Reject pending async operations with RuntimeDisposedError
                 ├── 3. Remove event listeners (wallet connection, block watchers)
                 ├── 4. Cancel active subscriptions (RPC polling, transaction monitors)
                 ├── 5. Disconnect wallet session (if connected)
                 └── 6. Release RPC client resources (close connections)
```

**`dispose()` Contract**:
- Idempotent — calling `dispose()` multiple times is a no-op (does not throw)
- Synchronous — initiates cleanup but does not await async teardown
- After `dispose()`, any method call on any capability throws `RuntimeDisposedError`
- After `dispose()`, property access on capabilities (e.g., `networkConfig`) throws `RuntimeDisposedError`
- Pending async operations (e.g., `signAndBroadcast` in flight) are rejected with `RuntimeDisposedError`

**Shared State Scope** (within a single runtime):

| Resource | Shared? | Description |
|----------|---------|-------------|
| Wallet Manager | Shared | Single wallet connection shared by Execution, AccessControl, and Wallet capabilities |
| RPC Client | Shared | Single RPC connection shared by Query, Execution, ContractLoading, and AccessControl |
| Network Config | Shared | Immutable reference held by all Tier 2+ capabilities via `RuntimeCapability` base |
| Contract Cache | Shared | Loaded contract schemas cached and available to Schema, TypeMapping, Query |
| Event Bus | Shared | Internal event propagation (wallet status changes, block updates) |
| UI Kit Config | Isolated | Per-capability; UiKit state is not shared with other capabilities |

**Validation Rules**:
- Immutable once created — no `switchNetwork()` method
- `dispose()` must be called before creating a new runtime for a different network
- Capabilities from the same runtime share internal state (see table above)
- Capabilities from different runtimes are fully isolated
- Accessing a capability or its methods/properties after `dispose()` throws `RuntimeDisposedError`

---

### EcosystemExport (Module Shape)

The self-describing module export from each adapter package. Replaces `createAdapter` with capability factories and profile-based runtime creation.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `Ecosystem` | Yes | Ecosystem identifier (from `EcosystemMetadata`) |
| `name` | `string` | Yes | Display name (from `EcosystemMetadata`) |
| `icon` | `ComponentType` | Yes | React icon component (from `EcosystemMetadata`) |
| `networks` | `NetworkConfig[]` | Yes | All supported networks |
| `capabilities` | `CapabilityFactoryMap` | Yes | Individual capability factories |
| `createRuntime` | `(profile, config) => EcosystemRuntime` | Yes | Profile-based runtime factory |
| `adapterConfig` | `AdapterConfig` | No | Build/scaffold configuration |

**Validation Rules**:
- `capabilities` must expose factory functions for every capability the adapter implements
- `createRuntime` must throw at creation time if the adapter doesn't implement all capabilities required by the requested profile
- Unchanged from `EcosystemMetadata`: `id`, `name`, `icon` fields

---

### CapabilityFactoryMap (Factory Registry)

Maps capability names to their factory functions. Each factory creates a capability instance for a given `NetworkConfig`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `addressing` | `(config?: NetworkConfig) => AddressingCapability` | Adapter-dependent | Tier 1 — config optional (used for chain-specific validation rules) |
| `explorer` | `(config?: NetworkConfig) => ExplorerCapability` | Adapter-dependent | Tier 1 — config optional (used for network-specific explorer URLs) |
| `networkCatalog` | `() => NetworkCatalogCapability` | Adapter-dependent | Tier 1 — no config needed (static network list) |
| `uiLabels` | `() => UiLabelsCapability` | Adapter-dependent | Tier 1 — no config needed (static labels) |
| `contractLoading` | `(config: NetworkConfig) => ContractLoadingCapability` | Adapter-dependent | Tier 2 — config required |
| `schema` | `(config: NetworkConfig) => SchemaCapability` | Adapter-dependent | Tier 2 — config required |
| `typeMapping` | `(config: NetworkConfig) => TypeMappingCapability` | Adapter-dependent | Tier 2 — config required |
| `query` | `(config: NetworkConfig) => QueryCapability` | Adapter-dependent | Tier 2 — config required |
| `execution` | `(config: NetworkConfig) => ExecutionCapability` | Adapter-dependent | Tier 3 — config required |
| `wallet` | `(config: NetworkConfig) => WalletCapability` | Adapter-dependent | Tier 3 — config required |
| `uiKit` | `(config: NetworkConfig) => UiKitCapability` | Adapter-dependent | Tier 3 — config required |
| `relayer` | `(config: NetworkConfig) => RelayerCapability` | Adapter-dependent | Tier 3 — config required |
| `accessControl` | `(config: NetworkConfig) => AccessControlCapability` | Adapter-dependent | Tier 3 — config required |

**Validation Rules**:
- Tier 1 `addressing` and `explorer` accept optional `NetworkConfig` — they can function without it but may use it for chain-specific behavior. `networkCatalog` and `uiLabels` never require config.
- Tier 2 and Tier 3 factories MUST receive `NetworkConfig` — they cannot function without a network context.
- Tier 2+ capabilities returned by factories expose a `dispose()` method for standalone resource cleanup.
- Missing entries indicate the adapter does not support that capability — consumers check for `undefined`.
- `createRuntime` internally uses this factory map to compose capabilities with shared state. When used via profiles, the factory map is an internal detail — consumers call `createRuntime` directly.

---

## Relationships

```
EcosystemExport
  ├── extends EcosystemMetadata (id, name, icon)
  ├── contains NetworkConfig[] (networks)
  ├── contains CapabilityFactoryMap (capabilities)
  │     └── each factory creates → Capability instance
  ├── createRuntime() creates → EcosystemRuntime
  │     ├── contains Capability instances (shared state)
  │     └── exposes dispose() lifecycle
  └── optional AdapterConfig (build config)

RuntimeCapability (base)
  └── extended by all Tier 2 and Tier 3 capabilities
        └── exposes readonly networkConfig: NetworkConfig

Profile (named composition)
  └── defines which capabilities are included
        └── used by createRuntime() to compose EcosystemRuntime
```
