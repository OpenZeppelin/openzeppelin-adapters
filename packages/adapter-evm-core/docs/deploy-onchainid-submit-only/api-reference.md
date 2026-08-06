# Deploy ONCHAINID Submit-Only — API Reference

Public outcome types and the adapter IRS capability override for SF-2. Completion
**detection** stays in [write-completion/api-reference.md](../write-completion/api-reference.md)
(SF-1).

**Import surface (SF-2):** `@openzeppelin/adapter-evm-core` main barrel,
`@openzeppelin/adapter-evm-core/irs`, and `capabilities` re-exports.
`@openzeppelin/adapter-evm` re-exports `createIRS` but not the outcome types — import
outcomes from `adapter-evm-core`.

---

## Types

### `interface DeployOnchainIdConfirmedResult`

```ts
import type { DeployOnchainIdResult } from '@openzeppelin/ui-types';

interface DeployOnchainIdConfirmedResult extends DeployOnchainIdResult {
  readonly completion: 'confirmed';
}
```

Confirmed-path deploy result. `onchainId` stays **required** (inherits ui-types
`DeployOnchainIdResult`). Additive `completion` discriminant is MINOR-safe.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | Transaction / submission id from SF-1 execute |
| `onchainId` | `string` | **Required** — parsed from receipt logs after wait |
| `completion` | `'confirmed'` | Discriminant |

### `interface DeployOnchainIdSubmittedResult`

```ts
import type { OperationResult } from '@openzeppelin/ui-types';

interface DeployOnchainIdSubmittedResult extends OperationResult {
  readonly completion: 'submitted';
}
```

Submit-only deploy result. **MECHANISM:** no `onchainId` property on this arm —
callers cannot read a fabricated address.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | SF-1 preferred submission id (`relayerTxId` when provided) |
| `completion` | `'submitted'` | Discriminant |

### `type DeployOnchainIdOutcome`

```ts
type DeployOnchainIdOutcome =
  | DeployOnchainIdConfirmedResult
  | DeployOnchainIdSubmittedResult;
```

Completion-keyed discriminated union. Narrow with `outcome.completion === 'submitted'`
or `'confirmed'`.

**Import:**

```ts
import type {
  DeployOnchainIdOutcome,
  DeployOnchainIdConfirmedResult,
  DeployOnchainIdSubmittedResult,
} from '@openzeppelin/adapter-evm-core';
// or: from '@openzeppelin/adapter-evm-core/irs'
```

---

## Capability

### `interface EvmIRSCapability`

```ts
import type { IRSCapability } from '@openzeppelin/ui-types';

interface EvmIRSCapability extends IRSCapability {
  // `deployOnchainId` is INHERITED, not re-declared: ui-types >= 3.5.0 already types it as
  // (…) => Promise<DeployOnchainIdOutcome>.
  getFactoryIdentity(holder: string): Promise<FactoryIdentityLookup>;
  hasIdentityKeyPurpose(input: {
    onchainId: string;
    address: string;
    purpose: number;
  }): Promise<IdentityKeyPurposeLookup>;
  // … other IRS methods unchanged by SF-2
}
```

A **plain extension** of the shared interface. The outcome union is owned by
`@openzeppelin/ui-types`, so `deployOnchainId` needs no adapter-side `Omit` or override, and
`EvmIRSCapability` ↔ `IRSCapability` stay mutually assignable — an `EvmIRSCapability` can be
passed anywhere an `IRSCapability` is expected. `EvmIRSCapability` adds only the EVM-specific
reads. Shared `DeployOnchainIdResult.onchainId` is still **required**: it is the confirmed arm's
base, never optionalized.

### `deployOnchainId(…): Promise<DeployOnchainIdOutcome>`

Deploy ONCHAINID for `holder` via the identity factory.

**`input`:**

| Field | Type | Notes |
|-------|------|-------|
| `holder` | `string` | Wallet to link; receives wallet-link on deploy |

**`executionConfig`:** standard `ExecutionConfig`. For Relayer submit-only, set
`transactionOptions.completion: 'submitted'` and/or have the strategy return
`result.completion: 'submitted'` (SF-1 dual-source). Absent / `'confirmed'` ≡ today's path.

**Returns:** `Promise<DeployOnchainIdOutcome>`

- Submit-only: `{ id, completion: 'submitted' }` — **async**, resolves promptly after
  submit; does **not** await receipt confirmation.
- Confirmed: `{ id, onchainId, completion: 'confirmed' }` after wait → parse → assert.

**Throws (confirmed path — unchanged):**

| Condition | Error |
|-----------|-------|
| Receipt wait timeout | `IdentityOperationFailed` — INDETERMINATE messaging; do not retry blind |
| On-chain revert | `IdentityOperationFailed` — retry safe once cause addressed |
| Success but unresolvable logs | `IdentityOperationFailed` — identity may exist; probe factory first |
| Operator lacks MANAGEMENT / RPC fail | `IdentityOperationFailed` via key-purpose assert |

**Throws (before post-submit branch — SF-1):**

| Condition | Error |
|-----------|-------|
| Options vs strategy completion disagree | `WriteCompletionDisagreementError` (`code: 'WRITE_COMPLETION_DISAGREEMENT'`) — catch by `code`, not as identity failure |

**Does not throw** for “skipped verify” on submit-only — that is a successful early return.

### `getFactoryIdentity(holder: string): Promise<FactoryIdentityLookup>`

Caller-owned resume helper (unchanged by SF-2). Use after submit-only reconcile.

```ts
import type { FactoryIdentityLookup } from '@openzeppelin/adapter-evm-core/irs';

type FactoryIdentityLookup =
  | { readonly status: 'found'; readonly onchainId: string }
  | { readonly status: 'not_found' }
  | { readonly status: 'read_failed'; readonly cause: Error };
```

`FactoryIdentityLookup` ships on the `./irs` entry (not the main barrel today).
`read_failed` is a **value**, not a throw — do not treat it as `not_found` when deciding
whether to re-deploy.

---

## ui-types (>= 3.5.0 owns the union)

```ts
// @openzeppelin/ui-types — confirmed structural base; NOT optionalized
interface DeployOnchainIdResult extends OperationResult {
  onchainId: string; // REQUIRED
}

interface DeployOnchainIdConfirmedResult extends DeployOnchainIdResult {
  readonly completion: 'confirmed';
}

// Submit-only arm: no `onchainId` property at all
interface DeployOnchainIdSubmittedResult extends OperationResult {
  readonly completion: 'submitted';
}

type DeployOnchainIdOutcome = DeployOnchainIdConfirmedResult | DeployOnchainIdSubmittedResult;

// IRSCapability.deployOnchainId → Promise<DeployOnchainIdOutcome>
```

Consumers that only see `IRSCapability` get the submit-only arm at the type level too — the
union is on the shared interface, so narrowing on `completion` is required there as well. No
adapter-specific type is needed for honest submit-only.

---

## Related (SF-1)

| Symbol | Role |
|--------|------|
| `WriteCompletion` / `WriteCompletionOptions` | Shared vocabulary on `transactionOptions` |
| `WriteExecutionResult` | `{ id, completion }` from adapted executor |
| `WriteCompletionDisagreementError` | Fail-closed dual-source disagreement |

See [write-completion/api-reference.md](../write-completion/api-reference.md).
