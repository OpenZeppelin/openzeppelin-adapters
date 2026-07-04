# `@openzeppelin/adapter-runtime-utils/conformance`

> A parameterized, adapter-agnostic **conformance harness** for name-resolution adapters.
> Point it at your `NameResolutionCapability`, hand it a few input vectors, and it grades the
> adapter against the four UIKit contract families that only an adapter can satisfy — returning
> per-invariant verdicts as **data**, or projecting them straight onto vitest tests.

## Overview

If you build a name-resolution adapter (ENS on EVM today; SNS on Solana, Midnight, or any other
ecosystem later), the UIKit expects it to honor four contracts:

| UIKit invariant | What it means for your adapter |
|-----------------|--------------------------------|
| **INV-6** | Reverse resolution returns a **concrete boolean** `forwardVerified` — never missing, never `undefined`. |
| **INV-8** | An **expected failure never throws** — it returns `{ ok: false, error: { code } }` with a code from the closed 7-code union. |
| **INV-12** | Resolution is **deterministic** — two calls on the same pinned state return structurally-equal results (whether the adapter memoizes or re-queries). |
| **INV-16** | The `provenance.label` shown to a user is **user-safe** — no URLs, no raw hex, no injected control characters. |

These are exactly the properties a unit test of your own adapter tends to *not* catch, because
they're about the *shape and safety* of what you return across many cases, not any single happy
path. This harness is the shared gate that catches them. It is the TypeScript analog of the
[Reactive Streams TCK](https://github.com/reactive-streams/reactive-streams-jvm/tree/master/tck):
a technology-compatibility kit that any implementer runs against their own implementation.

**What it is:** a pure, runner-free function `checkConformance(config)` plus a thin vitest binding
`describeConformance(config)`. **What it is not:** a mock of your chain, a test of *correctness*
per-code (that's your own suite's job), or anything that touches a live network. You supply the
pinned/mocked substrate; the harness grades behavior over it.

The single integration point is the **`makeCapability()` factory** you pass in — everything the
harness varies per ecosystem enters through it.

## Quick Start

The harness ships inside `@openzeppelin/adapter-runtime-utils` under the `./conformance` subpath.
It's already a dependency of every adapter package, so there is nothing new to install — `vitest`
is an **optional peer** (you already have it as a test runner).

```ts
// adapter-evm-core/src/name-resolution/conformance.test.ts
import { describeConformance } from '@openzeppelin/adapter-runtime-utils/conformance';
import { createNameResolution } from '../create-name-resolution';
import { mockEnsClient } from './__fixtures__/mock-ens-client'; // YOUR pinned substrate

// Top-level await — the capability calls run at collection time over the pinned substrate.
await describeConformance({
  suiteName: 'adapter-evm-core NameResolutionCapability',
  makeCapability: () => createNameResolution(evmConfig, { publicClient: mockEnsClient() }),
  forwardVectors: [
    { input: 'vitalik.eth', expect: { ok: true } },
    { input: 'nope.eth',    expect: { ok: false, code: 'NAME_NOT_FOUND' } },
  ],
  reverseVectors: [
    { input: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', expect: { ok: true } },
    { input: '0x0000000000000000000000000000000000000000', expect: { ok: false, code: 'ADDRESS_NOT_FOUND' } },
  ],
});
```

Run it: `vitest run`. Each invariant × case becomes one test named for the invariant it checks
(`inv6_…`, `inv8_…`, `inv12_…`, `inv16_…`), so a red test in CI points straight at the violated
contract and the exact case.

Prefer a plain CI gate over a test runner? Use the pure core:

```ts
import { checkConformance } from '@openzeppelin/adapter-runtime-utils/conformance';

const report = await checkConformance(config);
if (!report.passed) {
  const failures = report.results.filter((r) => r.status === 'FAIL');
  throw new Error(`Adapter is non-conformant:\n${failures.map((f) => `${f.key}: ${f.message}`).join('\n')}`);
}
```

## Key Concepts

- **Capability factory (`makeCapability`).** The harness builds a **fresh** capability instance per
  case by calling `config.makeCapability()`, so no state leaks between cases. Wrap a *pinned* (mocked)
  backend — the harness never talks to a real network, and the substrate's stability is your fixture's
  responsibility.
- **Vectors are declarative expectations.** A `ForwardVector`/`ReverseVector` is `{ input, expect }`.
  `expect: { ok: true }` is a success case (drives INV-6/12/16); `expect: { ok: false, code }` is an
  expected-failure case (drives the INV-8 never-throw taxonomy). One taxonomy, no separate arrays.
- **Report as data.** `checkConformance` returns a `ConformanceReport = { results, passed }`. Each
  `InvariantResult` has an `invariant`, a stable `key`, a `status` (`PASS`/`FAIL`/`SKIPPED`), and a
  human-readable `message`. `passed` is `true` iff no result is `FAIL`.
- **Feature-detection & SKIP.** If your capability lacks `resolveName`, the forward family is
  `SKIPPED`; lacking `resolveAddress` skips the reverse family **and** INV-6. Skips are *reported*,
  never dropped — a forward-only adapter passes with the reverse family visibly skipped (never
  silently "certified").
- **Deep-equal under cache-TTL.** INV-12 compares by *structure*, not identity, after a normalize
  pre-pass: `avatarUrl` is excluded by default (it may flap), `error.cause` is never inspected, and
  `{ x: undefined }` ≡ `{}`. A memoizer and a re-querier both pass.
- **Label policy.** INV-16 uses a defense-in-depth `DEFAULT_LABEL_POLICY` (anchored allowlist +
  length cap + denylist). Fully overridable per-run via `config.labelPolicy`.

## API Reference

See [api-reference.md](./api-reference.md) — every export with its full TypeScript signature.

## Integration Guide

See [integration-guide.md](./integration-guide.md) — the copy-paste `makeCapability()` wiring for a
concrete adapter, the runner-agnostic CI gate, custom label policies, the optional lifecycle probe,
and common mistakes. Runnable snippets live in [examples/](./examples/).

## Safety

This is **test infrastructure**, not a runtime service — it holds no secrets, opens no network, and
persists/logs nothing. Still, a few contract points matter for using it *correctly*:

- **`describeConformance` must be `await`ed at the top level** of the test file. The capability calls
  run at collection time; the results are captured before the `it()`s are emitted. Not awaiting it
  emits zero tests.
- **The pinned substrate is yours to own.** The harness demands a `makeCapability` factory but never
  constructs or owns the backend it wraps. A flaky/live backend makes INV-12 flake — pin it.
- **Adapter misbehavior is data, never a throw.** An adapter that throws on an expected-failure
  vector is recorded as an INV-8 `FAIL`, not propagated. The **only** exception `checkConformance`
  throws is `ConformanceConfigError` — reserved for a malformed `config` (a bug in how you *invoked*
  the harness, surfaced loudly rather than as a misleading adapter FAIL).
- **`SKIPPED` is not `PASS`.** A skipped family means "this adapter doesn't implement that method",
  not "this adapter is certified for it". Read the report accordingly.
- **The compliant-run lives in your adapter's own test suite** — not in `adapter-runtime-utils`. This
  is deliberate (dependency-cycle avoidance): the harness carries **zero** concrete-adapter
  dependencies. See the integration guide.

## License

Inherits the `@openzeppelin/adapter-runtime-utils` package license (MIT).
