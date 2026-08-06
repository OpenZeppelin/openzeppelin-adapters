# Write Completion — Signal Propagation

> Request submit-only or confirmed completion on Relayer writes, and get a resolved
> `completion` plus a usable submission id through the adapter executor — without the
> strategy’s `result` being stripped at the boundary.

This is **SF-1 (completion-signal-propagation)** for the IRS submit-only initiative.
It ships two ordered layers:

1. **Vocabulary** in `@openzeppelin/ui-types@3.5.0` — shared `WriteCompletion` /
   `WriteCompletionOptions` on `RelayerExecutionConfig.transactionOptions`
   (known-keys-plus-passthrough).
2. **Mechanics** in `@openzeppelin/adapter-evm-core` — dual-source detection
   (top-level options ∪ strategy `result`), fail-closed disagreement, and
   `relayerTxId` preference for submit-only `{ id }`.

## Overview

Integrators who inject a submit-early `signAndBroadcast` (Relayer / saga) need the
adapter to **see** completion intent. Before SF-1, `adaptSignAndBroadcast` returned
only `{ id: txHash }` and dropped `result` — so IRS (and ERC-3643 / ERC-4626) could
not branch, and an untyped `transactionOptions` bag let consumer and adapter disagree
with zero compile signal.

The single choke point is:

```ts
import { createIRS } from '@openzeppelin/adapter-evm-core';
// createIRS still wires adaptSignAndBroadcast internally
```

Every write capability that uses `adaptSignAndBroadcast` now returns
`WriteExecutionResult`: `{ id: string; completion: 'submitted' | 'confirmed' }`.

**What SF-1 does not do:**

- Does **not** itself skip IRS post-submit receipt waits or key-purpose asserts —
  those branches live in **[SF-2 deploy](../deploy-onchainid-submit-only/README.md)** and
  **[SF-3 grant](../irs-grant-submit-only/README.md)** reading `result.completion`.
- Does **not** invent `onchainId` / CREATE2 addresses.
- Does **not** re-fire `onSubmitted` (strategy owns that hook — CONVENTION).
- Does **not** read nested consumer plugin keys (e.g. `tokenizedDeposit`) — CONVENTION.
- Does **not** publish `@openzeppelin/ui-types@3.5.0` or adapters MINOR as part of
  this docs stage.

## Quick Start

Requires `@openzeppelin/ui-types@3.5.0` (local / linked until published) and an
adapters workspace that consumes it.

```ts
import type {
  RelayerExecutionConfig,
  WriteCompletionOptions,
} from '@openzeppelin/ui-types';

const transactionOptions: WriteCompletionOptions & Record<string, unknown> = {
  completion: 'submitted',
  onSubmitted: async (relayerTxId) => {
    // Strategy / WAL hook — the adapter will NOT call this again
  },
};

const executionConfig: RelayerExecutionConfig = {
  method: 'relayer',
  serviceUrl: process.env.RELAYER_URL!,
  relayer: { /* RelayerDetails */ } as RelayerExecutionConfig['relayer'],
  transactionOptions,
};
```

Strategy early-return (adapter contract via `result`):

```ts
return {
  txHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
  result: { completion: 'submitted' as const, relayerTxId },
};
```

With exactly one valid signal (`result.completion` alone is enough), the adapted
executor returns `{ id: relayerTxId, completion: 'submitted' }` instead of the
placeholder hash.

## Key Concepts

### MECHANISM vs CONVENTION

| Item | Class | What enforces it |
|------|-------|------------------|
| Shared `WriteCompletion` keys on `transactionOptions` | **MECHANISM** | TypeScript compile error on mismatch (`completion: 'async'` fails) |
| Dual-source resolve + disagreement THROW (both directions) | **MECHANISM** | Runtime `WriteCompletionDisagreementError` |
| Prefer non-empty `relayerTxId` on submit-only | **MECHANISM** | `preferSubmissionId` |
| Default / absent ≡ `'confirmed'` | **MECHANISM** | `resolveWriteCompletion` truth table |
| Invalid / non-enum completion → absent | **MECHANISM** | Parse treats garbage as undefined |
| Adapter does not re-fire `onSubmitted` | **CONVENTION** | Documented + tested; types do **not** prevent a second fire if someone adds a call site |
| Nested plugin keys (`tokenizedDeposit`, …) ignored | **CONVENTION** | Adapter never deep-walks; not a compile-time ban on nesting |

