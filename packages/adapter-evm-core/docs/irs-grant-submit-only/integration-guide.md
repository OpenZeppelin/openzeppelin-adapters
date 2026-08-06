# IRS Grant Holder MANAGEMENT — Integration Guide

How to use submit-only completion with `grantHolderManagementKey` so the call
resolves at submission time without a post-submit `keyHasPurpose` hang, while
keeping confirmed-path verification byte-identical.

Prerequisite: [Write Completion (SF-1)](../write-completion/integration-guide.md)
so the executor surfaces `WriteExecutionResult.completion`.

## Pattern 1: Submit-only grant + caller-owned confirmation

Wire top-level typed options (or strategy `result.completion` — see SF-1 Pattern 2).
Grant reads only the SF-1 executor signal.

```ts
import type {
  RelayerExecutionConfig,
  WriteCompletionOptions,
} from '@openzeppelin/ui-types';
import { createIRS } from '@openzeppelin/adapter-evm-core';

const MANAGEMENT = 1; // ERC-734 MANAGEMENT

const transactionOptions: WriteCompletionOptions & Record<string, unknown> = {
  completion: 'submitted',
  onSubmitted: async (relayerTxId) => {
    // Strategy / WAL — adapter will NOT call this again (CONVENTION)
    await wal.markSubmitted('grant', relayerTxId);
  },
};

const executionConfig: RelayerExecutionConfig = {
  method: 'relayer',
  serviceUrl,
  relayer,
  transactionOptions,
};

const irs = createIRS(networkConfig, {
  signAndBroadcast: myStrategy.signAndBroadcast,
  addresses,
  operatorManagementKey,
});

// Saga order (CONVENTION): deploy → grant → attachClaim → registerIdentity
const { id } = await irs.grantHolderManagementKey(
  { onchainId, holder },
  executionConfig,
);
// id prefers relayerTxId. No keyHasPurpose eth_call ran (MECHANISM).

// Caller-owned confirmation (CONVENTION for when; public read is MECHANISM surface):
let probe = await irs.hasIdentityKeyPurpose({
  onchainId,
  address: holder,
  purpose: MANAGEMENT,
});
while (probe.status === 'lacks') {
  await sleep(pollMs);
  probe = await irs.hasIdentityKeyPurpose({
    onchainId,
    address: holder,
    purpose: MANAGEMENT,
  });
}
if (probe.status === 'read_failed') {
  throw probe.cause; // do not treat as lacks
}
// probe.status === 'has' → safe to attachClaim
```

## Pattern 2: Confirmed / default path (non-regression)

Omit `completion`, or set `'confirmed'`. Post-submit assert still runs.

```ts
import { IdentityOperationFailed } from '@openzeppelin/ui-types';

const executionConfig: RelayerExecutionConfig = {
  method: 'relayer',
  serviceUrl,
  relayer,
  // transactionOptions omitted → SF-1 defaults completion to 'confirmed'
};

try {
  const { id } = await irs.grantHolderManagementKey(
    { onchainId, holder },
    executionConfig,
  );
  // keyHasPurpose was called; holder MANAGEMENT verified
  console.log('grant confirmed', id);
} catch (error) {
  if (error instanceof IdentityOperationFailed) {
    // lacks or RPC fail — same messages as pre-SF-3; resume via onchainId in message
    throw error;
  }
  throw error;
}
```

## Pattern 3: Disagreement through grant (wiring bug)

When options and strategy `result` disagree, SF-1 THROWs **before** grant body.
Do not retry as an identity failure.

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
  await irs.grantHolderManagementKey(
    { onchainId, holder },
    executionConfig,
  );
} catch (error) {
  if (isWriteCompletionDisagreement(error)) {
    // Align transactionOptions.completion with strategy result.completion
    throw error;
  }
  throw error;
}
```

Prefer the stable `code` string — `WriteCompletionDisagreementError` is
core-internal (not on the public barrel in SF-1).

## Common Mistakes

| Mistake | What happens | Fix |
|---------|--------------|-----|
| Treat submit-only `{ id }` as MANAGEMENT-present | Proceed to attachClaim while `addKey` may still revert / be pending | Poll `hasIdentityKeyPurpose` (or Relayer) until `has` |
| Expect grant to auto-poll `keyHasPurpose` under submit-only | That would reintroduce the hang class | Caller-owned confirmation (**CONVENTION**) |
| Re-detect completion inside a wrapper by soft-merging options/result | Can diverge from SF-1 choke point / skip verify unsafely | Trust executor; let disagreement THROW |
| Map disagreement to `IdentityOperationFailed` | Wrong operator playbook | Switch on `WRITE_COMPLETION_DISAGREEMENT` |
| Skip grant in the saga under submit-only | Partial failure leaves identity unrestorable | Keep deploy → **grant** → attach → register (**CONVENTION**) |
| Expect adapter to call `onSubmitted` | Hook never fires from adapter | Fire from strategy on submit |
| Wait on zero placeholder `txHash` | Hang / misreport | Use grant `{ id }` (relayer id when provided) |
| Assume public return includes `completion` | Field is stripped | Read only `{ id }`; use SF-1 paths if you need the signal |

## MECHANISM vs CONVENTION (quick recall)

| MECHANISM (enforced) | CONVENTION (documented / tested) |
|----------------------|----------------------------------|
| Skip assert iff `completion === 'submitted'` | When caller probes with `hasIdentityKeyPurpose` |
| Confirmed assert + `IdentityOperationFailed` | Saga call order |
| Trust SF-1 signal only; strip `{ id }` | No adapter `onSubmitted` re-fire |
| Submit-only ≠ MANAGEMENT-present | Nested plugin option keys ignored (SF-1) |

## Version / workspace notes

| Package | Target | Notes |
|---------|--------|-------|
| `@openzeppelin/ui-types` | **3.5.0** | Vocabulary; **not published** in this docs stage |
| `@openzeppelin/adapter-evm-core` | branch `004-irs-submit-only-completion` | Grant branch landed; MINOR ship is a later chore |
| Consumer pin / `reference-implementations` | **out of scope** | Do not edit here |

## What comes next (not SF-3)

- **SF-2 Docs** — `deployOnchainId` submit-only / return-type union (code may already be on branch).
- **[SF-4](../irs-write-completion-matrix/)** — full IRS write-matrix NON-VACUITY + `npm pack --dry-run` built-output proof.
