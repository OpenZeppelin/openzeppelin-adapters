# Write Completion — Integration Guide

How to wire submit-only completion intent so the adapter preserves it through
`adaptSignAndBroadcast`. SF-1 surfaces `{ id, completion }`; IRS early-return
branching is **[SF-2 deploy](../deploy-onchainid-submit-only/integration-guide.md)**
and **[SF-3 grant](../irs-grant-submit-only/integration-guide.md)**.

## Pattern 1: Top-level typed options (forward public contract)

Use shared vocabulary from `@openzeppelin/ui-types@3.5.0` so a bad `completion`
literal fails at compile time (**MECHANISM**).

```ts
import type {
  RelayerExecutionConfig,
  WriteCompletionOptions,
} from '@openzeppelin/ui-types';
import { createIRS } from '@openzeppelin/adapter-evm-core';

const transactionOptions: WriteCompletionOptions & Record<string, unknown> = {
  completion: 'submitted',
  onSubmitted: async (relayerTxId) => {
    // Persist WAL / saga resume key — strategy should fire this once on submit.
    // The adapter will not call onSubmitted again (CONVENTION).
    await wal.markSubmitted(relayerTxId);
  },
  // residual passthrough still allowed:
  // gasLimit: '…',
};

const executionConfig: RelayerExecutionConfig = {
  method: 'relayer',
  serviceUrl,
  relayer,
  transactionOptions,
};

const irs = createIRS({ signAndBroadcast: myStrategy.signAndBroadcast });

// SF-1: executor path sees optionsCompletion === 'submitted'.
// SF-2/SF-3: IRS methods branch on WriteExecutionResult.completion.
await irs.deployOnchainId(/* … */, executionConfig);
```

**Compile check (MECHANISM):**

```ts
// @ts-expect-error — not a WriteCompletion
transactionOptions.completion = 'async';
```

## Pattern 2: Strategy `result` signal (exactly-one path)

If your strategy today only reads a nested plugin bag, keep emitting
`result.completion` + `relayerTxId` on early return. The adapter honors that
single signal (INV-13) and prefers the relayer id (**MECHANISM**).

```ts
const ASYNC_SUBMIT_PLACEHOLDER_TX_HASH =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

async function signAndBroadcast(/* … */) {
  const relayerTxId = await relayer.sendTransaction(/* … */);

  // Strategy fires onSubmitted once (if configured) — adapter must not re-fire.
  await options?.onSubmitted?.(relayerTxId);

  return {
    txHash: ASYNC_SUBMIT_PLACEHOLDER_TX_HASH,
    result: {
      completion: 'submitted' as const,
      relayerTxId,
    },
  };
}
```

Adapted executor outcome:

```ts
// { id: relayerTxId, completion: 'submitted' }
```

Do **not** special-case nested keys like `tokenizedDeposit` inside the adapter —
those remain consumer-owned (**CONVENTION**). Migrate callers toward top-level
`transactionOptions.completion` when ready, and keep strategy `result` aligned
to avoid disagreement THROW.

## Pattern 3: Handle disagreement as a wiring bug

When options say `'confirmed'` and result says `'submitted'` (or the reverse),
the adapter **THROWs** — it does not silently skip verification.

```ts
function isWriteCompletionDisagreement(
  error: unknown,
): error is Error & { code: 'WRITE_COMPLETION_DISAGREEMENT' } {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as { code: unknown }).code === 'WRITE_COMPLETION_DISAGREEMENT'
  );
}

try {
  await irs.grantHolderManagementKey(/* … */, executionConfig);
} catch (error) {
  if (isWriteCompletionDisagreement(error)) {
    // Fix the strategy / options mismatch — do not retry as IdentityOperationFailed
    throw error;
  }
  throw error;
}
```

`WriteCompletionDisagreementError` is **core-internal** in SF-1 (not on the
`@openzeppelin/adapter-evm-core` public barrel — Design OQ-2). Prefer the stable
`code` string for consumer catches. Workspace / tests may import the class from
`capabilities/helpers` or `shared/completion`.

`runCapabilityWrite` rethrows disagreement **before** IRS `mapError`, so you will
not see `IdentityOperationFailed` for this class of bug.

## Pattern 4: Confirmed / default path (non-regression)

Omit `completion`, or set `'confirmed'`, and omit submit-only meta on `result`:

```ts
const executionConfig: RelayerExecutionConfig = {
  method: 'relayer',
  serviceUrl,
  relayer,
  // transactionOptions omitted → optionsCompletion absent
};

// Executor: { id: txHash, completion: 'confirmed' }
// id matches pre-SF-1 { id: txHash } when no submit-only signal.
```

## Common Mistakes

| Mistake | What happens | Fix |
|---------|--------------|-----|
| Leave `completion` only under a nested plugin key and omit `result.completion` | Adapter treats options as absent → `'confirmed'` → hang if strategy already returned early | Emit `result.completion: 'submitted'` and/or set top-level `transactionOptions.completion` |
| Top-level `'submitted'` while strategy still polls and returns `'confirmed'` | **THROW** disagreement | Align strategy early-return with options |
| Expect adapter to call `onSubmitted` | Hook never fires from adapter | Fire from strategy on submit (CONVENTION) |
| Wait for receipts on the zero placeholder `txHash` under submit-only | Hang / misreport | Use executor `{ id }` (relayer id) and poll Relayer / WAL |
| Treat disagreement as `IdentityOperationFailed` | Wrong operator playbook | Switch on `WRITE_COMPLETION_DISAGREEMENT` |
| Optionalize `DeployOnchainIdResult.onchainId` in consumer types | Silent degradation of confirmed callers | SF-2 owns overload/union; SF-1 did not change that type |
| Duplicate `WriteCompletion` inside the adapter package | Two sources of truth | Import from `@openzeppelin/ui-types` only |

## Version / workspace notes

| Package | Target | Notes |
|---------|--------|-------|
| `@openzeppelin/ui-types` | **3.5.0** (`feat/write-completion-vocabulary`) | Vocabulary landed; **not published** in this initiative unless explicitly instructed |
| `@openzeppelin/adapter-evm-core` | branch `004-irs-submit-only-completion` | Mechanics landed; MINOR ship is a later chore |
| Adapters peer caret | `^3.3.0` | Picks up 3.5.0-class once published without manifest bump |
| Consumer exact pin | **dev-owned** | Out of this initiative; do not edit `reference-implementations` here |

During local development, link ui-types via the workspace `dev:local` / packed-local
path used in Code Draft. Docs do not require a published npm version to be accurate.

## What comes next (not SF-1)

- **SF-2 Docs** — `deployOnchainId` early-return / return-type union on submit-only
  (code may already be on branch; Docs stage separate).
- **SF-3** — documented at [irs-grant-submit-only](../irs-grant-submit-only/README.md)
  (`grantHolderManagementKey` skips post-submit key assert on submit-only).
- **[SF-4](../irs-write-completion-matrix/)** — full IRS write-matrix NON-VACUITY + built-package (`npm pack`) proof.
