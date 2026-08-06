# API Reference — IRS Identity Write Error Fidelity (SF-5)

Public method signatures are unchanged from SF-1…SF-4. This reference documents
**widened throw sites** and probe contracts. Source of truth:
`packages/adapter-evm-core/src/irs/service.ts`.

## Errors (reused from `@openzeppelin/ui-types`)

### `IdentityAlreadyRegistered`

```ts
class IdentityAlreadyRegistered extends RICapabilityError {
  readonly code: 'ALREADY_ONBOARDED';
  constructor(
    message: string,
    holder: string,
    onchainId?: string,
    contractAddress?: string
  );
}
```

Thrown **before** `execute` when a successful read proves already-complete:

| Arm | When | `holder` | `onchainId` | `contractAddress` |
|-----|------|----------|-------------|-------------------|
| `registerIdentity` | registry lookup `found` | holder | existing registry id | `identityRegistry` |
| `grantHolderManagementKey` | key-purpose `has` MANAGEMENT | holder | input `onchainId` | identity (= input `onchainId`) |
| `deployOnchainId` | factory `found` | holder | factory-found id | `identityFactory` |

**No new error code.** Dig-locked reuse.

### `IdentityOperationFailed`

```ts
class IdentityOperationFailed extends RICapabilityError {
  readonly code: 'IRS_OPERATION_FAILED';
  constructor(
    message: string,
    operation: string,
    cause?: Error,
    contractAddress?: string
  );
}
```

Used for:

- Pre-submit `read_failed` on grant / deploy (ambiguous — **no** submit; cause chained).
- Confirmed-path post-submit verify failures (SF-2 / SF-3 — unchanged).
- Deploy timeout / unresolvable / revert (existing INDETERMINATE / do-not-retry-blind messaging — **never** rewritten to `ALREADY_ONBOARDED`).

---

## `grantHolderManagementKey`

```ts
async grantHolderManagementKey(
  input: { onchainId: string; holder: string },
  executionConfig: ExecutionConfig,
  onStatusChange?: (status: TxStatus, details: TransactionStatusUpdate) => void,
  runtimeApiKey?: string
): Promise<OperationResult>; // { id: string }
```

Grants holder MANAGEMENT on an ONCHAINID.

**Pre-submit fidelity (SF-5) — both completion modes:**

1. `lookupIdentityKeyPurpose(rpc, onchainId, holder, MANAGEMENT)`
2. Branch on ternary:

| `probe.status` | Behavior |
|----------------|----------|
| `'has'` | Throw `IdentityAlreadyRegistered` — **no** `execute` |
| `'read_failed'` | Throw `IdentityOperationFailed` (ambiguous) — **no** `execute` |
| `'lacks'` | Proceed: assemble → `execute` → SF-3 completion branch |

**After fall-through (`lacks`):**

- `completion === 'submitted'`: return `{ id }` (skip post-submit assert) — SF-3.
- absent / `'confirmed'`: assert holder MANAGEMENT; throw `IdentityOperationFailed` on lacks / RPC fail — unchanged.

**Throws:**

- `IdentityAlreadyRegistered` (`ALREADY_ONBOARDED`) — already holds MANAGEMENT.
- `IdentityOperationFailed` (`IRS_OPERATION_FAILED`) — pre-submit `read_failed`, or post-submit verified failure / RPC fail.

**Does not throw `IdentityAlreadyRegistered` for:** `read_failed`, post-submit lacks after a successful submit, or transport failures.

---

## `deployOnchainId`

```ts
async deployOnchainId(
  input: { holder: string },
  executionConfig: ExecutionConfig,
  onStatusChange?: (status: TxStatus, details: TransactionStatusUpdate) => void,
  runtimeApiKey?: string
): Promise<DeployOnchainIdOutcome>;
```

Deploys ONCHAINID for `holder` via the identity factory.

**Pre-submit fidelity (SF-5) — both completion modes:**

1. `getFactoryIdentity(holder)` → `getIdentityFromFactory`
2. Branch:

| `factory.status` | Behavior |
|------------------|----------|
| `'found'` | Throw `IdentityAlreadyRegistered` — **no** `execute` |
| `'read_failed'` | Throw `IdentityOperationFailed` (ambiguous; do-not-retry-blind) — **no** `execute` |
| `'not_found'` | Proceed: today's SF-2 path |

**After fall-through (`not_found`):** SF-2 completion arms unchanged
(`submitted` → `{ id, completion: 'submitted' }` with no `onchainId`;
`confirmed` → `{ id, onchainId, completion: 'confirmed' }` with required `onchainId`).

**Throws:**

- `IdentityAlreadyRegistered` — factory already links wallet.
- `IdentityOperationFailed` — pre-submit `read_failed`, or timeout / unresolvable / revert / verify fail after submit.

**Never maps to `ALREADY_ONBOARDED`:** receipt wait timeout, unobserved confirmation, unresolvable logs, revert. Typed indeterminate remains **OUT**.

---

## `registerIdentity` (precedent — non-regression)

```ts
async registerIdentity(
  input: { holder: string; onchainId: string },
  executionConfig: ExecutionConfig,
  onStatusChange?: (status: TxStatus, details: TransactionStatusUpdate) => void,
  runtimeApiKey?: string
): Promise<OperationResult>;
```

**Existing fidelity (unchanged):** `getOnchainId(holder)` → if `found`, throw
`IdentityAlreadyRegistered` before `execute`. Grant/deploy SF-5 arms mirror this
throw shape (same class / code).

**Note:** Register's RPC failure path via `getOnchainId` remains as today
(throw `IdentityOperationFailed` on read failure). SF-5 did **not** rewrite
register's read-failure shape; grant/deploy use ternary helpers that return
`read_failed` explicitly.

---

## `registerTrustedIssuer` (intentional noop-success)

```ts
async registerTrustedIssuer(
  input: { /* trusted issuer params */ },
  executionConfig: ExecutionConfig,
  ...
): Promise<OperationResult>;
```

When the issuer is already trusted: returns noop **success**
`{ id: TRUSTED_ISSUER_NOOP_ID }` with **no** transaction. SF-5 does **not**
convert this into an error throw.

---

## `attachClaim`

```ts
async attachClaim(
  input: { onchainId: string; claim: OnboardingClaim },
  executionConfig: ExecutionConfig,
  ...
): Promise<OperationResult>;
```

No claim-exists MECHANISM in the adapter surface. Failures stay generic
`IdentityOperationFailed` (or related write mapping). SF-5 does not invent a
pre-read stack.

---

## Probe helpers (reuse only — unchanged)

### `hasIdentityKeyPurpose`

```ts
hasIdentityKeyPurpose(input: {
  onchainId: string;
  address: string;
  purpose: number;
}): Promise<IdentityKeyPurposeLookup>;
// IdentityKeyPurposeLookup = { status: 'has' | 'lacks' | 'read_failed'; … }
```

Public resume helper. Grant fidelity uses the same underlying
`lookupIdentityKeyPurpose` internally before submit.

### `getFactoryIdentity`

```ts
getFactoryIdentity(holder: string): Promise<FactoryIdentityLookup>;
// FactoryIdentityLookup = { status: 'found' | 'not_found' | 'read_failed'; … }
```

Public resume helper. Deploy fidelity calls this before submit.
