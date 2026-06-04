# Contract: `ERC4626Capability`

**Tier**: 3 | **Defined in**: `@openzeppelin/ui-types` | **Implemented in**: `@openzeppelin/adapter-evm-core` (`createERC4626`), re-exported by `@openzeppelin/adapter-evm/erc4626`

Wraps an ERC-4626 tokenized vault. Reads run over RPC; writes delegate to an injected `signAndBroadcast` callback. Extends `RuntimeCapability`. Amounts/shares are base-unit decimal `string`.

## Interface (shape contract)

```ts
interface ERC4626Capability extends RuntimeCapability {
  // ---- Reads ----
  convertToAssets(shares: Amount): Promise<Amount>;
  convertToShares(assets: Amount): Promise<Amount>;
  totalAssets(): Promise<Amount>;

  // ---- Writes (via injected signAndBroadcast) ----
  deposit(
    input: { from: string; amount: Amount },
    executionConfig: ExecutionConfig,
    onStatusChange?: (status: TxStatus, details: TransactionStatusUpdate) => void,
    runtimeApiKey?: string
  ): Promise<OperationResult & { sharesIssued?: Amount }>;
  withdraw(
    input: { from: string; shares: Amount },
    executionConfig: ExecutionConfig,
    onStatusChange?,
    runtimeApiKey?
  ): Promise<OperationResult & { amountReturned?: Amount }>;
}
```

## Factory contract

```ts
function createERC4626(
  config: NetworkConfig,
  options: { signAndBroadcast: SignAndBroadcast }
): ERC4626Capability;
```
- Mirrors `createAccessControl(config, { signAndBroadcast })`. No `WalletCapability` dependency. `dispose()` idempotent.

## Behavioral guarantees

| ID | Guarantee |
|----|-----------|
| VC-1 | `convertToAssets` / `convertToShares` / `totalAssets` decode mocked RPC into base-unit `string`. |
| VC-2 | `deposit` / `withdraw` build correct ERC-4626 calldata and submit via injected `signAndBroadcast`. |
| VC-3 | Where the receipt exposes them, `sharesIssued` / `amountReturned` are returned as base-unit `string`. |
| VC-4 | Insufficient funds map to `InsufficientBalance` (deposit) / `InsufficientShares` (withdraw). |
| VC-5 | Imported via `@openzeppelin/adapter-evm/erc4626` in Node: no React/Wagmi in the import graph. |

## Maps to

Spec: US4, FR-007, FR-009–FR-016. Plugin routes: `/vault-deposit`, `/vault-withdraw`, and `/balance` (vault portion via `convertToAssets`).
