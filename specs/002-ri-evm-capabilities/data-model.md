# Phase 1 Data Model: RI POC Adapter Capabilities

**Feature**: `002-ri-evm-capabilities` | **Date**: 2026-05-29

These are the chain-agnostic types defined in `@openzeppelin/ui-types` and consumed by the EVM capability implementations. All amount fields are **base-unit decimal `string`** (R1). Shapes shown as TypeScript for precision; they are the contract, not the implementation.

## Shared / reused types (not redefined)

- `RuntimeCapability` — base interface (exposes `readonly networkConfig`, `dispose()`); all three capabilities extend it.
- `ExecutionConfig`, `TxStatus`, `TransactionStatusUpdate` — existing execution contract reused verbatim by every write method.
- `OperationResult` (`{ id: string }`) — existing access-control operation result; reused for write returns where only a tx id is meaningful.
- `Address` — represented as `string` (chain-agnostic), validated by the adapter.

## Common new types

### `Amount`
- Type alias: `type Amount = string;` — base-unit decimal string. Used for every token/share quantity.

### `OnboardingClaim` (pre-signed)
| Field | Type | Notes |
|-------|------|-------|
| `topic` | `string` | Claim topic identifier (e.g. KYC, jurisdiction). |
| `scheme` | `number` | Signature scheme (e.g. ERC-734/EIP-191). |
| `data` | `string` | Hex-encoded claim data. |
| `signature` | `string` | Signature produced by the trusted issuer (consumer-owned key). |
| `issuer?` | `Address` | Optional issuer identity address; defaults to the configured trusted issuer. |

### `ClaimPayload` (key-free helper output)
| Field | Type | Notes |
|-------|------|-------|
| `digest` | `string` | Canonical digest the consumer signs. |
| `topic` | `string` | Echoed for convenience. |
| `scheme` | `number` | Echoed for convenience. |
| `data` | `string` | Echoed for convenience. |

## Entity: ERC3643Capability domain types

### `TransferSimulationResult`
| Field | Type | Notes |
|-------|------|-------|
| `allowed` | `boolean` | Whether the compliance evaluation permits the transfer. |
| `modulesEvaluated` | `number` | Count of compliance modules evaluated (drives the "N modules evaluated" UI badge). |
| `blockingModule?` | `string` | Identifier of the first blocking module when `allowed === false`. |

### `HolderTokenState` (composite read used by `/balance`)
| Field | Type | Notes |
|-------|------|-------|
| `balance` | `Amount` | Token balance, base-unit string. |
| `isVerified` | `boolean` | IRS membership (delegated to IRS read). |
| `isFrozen` | `boolean` | Whether the holder is frozen. |
| `jurisdiction?` | `string` | Jurisdiction code, when available. |

> `HolderTokenState` is optional/derived; individual reads (`balanceOf`, `isFrozen`, jurisdiction) are the primitive surface. Provided for convenience composition.

### Method surface (interface contract — see `contracts/erc3643-capability.md`)
- **Reads**: `balanceOf(holder) → Amount`; `isVerified(holder) → boolean`; `isFrozen(holder) → boolean`; `getJurisdiction(holder) → string | undefined`; `simulateTransfer({ from, to, amount }) → TransferSimulationResult`.
- **Writes** (accept `ExecutionConfig`, optional `onStatusChange`, optional `runtimeApiKey`): `mint({ to, amount })`; `burn({ from, amount })`; `transfer({ from, to, amount })`; `freeze({ holder })`; `unfreeze({ holder })` → `OperationResult`.

## Entity: ERC4626Capability domain types

### `VaultConversion`
Conversions return a single `Amount` (no wrapper needed): `convertToAssets(shares: Amount) → Amount`, `convertToShares(assets: Amount) → Amount`, `totalAssets() → Amount`.

### Method surface (see `contracts/erc4626-capability.md`)
- **Reads**: `convertToAssets(shares) → Amount`; `convertToShares(assets) → Amount`; `totalAssets() → Amount`.
- **Writes** (accept `ExecutionConfig`, optional `onStatusChange`, optional `runtimeApiKey`): `deposit({ from, amount }) → OperationResult & { sharesIssued?: Amount }`; `withdraw({ from, shares }) → OperationResult & { amountReturned?: Amount }`.

## Entity: IRSCapability domain types

