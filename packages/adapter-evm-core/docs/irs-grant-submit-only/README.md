# IRS Grant Holder MANAGEMENT — Submit-Only

> On submit-only completion, `grantHolderManagementKey` returns `{ id }` as soon as
> submission is known and **skips** the post-submit `keyHasPurpose` assert. On
> confirmed (default), today's assert-after-submit + `IdentityOperationFailed`
> behavior remains.

This is **SF-3 (grant-holder-management-key-submit-only)** for the IRS submit-only
initiative. It is a method-local control-flow branch that **trusts** the SF-1
executor signal `WriteExecutionResult.completion` — it does not re-detect completion
inside the grant method.

## Overview

Relayer / saga strategies that resolve at submit time still used to hang (or
misreport) on grant: after `execute` returned, the adapter always RPC-asserted
holder MANAGEMENT via `keyHasPurpose`. Under submit-only that probe races chain
state that may not yet reflect the grant.

**Who this is for:** TypeScript integrators wiring IRS onboarding
(`deploy → grant → attachClaim → registerIdentity`) with a submit-early
`signAndBroadcast`.

**Single integration point:**

```ts
import { createIRS } from '@openzeppelin/adapter-evm-core';

const irs = createIRS(networkConfig, {
  signAndBroadcast,
  addresses,
  operatorManagementKey,
});

const { id } = await irs.grantHolderManagementKey(
  { onchainId, holder },
  executionConfig, // completion via SF-1 channels
);
```

**What SF-3 does not do:**

- Does **not** skip `execute` / `addKey` submission — only the post-submit assert.
- Does **not** invent MANAGEMENT presence or identity addresses.
- Does **not** change public grant signature (`Promise<OperationResult>` / `{ id }`
  both modes — no deploy-style overloads).
- Does **not** reorder or optionalize grant in the onboarding saga (**CONVENTION**).
- Does **not** re-fire `onSubmitted` (**CONVENTION**).
- Does **not** own deploy submit-only (SF-2) or the full write-matrix
  (**[SF-4](../irs-write-completion-matrix/)**).
- Does **not** publish adapters or ui-types as part of this docs stage.

## Quick Start

Requires SF-1 completion signal propagation (`WriteExecutionResult.completion`) and
`@openzeppelin/ui-types@3.5.0` vocabulary (linked until published).

```ts
import type {
  RelayerExecutionConfig,
  WriteCompletionOptions,
} from '@openzeppelin/ui-types';
import { createIRS } from '@openzeppelin/adapter-evm-core';

const transactionOptions: WriteCompletionOptions & Record<string, unknown> = {
  completion: 'submitted',
  // onSubmitted: owned by strategy — adapter will NOT call this again (CONVENTION)
};

const executionConfig: RelayerExecutionConfig = {
  method: 'relayer',
  serviceUrl: process.env.RELAYER_URL!,
  relayer: { /* RelayerDetails */ } as RelayerExecutionConfig['relayer'],
  transactionOptions,
};

const { id } = await irs.grantHolderManagementKey(
  { onchainId, holder },
  executionConfig,
);
// Resolves when submission is known. id prefers relayerTxId (SF-1).
// Does NOT mean holder MANAGEMENT is present — confirm yourself:
```

```ts
const probe = await irs.hasIdentityKeyPurpose({
  onchainId,
  address: holder,
  purpose: 1, // ERC-734 MANAGEMENT (module constant not on package root barrel)
});
// probe.status === 'has' | 'lacks' | 'read_failed'
```

Omit `completion` (or set `'confirmed'`) and the post-submit assert still runs —
same `IdentityOperationFailed` messages as before SF-3.

## Key Concepts

### MECHANISM vs CONVENTION (grant / SC-004)

| Item | Class | What enforces it |
|------|-------|------------------|
| Skip `assertIdentityKeyHasPurpose` when `completion === 'submitted'` | **MECHANISM** | Runtime branch after SF-1 `execute` |
| Confirmed / absent ⇒ assert + `IdentityOperationFailed` | **MECHANISM** | Runtime; US-2 / SC-002 |
| Trust SF-1 `WriteExecutionResult.completion` only (no local re-merge) | **MECHANISM** | Single predicate; disagreement already THROWn |
| Public return `{ id }` both modes; strip `completion` | **MECHANISM** | Explicit `{ id: result.id }` |
| Submit-only `{ id }` ≠ MANAGEMENT-present | **MECHANISM** | No status field on wire + docs obligation |
| Caller confirms via `hasIdentityKeyPurpose` / Relayer / WAL | **CONVENTION** | When to probe is consumer-owned; adapter does not auto-poll |
| Saga order deploy → grant → attachClaim → registerIdentity | **CONVENTION** | Documented / required on capability surface; call order is consumer-owned |
| Adapter does not re-fire `onSubmitted` | **CONVENTION** | Tested non-invocation; types do **not** prevent a second fire |

**Do not claim:** TypeScript types prove MANAGEMENT after a submit-only grant.
They only prove you received a submission id.

### Single predicate

```ts
const result = await this.execute(/* addKey */);
if (result.completion === 'submitted') {
  return { id: result.id }; // no keyHasPurpose
}
await this.assertIdentityKeyHasPurpose(/* holder MANAGEMENT */);
return { id: result.id };
```

Grant never re-reads `transactionOptions.completion` or strategy `result`.
SF-1 already merged dual sources and THREW on disagreement.

### Resume / confirmation after submit-only

Supported probe (unchanged public read; purpose `1` = ERC-734 MANAGEMENT):

```ts
irs.hasIdentityKeyPurpose({ onchainId, address: holder, purpose: 1 })
```

A second `grantHolderManagementKey` under submit-only may submit again —
SF-3 does not add adapter-side idempotency keys. Prefer the resume read (or
Relayer/WAL poll) before re-submitting.

## API Reference

See [api-reference.md](./api-reference.md).

## Integration Guide

See [integration-guide.md](./integration-guide.md) for end-to-end patterns.

## Safety

- **Submit-only success ≠ MANAGEMENT present** — later on-chain revert of `addKey`
  is not thrown by grant on this path. Confirm with `hasIdentityKeyPurpose`.
- **Confirmed path is money-adjacent** — omit completion and you still get one
  post-submit `keyHasPurpose` eth_call; `lacks` / RPC fail still throw
  `IdentityOperationFailed`.
- **Disagreement is a wiring bug** — catch `code === 'WRITE_COMPLETION_DISAGREEMENT'`;
  do not map it to identity-domain retries.
- **Do not wait on placeholder hashes** — under submit-only, `{ id }` is the
  relayer submission id when provided (SF-1).
- **`onSubmitted` is strategy-owned** — double-firing from the adapter would
  double-write WAL / saga side effects (**CONVENTION**).
- **Keep grant before attachClaim** — partial-failure rescue needs holder
  MANAGEMENT (**CONVENTION**, load-bearing).
- **No fabricated MANAGEMENT / addresses.**

## Related docs

- [Write Completion (SF-1)](../write-completion/README.md) — dual-source detection,
  disagreement THROW, `relayerTxId` preference.
- Deploy submit-only (SF-2) — documented separately when SF-2 Docs lands.
- [SF-4](../irs-write-completion-matrix/) — full IRS write-matrix + built-package proof.

## License

MIT (matches `@openzeppelin/adapter-evm-core`).
