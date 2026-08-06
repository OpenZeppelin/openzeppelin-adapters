# IRS Grant Holder MANAGEMENT — API Reference

Public grant and resume APIs on `@openzeppelin/adapter-evm-core`. Completion
vocabulary lives in `@openzeppelin/ui-types`; SF-1 detection helpers remain
core-internal (see [write-completion api-reference](../write-completion/api-reference.md)).

---

## `createIRS(config, options): EvmIRSCapability`

Factory for the EVM IRS / ONCHAINID capability. SF-3 does not change the factory
signature; grant branching is inside `EvmIRSService.grantHolderManagementKey`.

```ts
import { createIRS } from '@openzeppelin/adapter-evm-core';

const irs = createIRS(networkConfig, {
  signAndBroadcast,
  addresses: {
    identityRegistry,
    identityFactory,
    trustedIssuersRegistry,
  },
  operatorManagementKey,
});
```

---

## `grantHolderManagementKey(input, executionConfig, onStatusChange?, runtimeApiKey?): Promise<OperationResult>`

Grant the holder a MANAGEMENT key on their ONCHAINID (`addKey` with purpose
MANAGEMENT / ECDSA).

**Saga ordering (CONVENTION, load-bearing):** call after `deployOnchainId` and
before `attachClaim`.

**Completion (SF-3 / MECHANISM):**

| `WriteExecutionResult.completion` (from SF-1 `execute`) | Behavior | Return |
|---------------------------------------------------------|----------|--------|
| `'submitted'` | Return after submit; **skip** post-submit `keyHasPurpose` assert | `{ id }` |
| `'confirmed'` or absent (SF-1 default) | Assert holder MANAGEMENT; throw on lacks / RPC fail | `{ id }` |

```ts
async grantHolderManagementKey(
  input: { onchainId: string; holder: string },
  executionConfig: ExecutionConfig,
  onStatusChange?: (status: TxStatus, details: TransactionStatusUpdate) => void,
  runtimeApiKey?: string,
): Promise<OperationResult>;
```

**`input`:**

| Field | Type | Notes |
|-------|------|-------|
| `onchainId` | `string` | Deployed ONCHAINID address |
| `holder` | `string` | EOA / account receiving MANAGEMENT |

**`executionConfig`:** same Relayer / EOA / multisig shapes as other IRS writes.
Pass `completion: 'submitted'` via top-level `transactionOptions` and/or strategy
`result.completion` (SF-1 dual-source). Grant does **not** re-read those fields.

**Returns:** `Promise<OperationResult>` — always literal `{ id: string }` on
success. Both arms strip executor `completion` (no leak onto the public wire).
Submit-only `id` prefers `relayerTxId` when SF-1 provided one.

**Does not return:** MANAGEMENT status, `onchainId`, or fabricated success fields.

**Throws:**

| Error | When | Catch tip |
|-------|------|-----------|
| `WriteCompletionDisagreementError` (`code: 'WRITE_COMPLETION_DISAGREEMENT'`) | SF-1 options vs strategy `result` disagree — **before** grant body | Wiring bug; not `IdentityOperationFailed` |
| `IdentityOperationFailed` | Confirmed path: holder lacks MANAGEMENT, or `keyHasPurpose` RPC fail; also execute/submit failures via existing mapper | Resume text includes `onchainId` on RPC fail |

**Not thrown on submit-only success:** later on-chain revert of `addKey`. Caller
must confirm via `hasIdentityKeyPurpose`.

---

## `hasIdentityKeyPurpose(input): Promise<IdentityKeyPurposeLookup>`

Public resume / idempotency probe. **Unchanged by SF-3.** Primary confirmation
tool after submit-only grant (**CONVENTION** for *when* to call; MECHANISM that
grant itself does not auto-poll).

```ts
hasIdentityKeyPurpose(input: {
  onchainId: string;
  address: string;
  purpose: number;
}): Promise<IdentityKeyPurposeLookup>;
```

**`IdentityKeyPurposeLookup`:**

```ts
type IdentityKeyPurposeLookup =
  | { readonly status: 'has' }
  | { readonly status: 'lacks' }
  | { readonly status: 'read_failed'; readonly cause: Error };
```

`lacks` (on-chain false) is distinct from `read_failed` (RPC/transport failure).
Do not treat `read_failed` as `lacks`.

---

## MANAGEMENT purpose value

ERC-734 MANAGEMENT purpose is **`1`**. Pass that literal to
`hasIdentityKeyPurpose` after submit-only grant:

```ts
await irs.hasIdentityKeyPurpose({
  onchainId,
  address: holder,
  purpose: 1,
});
```

The source constant `IDENTITY_KEY_PURPOSE_MANAGEMENT` lives in
`irs/identity-keys.ts` but is **not** re-exported from the
`@openzeppelin/adapter-evm-core` package root barrel today — use the literal
(or deep-import only if your bundler resolves package `src/`, which is not the
supported public contract).

---

## Return hygiene (MECHANISM)

Both completion arms return a **fresh** object literal:

```ts
return { id: result.id };
```

Callers must not rely on object-identity equality with the executor result.
`completion` must not appear on the public grant wire.

---

## Related SF-1 types (consumed, not redefined)

| Type | Package | Role for grant |
|------|---------|----------------|
| `WriteCompletion` | `@openzeppelin/ui-types` | `'submitted' \| 'confirmed'` |
| `WriteCompletionOptions` | `@openzeppelin/ui-types` | Top-level options shape |
| `WriteExecutionResult` | `@openzeppelin/adapter-evm-core` (core-internal) | `{ id, completion }` from `execute` |
| `OperationResult` | `@openzeppelin/ui-types` | Public grant return `{ id }` |

See [write-completion api-reference](../write-completion/api-reference.md) for
dual-source resolve, disagreement error, and `preferSubmissionId`.
