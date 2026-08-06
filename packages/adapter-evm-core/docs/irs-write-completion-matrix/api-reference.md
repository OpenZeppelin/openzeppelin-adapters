# IRS Write-Completion Matrix — API Reference

SF-4 introduces **no new public production types or capability methods**. It
documents the locked wire shapes after the grant-style strip, the maintainer
test surface, and the pack markers that gate publish emptiness.

Related APIs:

- Detection / vocabulary — [write-completion/api-reference.md](../write-completion/api-reference.md)
- Deploy outcome union — [deploy-onchainid-submit-only/api-reference.md](../deploy-onchainid-submit-only/api-reference.md)
- Grant skip — [irs-grant-submit-only/api-reference.md](../irs-grant-submit-only/api-reference.md)

---

## Public wire — `EvmIRSService` / `createIRS` returns

### `deployOnchainId(…): Promise<DeployOnchainIdOutcome>`

Owned by **SF-2**. Matrix asserts both arms; does not reopen typing.

| Mode | Return |
|------|--------|
| `completion === 'submitted'` | `{ id: string; completion: 'submitted' }` — **no** `onchainId` |
| absent / `'confirmed'` | `{ id: string; onchainId: string; completion: 'confirmed' }` — `onchainId` **required** |

Types live on `@openzeppelin/adapter-evm-core` (`DeployOnchainIdOutcome`). Public
`@openzeppelin/adapter-evm` bundles runtime via `createIRS`; re-export of outcome
type names from that package is **not** required for SC-005 (Design D-8).

### `grantHolderManagementKey(…): Promise<OperationResult>`

Owned by **SF-3**. Both modes return exact `{ id: string }` (strip `completion`).
Submit-only skips post-submit key-purpose assert; confirmed/absent still asserts.

### `attachClaim(…): Promise<OperationResult>`

```ts
async attachClaim(
  input: { onchainId: string; claim: OnboardingClaim },
  executionConfig: ExecutionConfig,
  onStatusChange?: (status: TxStatus, details: TransactionStatusUpdate) => void
): Promise<OperationResult>
```

**Returns:** `{ id: string }` under both completion modes.

**Behavior:**

- Resolves `execute` once, then returns `{ id: result.id }` (SF-4 strip).
- Does **not** await receipts or assert key purpose after execute.
- Does **not** gain a method-level `if (completion === 'submitted')` early-return.
- Throws `IdentityOperationFailed` when issuer address is missing (pre-execute).

**Does not throw for:** SF-1 disagreement is thrown from the executor path before
strip — catch by `error.code === 'WRITE_COMPLETION_DISAGREEMENT'`.

### `registerIdentity(…): Promise<OperationResult>`

```ts
async registerIdentity(
  input: IdentityRegistration,
  executionConfig: ExecutionConfig,
  onStatusChange?: (status: TxStatus, details: TransactionStatusUpdate) => void
): Promise<OperationResult>
```

**Returns:** `{ id: string }` under both modes.

**Behavior:**

- Pre-submit `getOnchainId` guard still runs (`IdentityAlreadyRegistered` when set).
- After execute: `{ id: result.id }` (SF-4 strip).
- No post-submit receipt wait / key-purpose assert.
- No invented submit-only early-return branch.

### `registerTrustedIssuer(…): Promise<OperationResult>`

```ts
async registerTrustedIssuer(
  input: { issuer: string; topics: string[] },
  executionConfig: ExecutionConfig,
  onStatusChange?: (status: TxStatus, details: TransactionStatusUpdate) => void
): Promise<OperationResult>
```

| Path | Return | Notes |
|------|--------|-------|
| Already trusted (noop) | `{ id: TRUSTED_ISSUER_NOOP_ID }` | **No** `execute`; sentinel is not a `0x` tx hash |
| Execute | `{ id: string }` | SF-4 strip; no new submit-only semantics |

`TRUSTED_ISSUER_NOOP_ID` is exported from `@openzeppelin/adapter-evm-core` IRS
service surface (same as prior releases).

---

## Maintainer surface (tests — not package exports)

### Matrix suite

**Path:** `packages/adapter-evm-core/src/irs/__tests__/irs.write-completion-matrix.test.ts`

| Concept | Shape |
|---------|--------|
| `MatrixOp` | `'deployOnchainId' \| 'grantHolderManagementKey' \| 'attachClaim' \| 'registerIdentity' \| 'registerTrustedIssuer'` |
| `MatrixMode` | `'submitted' \| 'confirmed' \| 'absent'` (`absent` ≡ confirmed) |
| Defect kinds | `always-wait-post-execute`, `always-assert-key-purpose`, `post-execute-wait-wrapper`, `strip-leak`, `audit-noop`, `audit-execute` |

Rows are driven by `describe.each(MATRIX_ROWS)`. Defect helpers live **only** in
this file (no cross-import of SF-2/SF-3 test modules).

### Pack suite

**Paths:**

- `packages/adapter-evm/test/sf-4-write-completion-pack.test.ts`
- `packages/adapter-evm/test/sf-4-pack-helpers.ts`

#### `COMPLETION_PACK_MARKERS`

| Id | Pattern (substring in packed `dist` JS) | Proves |
|----|-----------------------------------------|--------|
| C-1 | `resolveWriteCompletion` | SF-1 choke shipped |
| C-2 | `WriteCompletionDisagreementError` | Fail-closed disagreement shipped |
| C-3 | `completion === 'submitted'` (or double-quote form) | Deploy/grant branch literal shipped |
| C-4 | `submit-only early return` | Deploy submit-only branch shipped |
| C-5 | (synthetic empty bundle) | Pack gate itself is NON-VACUOUS |

#### Helpers

```ts
function collectBundledJs(distDir: string): string
function markerPresent(bundle: string, pattern: string): boolean
function assertCompletionMarkersPresent(bundle: string, context: string): void
function assertDryRunDistInventory(pack: PackDryRunResult, context: string): void
function expectMarkersAbsentOnSyntheticEmpty(synthetic: string): void
```

**Pack target:** public `@openzeppelin/adapter-evm` only. Private
`adapter-evm-core` is not the SC-005 install path.

---

## Error surface (unchanged owners)

| Condition | Behavior | Owner |
|-----------|----------|-------|
| Dual-source disagreement | `WRITE_COMPLETION_DISAGREEMENT` THROW | SF-1 |
| Confirmed grant verify fail | `IdentityOperationFailed` | SF-3 |
| Confirmed deploy wait timeout | Existing INDETERMINATE messaging | Residual Risk — **OUT** of SF-4 |
| Trusted-issuer already trusted | noop sentinel id | Unchanged |

SF-4 adds **no** new error classes.