### `IdentityRegistration`
| Field | Type | Notes |
|-------|------|-------|
| `holder` | `Address` | Wallet address being registered. |
| `onchainId` | `Address` | The holder's ONCHAINID contract address. |
| `country?` | `number` | Numeric country/jurisdiction code (T-REX `registerIdentity` arg). |

### `OnchainIdLookup`
| Field | Type | Notes |
|-------|------|-------|
| `found` | `boolean` | Whether an ONCHAINID exists for the holder. |
| `onchainId?` | `Address` | Present when `found === true`. |

### Method surface (see `contracts/irs-capability.md`)
- **Reads**: `getOnchainId(holder) → OnchainIdLookup`; `isVerified(holder) → boolean`; `getJurisdiction(holder) → string | undefined`.
- **Writes** (accept `ExecutionConfig`, optional `onStatusChange`, optional `runtimeApiKey`):
  - `deployOnchainId({ holder }) → OperationResult & { onchainId: Address }`
  - `registerTrustedIssuer({ issuer, topics }) → OperationResult` — idempotent (no-op/safe when already registered)
  - `attachClaim({ onchainId, claim: OnboardingClaim }) → OperationResult`
  - `registerIdentity(registration: IdentityRegistration) → OperationResult`
- **Helper (pure, key-free, no execution)**: `buildClaimPayload({ onchainId, topic, scheme, data }) → ClaimPayload`.

## Error types (new, in `@openzeppelin/ui-types/ri-capability-errors.ts`)

Mirror the `AccessControlError` pattern: an abstract base + concrete classes, each with a stable `code` and structured details (R4). Thrown only by **write** methods on known failure conditions; expected negative reads return values.

| Class | `code` | Structured details | Typical source |
|-------|--------|---------------------|----------------|
| `RICapabilityError` (abstract base) | — | `contractAddress?` | base for all below |
| `RecipientNotVerified` | `RECIPIENT_NOT_VERIFIED` | `holder` | mint/transfer when IRS check fails at submit time |
| `ComplianceModuleRejected` | `COMPLIANCE_MODULE_REJECTED` | `blockingModule` | transfer rejected by a compliance module |
| `HolderFrozen` | `HOLDER_FROZEN` | `holder` | burn/transfer on a frozen holder |
| `InsufficientBalance` | `INSUFFICIENT_BALANCE` | `holder`, `requested`, `available?` | burn/transfer/vault-deposit |
| `InsufficientShares` | `INSUFFICIENT_SHARES` | `holder`, `requested`, `available?` | vault-withdraw |
| `IdentityAlreadyRegistered` | `ALREADY_ONBOARDED` | `holder`, `onchainId?` | registerIdentity when already present |
| `IdentityOperationFailed` | `IRS_OPERATION_FAILED` | `operation`, `cause?` | deploy/registration/claim failures |
| `InvalidAmount` | `INVALID_AMOUNT` | `value`, `reason` | malformed/fractional/negative/signed/sci-notation amount `string` at factory boundary |
| `RICapabilityOperationFailed` | `OPERATION_FAILED` | `operation`, `cause?` | generic write failure / unmapped revert |

> Codes are chosen to line up 1:1 with the plugin's documented route error codes (Plugin doc §3b) so the consumer can map `error.code → pluginError(code, …)` directly. Final code names are confirmable during implementation; the set and shape are the contract.

## Type relationships

```text
RuntimeCapability
 ├── ERC3643Capability  → uses Amount, TransferSimulationResult, ExecutionConfig; throws RI*Error
 ├── ERC4626Capability  → uses Amount, ExecutionConfig; throws InsufficientBalance/InsufficientShares
 └── IRSCapability      → uses Address, OnboardingClaim, ClaimPayload, IdentityRegistration, OnchainIdLookup; throws Identity*Error

CapabilityFactoryMap  → + erc3643?, erc4626?, irs?  (optional factory entries)
EcosystemRuntime      → + erc3643?, erc4626?, irs?  (optional accessors, undefined when not composed)
```

## Validation rules

- Addresses validated via the adapter's existing `isValidAddress` before any RPC/write (Constitution II).
- `Amount` strings validated as non-negative base-unit decimals at the factory boundary before `string → bigint` conversion; invalid input (malformed, fractional, negative, signed, or scientific-notation) → `InvalidAmount` (`INVALID_AMOUNT`), thrown before any RPC or submission.
- `isVerified` and `simulateTransfer` never throw for the expected negative case — they return `false` / `{ allowed: false, … }`.
- Identity writes are idempotent on retry (registration/claim attachment safe to re-run) to support partial-failure recovery.
