# Deploy ONCHAINID Submit-Only — Integration Guide

How to request submit-only completion on `deployOnchainId`, narrow the outcome union,
and resume identity address lookup without fabricating addresses. Completion **wiring**
(options + strategy `result`) is covered in
[write-completion/integration-guide.md](../write-completion/integration-guide.md).

## Pattern 1: Submit-only Relayer deploy (adapter-typed)

Type against `DeployOnchainIdOutcome` / `EvmIRSCapability` so the submit-only arm has
**no** `onchainId` (**MECHANISM**).

```ts
import { createIRS } from '@openzeppelin/adapter-evm';
import type { DeployOnchainIdOutcome } from '@openzeppelin/adapter-evm-core';
import type { RelayerExecutionConfig } from '@openzeppelin/ui-types';

const irs = createIRS(networkConfig, {
  signAndBroadcast,
  addresses,
  operatorManagementKey,
});

const executionConfig: RelayerExecutionConfig = {
  method: 'relayer',
  serviceUrl,
  relayer,
  transactionOptions: { completion: 'submitted' },
};

const outcome: DeployOnchainIdOutcome = await irs.deployOnchainId(
  { holder },
  executionConfig,
);

if (outcome.completion === 'submitted') {
  // MECHANISM: TypeScript rejects outcome.onchainId on this arm
  await wal.markDeploySubmitted(outcome.id);
  // Do NOT call waitForTransactionReceipt on a placeholder hash
} else {
  // Confirmed arm — onchainId required
  await wal.markDeployConfirmed(outcome.id, outcome.onchainId);
}
```

**Compile check (MECHANISM):**

```ts
function assertNoFabricatedAddress(
  outcome: Extract<DeployOnchainIdOutcome, { completion: 'submitted' }>,
): void {
  // @ts-expect-error — submit-only arm has no onchainId
  const _forbidden = outcome.onchainId;
  void _forbidden;
}
```

## Pattern 2: Confirmed / default path (unchanged call shape)

Omit `completion` or pass `'confirmed'`. Behavior matches today's submit → confirm →
verify path, including INDETERMINATE timeout messaging.

```ts
const confirmed = await irs.deployOnchainId({ holder }, executionConfig);

if (confirmed.completion === 'confirmed') {
  // confirmed.onchainId: string (required)
  const { id, onchainId } = confirmed;
  void id;
  void onchainId;
}
```

Callers that only destructure `{ id, onchainId }` remain valid after narrowing (or when
they ignore the additive `completion` field).

## Pattern 3: Resume after submit-only (caller-owned)

Submit-only `{ id }` is **not** proof the identity deployed. After Relayer / WAL
reconciles the submission:

```ts
const lookup = await irs.getFactoryIdentity(holder);

switch (lookup.status) {
  case 'found':
    // proceed with lookup.onchainId — never CREATE2-predicted
    break;
  case 'not_found':
    // still pending or failed — keep polling Relayer / factory; do not invent address
    break;
  case 'read_failed':
    // RPC broke — opposite safety from not_found; do not treat as "safe to redeploy"
    throw lookup.cause;
}
```

**CONVENTION:** deploy does not auto-call `getFactoryIdentity` on the submit-only path.
Resume ownership stays with the caller.

## Pattern 4: Shared `IRSCapability` only (CONVENTION gap)

```ts
import type { IRSCapability } from '@openzeppelin/ui-types';

async function deployViaShared(irs: IRSCapability, holder: string, cfg: ExecutionConfig) {
  // Typed as Promise<DeployOnchainIdResult> — confirmed-only at the type boundary.
  // Runtime may still return the submit-only shape if completion === 'submitted'.
  // Prefer EvmIRSCapability for honest narrowing.
  return irs.deployOnchainId({ holder }, cfg);
}
```

Do **not** “fix” this by shipping `onchainId?:` on ui-types `DeployOnchainIdResult`.

## Common Mistakes

- **Expecting `onchainId` on submit-only** — the arm has no such field; resume via
  Relayer + `getFactoryIdentity`. Fabricating CREATE2 would orphan holders on mismatch.
- **Waiting on the zero placeholder hash** after submit-early strategy return — reopens
  the hang / misreport class SF-2 removes.
- **Treating submit-only `{ id }` as finality** — it is submission acknowledgement only.
- **Typing only as `IRSCapability` then reading `completion`** — shared interface stays
  confirmed-only (**CONVENTION** gap); use `DeployOnchainIdOutcome`.
- **Optionalizing `onchainId` on a shared type** — forbidden; silently degrades confirmed
  callers (SC-006).
- **Catching disagreement as `IdentityOperationFailed`** — use
  `error.code === 'WRITE_COMPLETION_DISAGREEMENT'` (SF-1).
- **Assuming the adapter re-fires `onSubmitted`** — it does not (**CONVENTION**); strategy
  already fires once.
- **Blind retry after confirmed-path INDETERMINATE timeout** — identity may already
  exist; probe the factory first (unchanged semantics).

## Version / workspace notes

- Adapters target **MINOR 2.6.0-class** (unpublished in this docs stage).
- ui-types WriteCompletion vocabulary: **3.5.0-class** (`feat/write-completion-vocabulary`);
  SF-2 did **not** widen `IRSCapability` / `DeployOnchainIdResult`.
- Hard exclusion: `reference-implementations`. No npm publish from Docs.
- SF-3 documents grant submit-only; [SF-4](../irs-write-completion-matrix/) owns matrix + `npm pack --dry-run`.