**Before the ui-types hoist:** `{ completion, onSubmitted }` in an untyped
`Record<string, unknown>` bag was pure CONVENTION — silent ignore if the adapter
never read the keys. **After:** known keys are MECHANISM at the type boundary.

### Dual-source detection

| `transactionOptions.completion` | `result.completion` | Outcome |
|---------------------------------|---------------------|---------|
| absent | absent | `'confirmed'` |
| `'confirmed'` | `'confirmed'` | `'confirmed'` |
| `'submitted'` | `'submitted'` | `'submitted'` |
| exactly one present | — | honor that signal |
| disagree (either direction) | — | **THROW** `WriteCompletionDisagreementError` |

### Top-level options vs nested plugin keys

- **Public forward contract:** `executionConfig.transactionOptions.completion`
  (relayer only).
- **Today’s nested consumer bags** (e.g. `tokenizedDeposit.completion`) are
  **consumer-owned**. The adapter does not read them. Live dual-detection for those
  strategies relies on `result.completion` from the strategy early-return.
- Align strategy + top-level options when you adopt the typed public contract —
  disagreement THROWs.

## API Reference

See [api-reference.md](./api-reference.md).

## Integration Guide

See [integration-guide.md](./integration-guide.md) for end-to-end patterns.

## Safety

- **Fail closed on disagreement** — never silently prefer submit-only when options
  say confirmed (or the reverse). Catch `code === 'WRITE_COMPLETION_DISAGREEMENT'`
  as a wiring bug, not an identity-domain failure.
- **Default is confirmed** — omit `completion` and you get today’s
  submit → confirm → verify path once SF-2/SF-3 branch; SF-1 alone surfaces
  `completion: 'confirmed'` with `id === txHash`.
- **Do not wait on placeholder hashes** — under submit-only, `{ id }` is the
  relayer submission id when provided. Waiting on the zero placeholder reopens the
  hang class.
- **`onSubmitted` is strategy-owned** — double-firing from the adapter would
  double-write WAL / saga side effects.
- **No fabricated identity addresses** in SF-1 (or later) on submit-only.
- **ui-types remains vocabulary-only** — receipt waits, IRS/ERC-3643 behaviour, and
  return-type overloads stay in adapters.

## Type gate for tests

The package `tsconfig.json` excludes `src/**/*.test.ts` so the build never emits test types.
That exclusion also meant `tsc` never evaluated the `expectTypeOf` / `satisfies` guards in the
test suites — a type-level assertion could be wrong, or a discriminated union could be read
without narrowing, and CI still went green.

`tsconfig.tests.json` closes that gap and runs as part of `pnpm typecheck`:

```bash
pnpm --filter @openzeppelin/adapter-evm-core typecheck        # src + tests
pnpm --filter @openzeppelin/adapter-evm-core typecheck:tests  # tests only
```

Its `exclude` list holds pre-existing suites that do not yet typecheck (loosely typed `vi.fn()`
mocks predating the gate: `abi/etherscan-v2`, `capabilities/factories`, `configuration/rpc`,
`name-resolution/service.ens-v2`, `name-resolution/service.forward-l1`, `profiles/runtime`).
That list is **debt meant to shrink to empty**, not policy — anything not listed is gated, so
every new or touched test file is checked by default. Clearing those six entries means typing
their mocks, and is deliberately out of scope for this initiative.

> Note: `tsconfig.tests.json` sets `composite: false`. The composite/incremental `tsconfig.json`
> can report a stale success from `tsconfig.tsbuildinfo` after `node_modules` changes underneath
> it; run `rm -f tsconfig.tsbuildinfo` before trusting a green `tsc --noEmit` when dependency
> versions have just moved.

## License

MIT (matches `@openzeppelin/adapter-evm-core`).
