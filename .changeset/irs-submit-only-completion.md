---
'@openzeppelin/adapter-evm-core': minor
'@openzeppelin/adapter-evm': minor
---

Add submit-only write completion for IRS / ONCHAINID writes, so a relayer-backed onboarding saga
can resolve at submission time and resume later instead of blocking on confirmation.

Requires `@openzeppelin/ui-types` >= 3.5.0 (the `WriteCompletion` vocabulary and the
`DeployOnchainIdOutcome` union are owned there); the peer range is bumped accordingly.

**Opting in.** Set `completion` on the relayer execution config — absent ≡ `'confirmed'`, so
existing callers are unaffected at runtime:

```ts
const outcome = await irs.deployOnchainId(
  { holder },
  {
    method: 'relayer',
    serviceUrl,
    relayer,
    transactionOptions: { completion: 'submitted' },
  }
);
```

On a submit-only write the resolved `id` prefers the relayer submission id (`relayerTxId`) over
the not-yet-meaningful tx hash; the confirmed path still resolves the mined tx hash.

**New exports** from `@openzeppelin/adapter-evm-core` (and its `capabilities` / `irs` sub-paths):
`DeployOnchainIdOutcome`, `DeployOnchainIdConfirmedResult` and `DeployOnchainIdSubmittedResult`,
re-exported from `@openzeppelin/ui-types`.

That is the whole of the added public surface. The completion machinery itself —
`resolveWriteCompletion`, `readOptionsCompletion`, `parseSignAndBroadcastResult`,
`preferSubmissionId`, `WriteCompletionDisagreementError`, `WriteExecutionResult`,
`SignAndBroadcastResultMeta` — stays **internal** and is deliberately not re-exported from the
package root or any sub-path. It is wired for you inside `createIRS` / `adaptSignAndBroadcast`,
so opting in needs only `transactionOptions.completion` and, for deploys, narrowing on the
returned discriminant. Consumers observe the disagreement failure through the thrown error's
`code === 'WRITE_COMPLETION_DISAGREEMENT'` rather than by importing the error class.

### Migration: `deployOnchainId` returns a union

`IRSCapability.deployOnchainId` / `EvmIRSCapability.deployOnchainId` now resolve to
`DeployOnchainIdOutcome`. The submit-only arm has **no `onchainId` property at all** — not an
optional one — because the address does not exist until the deployment is mined. Narrow on
`completion` before reading it:

```ts
const outcome = await irs.deployOnchainId({ holder }, executionConfig);
if (outcome.completion === 'confirmed') {
  use(outcome.onchainId);
} else {
  // persist outcome.id; resolve the address on resume via getFactoryIdentity / getOnchainId
}
```

Code that destructured `onchainId` directly keeps working at runtime on the confirmed path but
will not compile until the narrowing is added. That is deliberate: it is what stops a submit-only
deploy from silently yielding an undefined address.

### Migration: executor return-type widening

`EvmIRSExecutor` (exported) is now an alias of the shared `CapabilityExecutor` (also exported),
widening its resolved value from `{ id }` to `{ id, completion }`. The result interface itself is
internal and not importable, so declare the shape inline or rely on `EvmIRSExecutor` /
`CapabilityExecutor` to supply it. This only affects callers that **implement** an executor and
pass it to `createEvmIRSService` directly — the supported `createIRS({ signAndBroadcast })` entry
point is unchanged, and adapting `signAndBroadcast` is handled internally.

If you supply your own executor, add the discriminant:

```ts
// Before
const executor: EvmIRSExecutor = async (txData, config) => ({ id: await submit(txData, config) });

// After — 'confirmed' preserves the previous semantics
const executor: EvmIRSExecutor = async (txData, config) => ({
  id: await submit(txData, config),
  completion: 'confirmed',
});
```

Consumers only reading `.id` off a write result are unaffected: the widened result structurally
extends `OperationResult`, so `{ id }` access keeps compiling.

### Unchanged on purpose

ERC-3643 and ERC-4626 writes keep their existing result contracts (`{ id }` /
`VaultDepositResult` / `VaultWithdrawResult`). They share the executor, so they inherit the same
id-preference rule internally, but they deliberately do **not** re-export the `completion`
discriminant — submit-only resume semantics were specified for the IRS saga only, and widening
those results would add product surface no consumer requested.

When `transactionOptions.completion` and the strategy's `result.completion` disagree, the write
fails closed rather than guessing. It rejects with an error whose `code` is
`WRITE_COMPLETION_DISAGREEMENT` and whose `name` is `WriteCompletionDisagreementError`; match on
`code` rather than importing the class, which stays internal. The error carries `txHash` /
`relayerTxId` so the already-submitted transaction remains identifiable, and it is never wrapped
as an IRS-domain `IdentityOperationFailed`.
