# Deploy ONCHAINID — Submit-Only Completion

> Call `deployOnchainId` with submit-only completion and get `{ id, completion: 'submitted' }`
> as soon as submission is known — with **no** identity address, receipt wait, log parse, or
> operator MANAGEMENT assert. Confirmed (default) path stays byte-identical with required
> `onchainId`.

This is **SF-2 (deploy-onchainid-submit-only)** for the IRS submit-only initiative. It builds
on [SF-1 write completion](../write-completion/README.md): SF-1 resolves
`WriteExecutionResult.completion`; SF-2 branches `deployOnchainId` on that value.

## Overview

Relayer / saga consumers whose `signAndBroadcast` already returns on submit must not hang on
placeholder-hash receipt waits after deploy. SF-2 adds one early-return after `execute`:

| `result.completion` | Behavior | Return |
|---------------------|----------|--------|
| `'submitted'` | Skip wait → parse → operator MANAGEMENT assert | `{ id, completion: 'submitted' }` — **no** `onchainId` field |
| `'confirmed'` (default) | Today's wait → parse → assert | `{ id, onchainId, completion: 'confirmed' }` with **required** `onchainId` |

**Primary integration point:** `EvmIRSCapability.deployOnchainId` →
`Promise<DeployOnchainIdOutcome>` (completion-keyed discriminated union).

**What SF-2 does not do:**

- Does **not** fabricate `onchainId` / CREATE2 / factory probes before submit-only return.
- Does **not** re-merge dual completion sources (SF-1 choke point owns that).
- Does **not** re-fire `onSubmitted` (CONVENTION — strategy owns the hook).
- Does **not** change `grantHolderManagementKey` early-return — that is **SF-3**.
- Does **not** prove the full write matrix / `npm pack --dry-run` —
  **[SF-4](../irs-write-completion-matrix/)**.
- Does **not** publish adapters or ui-types.

## Quick Start

Requires SF-1 vocabulary (`@openzeppelin/ui-types@3.5.0`) and adapters that export
`DeployOnchainIdOutcome`.

```ts
import { createIRS } from '@openzeppelin/adapter-evm';
import type { DeployOnchainIdOutcome } from '@openzeppelin/adapter-evm-core';

const irs = createIRS(networkConfig, {
  signAndBroadcast,
  addresses,
  operatorManagementKey,
});

const outcome: DeployOnchainIdOutcome = await irs.deployOnchainId(
  { holder },
  {
    method: 'relayer',
    serviceUrl,
    relayer,
    transactionOptions: { completion: 'submitted' },
  },
);

if (outcome.completion === 'submitted') {
  // MECHANISM: outcome has no onchainId property on this arm
  const submissionId = outcome.id; // relayer id when SF-1 preferred it
  // Caller owns Relayer poll + irs.getFactoryIdentity(holder) after reconcile
} else {
  const { id, onchainId } = outcome; // onchainId: string (required)
}
```

## Key Concepts

### MECHANISM vs CONVENTION (deploy)

| Item | Class | What enforces it |
|------|-------|------------------|
| Submit-only arm has **no** `onchainId` (`DeployOnchainIdSubmittedResult`) | **MECHANISM** | TypeScript: `'onchainId' extends keyof …` is false |
| Confirmed arm `onchainId: string` required | **MECHANISM** | `DeployOnchainIdConfirmedResult` / ui-types base |
| Branch skips wait/parse/assert when `completion === 'submitted'` | **MECHANISM** | Runtime early return after SF-1 `execute` |
| Exact branch on SF-1 `result.completion` only (no options re-read) | **MECHANISM** | Single predicate in `deployOnchainId` |
| No CREATE2 / fabricated identity address | **MECHANISM** | No field + no probe path on submit-only |
| Disagreement THROW (both directions) | **MECHANISM** | **SF-1** — before deploy post-submit |
| Prefer `relayerTxId` for submit-only `{ id }` | **MECHANISM** | **SF-1** `preferSubmissionId` |
| Shared ui-types `IRSCapability.deployOnchainId` returns `DeployOnchainIdOutcome` | **MECHANISM** | ui-types >= 3.5.0 owns the union — consumers typed only as `IRSCapability` must narrow too |
| Caller owns Relayer poll + `getFactoryIdentity` after submit-only | **CONVENTION** | Resume ownership — not auto-called by deploy |
| Adapter does not re-fire `onSubmitted` | **CONVENTION** | Documented + tested; types do not prevent a second fire |

**Forbidden:** shipping `onchainId?:` on one shared return type (silently degrades every
confirmed-path caller).

### Shared-interface typing

The outcome union lives in `@openzeppelin/ui-types` (>= 3.5.0), where
`IRSCapability.deployOnchainId` already returns `Promise<DeployOnchainIdOutcome>`. So
`EvmIRSCapability` is a **plain extension** — `EvmIRSCapability extends IRSCapability` — adding
only the EVM-specific reads; it does not `Omit` or re-declare `deployOnchainId`.

Submit-only is therefore honestly typed for **every** consumer, whether they hold an
`EvmIRSCapability` or only the shared `IRSCapability`, and the two stay mutually assignable.
`DeployOnchainIdResult` is unchanged and still exported as the confirmed arm's base, with
`onchainId` **required** — the submit-only arm simply has no such property, so no `onchainId?:`
appears anywhere.

Earlier drafts widened the return type adapter-side via `Omit<IRSCapability, 'deployOnchainId'>`,
which left shared-interface consumers on a confirmed-only shape. That gap is closed: the widening
moved into ui-types, making this MECHANISM rather than a CONVENTION the adapter documents around.

### Resume after submit-only

Submit-only `{ id }` is **not** proof the identity landed. After Relayer reconciles:

```ts
const lookup = await irs.getFactoryIdentity(holder);
if (lookup.status === 'found') {
  // use lookup.onchainId — never predicted via CREATE2
}
```

## API Reference

See [api-reference.md](./api-reference.md).

## Integration Guide

See [integration-guide.md](./integration-guide.md).

## Safety

- **Never invent an identity address** on submit-only — orphan hazard if wrong.
- **Do not wait on placeholder hashes** under submit-only — that reopens the ~120s hang.
- **Confirmed path unchanged** — omit `completion` or pass `'confirmed'`; INDETERMINATE
  timeout messaging and do-not-retry-blind guidance stay as today.
- **Residual risk (named, OUT of SF-2):** confirmed-path verify timeout remains
  indistinguishable from never-landed at the typed-error boundary.
- **Catch disagreement by `code`** — `WRITE_COMPLETION_DISAGREEMENT` is a wiring bug
  (SF-1), not `IdentityOperationFailed`.
- **Type against `EvmIRSCapability` / `DeployOnchainIdOutcome`** for submit-only honesty;
  do not optionalize shared `DeployOnchainIdResult`.

## License

MIT (matches `@openzeppelin/adapter-evm-core`).
