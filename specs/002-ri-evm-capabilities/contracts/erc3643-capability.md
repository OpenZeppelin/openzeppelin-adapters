# Contract: `ERC3643Capability`

**Tier**: 3 | **Defined in**: `@openzeppelin/ui-types` | **Implemented in**: `@openzeppelin/adapter-evm-core` (`createERC3643`), re-exported by `@openzeppelin/adapter-evm/erc3643`

Wraps a T-REX (ERC-3643) permissioned token. Reads run over RPC; writes delegate to an injected `signAndBroadcast` callback. Extends `RuntimeCapability`. Amounts are base-unit decimal `string`.

## Interface (shape contract)

```ts
interface ERC3643Capability extends RuntimeCapability {
  // ---- Reads (no wallet, RPC only) ----
  balanceOf(holder: string): Promise<Amount>;
  isVerified(holder: string): Promise<boolean>;            // never throws for unverified → returns false
  isFrozen(holder: string): Promise<boolean>;
  getJurisdiction(holder: string): Promise<string | undefined>;
  simulateTransfer(input: { from: string; to: string; amount: Amount }): Promise<TransferSimulationResult>;

  // ---- Writes (via injected signAndBroadcast) ----
  mint(
    input: { to: string; amount: Amount },
    executionConfig: ExecutionConfig,
    onStatusChange?: (status: TxStatus, details: TransactionStatusUpdate) => void,
    runtimeApiKey?: string
  ): Promise<OperationResult>;
  burn(input: { from: string; amount: Amount }, executionConfig: ExecutionConfig, onStatusChange?, runtimeApiKey?): Promise<OperationResult>;
  transfer(input: { from: string; to: string; amount: Amount }, executionConfig: ExecutionConfig, onStatusChange?, runtimeApiKey?): Promise<OperationResult>;
  freeze(input: { holder: string }, executionConfig: ExecutionConfig, onStatusChange?, runtimeApiKey?): Promise<OperationResult>;
  unfreeze(input: { holder: string }, executionConfig: ExecutionConfig, onStatusChange?, runtimeApiKey?): Promise<OperationResult>;
}
```

## Factory contract

```ts
function createERC3643(
  config: NetworkConfig,
  options: { signAndBroadcast: SignAndBroadcast }
): ERC3643Capability;
```
- Mirrors `createAccessControl(config, { signAndBroadcast })`. No `WalletCapability` dependency.
- Returns a `guardRuntimeCapability`-wrapped instance exposing `dispose()` (idempotent).

## Behavioral guarantees

| ID | Guarantee |
|----|-----------|
| EC-1 | Reads decode mocked RPC responses into chain-agnostic values; `balanceOf` returns base-unit `string`. |
| EC-2 | `isVerified` returns `false` (never throws) for an unregistered holder. |
| EC-3 | `simulateTransfer` returns `{ allowed: true, modulesEvaluated }` when permitted, `{ allowed: false, blockingModule }` when blocked — never throws for a blocked transfer. |
| EC-4 | Each write builds correct T-REX calldata and submits via the injected `signAndBroadcast`; returns `OperationResult`. |
| EC-5 | Known reverts map to typed errors (`RecipientNotVerified`, `ComplianceModuleRejected`, `HolderFrozen`, `InsufficientBalance`); unmapped reverts → `RICapabilityOperationFailed` with context. |
| EC-6 | Imported via `@openzeppelin/adapter-evm/erc3643` in Node: constructs and reads with no React/Wagmi in the import graph. |
| EC-7 | Strategy-agnostic: composes with an EOA-style, Relayer-style, or test submit-then-poll `signAndBroadcast` without code change. |

## Maps to

Spec: US3, FR-006, FR-009–FR-016. Plugin routes: `/mint`, `/burn`, `/transfer`, `/freeze`, `/unfreeze`, `/balance`.
