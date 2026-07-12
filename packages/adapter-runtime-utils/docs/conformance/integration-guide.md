# Integration Guide — Adapter Conformance Harness

This guide is for **adapter authors**. If you're building a name-resolution adapter — ENS on EVM
today, SNS on Solana or a Midnight resolver tomorrow — this is how you wire it through the shared
conformance gate so the UIKit can trust it across the display and input paths.

The whole integration is: **write a `makeCapability()` factory over a pinned substrate, list a few
vectors, call `describeConformance` at the top level of a test file.** Everything else is defaults.

---

## Pattern 1 — Wire a concrete adapter through the harness (the headline pattern)

**The compliant conformance run lives in *your adapter's own* test suite, not in
`adapter-runtime-utils`.** This is deliberate: the harness carries **zero** concrete-adapter
dependencies (no `viem`, no `adapter-evm-core`), which keeps it reusable across every ecosystem and
avoids a dependency cycle (`adapter-runtime-utils` → `adapter-evm-core` → `adapter-runtime-utils`).
The harness defines the gate; your package supplies the adapter and the pinned substrate.

Here is the full wiring for `adapter-evm-core`. Once its Tests/Code slice runs, this is a
copy-paste:

```ts
// packages/adapter-evm-core/src/name-resolution/conformance.test.ts
import { describeConformance } from '@openzeppelin/adapter-runtime-utils/conformance/vitest';
import { createNameResolution } from '../capabilities/name-resolution';
import { mockEnsClient } from './__fixtures__/mock-ens-client';

// The factory is the single DI seam. It returns a FRESH capability per call, wrapping a
// pinned/mocked viem client — the caller-owned substrate. The harness constructs one instance
// per case and never disposes the instances used by the four required families.
const makeCapability = () =>
  createNameResolution(
    { chainId: 1 /* your per-deployment adapter config */ },
    { publicClient: mockEnsClient() }, // pinned: deterministic, no live network
  );

await describeConformance({
  suiteName: 'adapter-evm-core NameResolutionCapability',
  makeCapability,
  forwardVectors: [
    { input: 'vitalik.eth', expect: { ok: true } },
    { input: 'nope.eth',    expect: { ok: false, code: 'NAME_NOT_FOUND' } },
  ],
  reverseVectors: [
    { input: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', expect: { ok: true } },
    { input: '0x0000000000000000000000000000000000000000', expect: { ok: false, code: 'ADDRESS_NOT_FOUND' } },
  ],
  stableAvatarSurface: false, // avatar is excluded from the determinism compare (the default)
});
```

**The mocked client is yours to build and pin.** The harness never constructs it. Make it
deterministic — hard-code the resolver responses your vectors expect — so INV-12 (determinism) grades
the adapter, not the network. `mockEnsClient()` returns a fresh mock per call so each case is isolated.

**What runs.** For the config above (2 forward + 2 reverse vectors), a compliant adapter yields these
tests, all green:

```
inv8_forward_NAME_NOT_FOUND_neverThrows            ✓
inv12_forward_vitalik_eth_deterministic            ✓
inv16_forward_vitalik_eth_labelUserSafe            ✓
inv6_0xd8dA…_forwardVerifiedConcreteBoolean        ✓
inv8_reverse_ADDRESS_NOT_FOUND_neverThrows         ✓
inv12_reverse_0xd8dA…_deterministic                ✓
inv16_reverse_0xd8dA…_labelUserSafe                ✓
…
```

A red test names the invariant and the case — e.g. `inv16_reverse_0xd8dA…_labelUserSafe` failing with
`allow-mismatch` means your adapter surfaced a `provenance.label` the UIKit would refuse to render as
a trusted name.

---

## Pattern 2 — Runner-agnostic CI gate (no vitest)

The pure core returns the report as data, so you can gate a build, a script, or any non-vitest runner
on it:

```ts
import { checkConformance } from '@openzeppelin/adapter-runtime-utils/conformance';

const report = await checkConformance({ makeCapability, forwardVectors, reverseVectors });

if (!report.passed) {
  const failures = report.results.filter((r) => r.status === 'FAIL');
  console.error(`Adapter is non-conformant (${failures.length} failure(s)):`);
  for (const f of failures) console.error(`  ${f.key}: ${f.message}`);
  process.exit(1);
}
console.log(`Conformant: ${report.results.filter((r) => r.status === 'PASS').length} checks passed, `
  + `${report.results.filter((r) => r.status === 'SKIPPED').length} skipped.`);
```

Note the SKIPPED count — a forward-only adapter passes with the reverse family (and INV-6) skipped.
`SKIPPED` never fails the report, but it is **not** a pass: it means the method isn't implemented.

---

## Pattern 3 — Feature-detection: forward-only or reverse-only adapters

You don't declare which methods your adapter supports; the harness feature-detects them structurally.

- No `resolveName` on the capability → the **forward family is SKIPPED** (omit `forwardVectors` too).
- No `resolveAddress` → the **reverse family AND INV-6 are SKIPPED** (INV-6 only applies to reverse).

```ts
// A forward-only adapter: reverse family reported as SKIPPED, report still passes.
await describeConformance({
  suiteName: 'forward-only adapter',
  makeCapability: () => makeForwardOnlyCapability(),
  forwardVectors: [{ input: 'name.eth', expect: { ok: true } }],
  // no reverseVectors — reverse family + INV-6 are SKIPPED (visible in the report, not dropped)
});
```

---

## Pattern 4 — Custom label policy

INV-16 uses `DEFAULT_LABEL_POLICY` (anchored allowlist + 64-char cap + denylist). If your ecosystem's
legitimate provenance labels don't fit the default allowlist, pass a full override. It is used
**verbatim** — not merged with the default, so include every rule you want:

```ts
import { describeConformance } from '@openzeppelin/adapter-runtime-utils/conformance/vitest';
import type { LabelPolicy } from '@openzeppelin/adapter-runtime-utils/conformance';

const solanaLabelPolicy: LabelPolicy = {
  allow: /^[A-Za-z][A-Za-z0-9 .\-]*$/, // e.g. allow a dot for 'SNS v2.0'
  maxLength: 48,
  deny: [
    { name: 'contains-url-scheme', test: (l) => l.includes('://') },
    { name: 'contains-at-sign',    test: (l) => l.includes('@') },
    { name: 'empty-or-whitespace', test: (l) => l.trim().length === 0 },
  ],
};

await describeConformance({ makeCapability, forwardVectors, labelPolicy: solanaLabelPolicy });
```

You can also reuse the primitive directly in your own unit tests:

```ts
import { isUserSafeLabel, DEFAULT_LABEL_POLICY } from '@openzeppelin/adapter-runtime-utils/conformance';

expect(isUserSafeLabel('SNS').safe).toBe(true);
expect(isUserSafeLabel('https://x', DEFAULT_LABEL_POLICY).safe).toBe(false);
```

---

## Pattern 5 — Optional lifecycle probe (INV-26)

If your capability is guard-wrapped (a `RuntimeCapability` that throws `RuntimeDisposedError` after
`dispose()`), you can opt into an isolated lifecycle check that positively verifies the sanctioned
post-dispose throw actually fires:

```ts
await describeConformance({
  makeCapability,
  forwardVectors,
  lifecycleProbe: true, // default false
});
// Adds one test: inv26_lifecycle_disposedThrows
```

The probe runs on its **own dedicated instance** — never one used by the four required families — so
it can never contaminate the required run. If the capability exposes no `dispose`, the family is
`SKIPPED`. With `lifecycleProbe` off (the default), the required-four results are byte-identical to a
non-opted run.

---

## Understanding the report

`checkConformance` resolves to `{ results, passed }`. Each `InvariantResult` is one verdict for one
invariant × case:

```ts
const report = await checkConformance(config);
for (const r of report.results) {
  console.log(`${r.status.padEnd(7)} ${r.key} — ${r.message}`);
}
// PASS    inv6_0xd8dA…_forwardVerifiedConcreteBoolean — forwardVerified is a concrete boolean
// FAIL    inv16_forward_evil_labelUserSafe — label rejected: allow-mismatch
// SKIPPED inv8_reverse_ADDRESS_NOT_FOUND_neverThrows — resolveAddress not implemented
```

- `passed === results.every((r) => r.status !== 'FAIL')` — computed, never a separately-tracked flag.
- Result order is stable: forward family before reverse, vectors in your supplied order.
- The `message` on a FAIL states expected-vs-observed; on a SKIPPED, why it was skipped.

### The INV-8 never-throw decision table

For an expected-failure vector (`expect: { ok: false, code }`), INV-8 classifies what the adapter did:

| Adapter returned / did | Verdict |
|------------------------|---------|
| `{ ok: false }`, code in the closed union, code === declared | **PASS** |
| `{ ok: false }`, code in the union, code ≠ declared | **PASS** + note (code precision is your suite's job, not INV-8) |
| `{ ok: false }` with a code outside the union / missing / non-string | **FAIL** (fabricated code) |
| `{ ok: true }` (expected failure silently succeeded) | **FAIL** |
| Threw / rejected `RuntimeDisposedError` | **SKIPPED** (lifecycle — can't occur in a normal run) |
| Threw / rejected anything else | **FAIL** (the INV-8 violation) |

INV-8 asserts *never-throw + a returned closed-union code*. It does **not** fail you for returning an
in-union-but-different code than declared — that's `SC-002` code-precision, which your own adapter
suite owns.

---

## Common Mistakes

- **Forgetting the top-level `await` on `describeConformance`.** The capability calls run at collection
  time; without `await`, no tests are emitted and the suite silently looks empty. Always
  `await describeConformance(...)` at module top level.
- **Pointing `makeCapability` at a live or non-deterministic backend.** INV-12 calls the method twice
  and compares structurally; a live RPC or a `Date.now()`-in-provenance makes a compliant adapter
  flake. Pin the substrate.
- **Reading `SKIPPED` as "certified".** A skipped reverse family means "no `resolveAddress`", not
  "reverse works". If your adapter *should* support reverse, a SKIPPED reverse family is a wiring bug.
- **Reusing one capability instance across cases in your factory.** `makeCapability` must return a
  **fresh** instance each call — a memoizing factory leaks state between cases and can turn INV-12 into
  a false pass. The harness calls the factory once per case for exactly this reason.
- **Merging a partial `labelPolicy`.** An override replaces the default wholesale. If you pass
  `{ allow, maxLength }` without `deny`, you get *no* denylist. Include every rule you want.
- **Expecting INV-16 on failure vectors.** Value checks (INV-6/16) run only on realized `{ ok: true }`
  results. A vector declared `{ ok: true }` that returns `{ ok: false }` is an `EXPECT` FAIL, and its
  dependent value checks are recorded `SKIPPED` (`no value to inspect`) — never a silent pass.

---

## Known Limitations

- **INV-19 fine-grained emission spy (residual).** `describeConformance`'s exact vitest emission —
  call count, order, and specifically the `FAIL → it(() => expect.fail(message))` branch — cannot be
  asserted by an in-process spy, because the binding reads `it`/`it.skip` from the immutable `vitest`
  ES-module namespace (neither `vi.spyOn` nor reassignment can intercept it). The projection is proven
  **end-to-end** for the PASS/SKIP paths and the `ConformanceConfigError`-at-collection path. The
  consumer-visible contract is verified; the residual is the spy-level assertion. A future,
  purely-additive **runner-injection seam** (an optional `{ it }` argument defaulting to the vitest
  import) would close it without changing any default behavior. This is a documented enhancement, not
  a blocker.
- **The compliant-EVM run is a follow-up in `adapter-evm-core`.** This package delivers the harness and
  proves its own detection power (SC-004, below). The compliant run over a real adapter + mocked viem
  client is out of this package's scope — it lands in `adapter-evm-core`'s own Tests slice (Pattern 1
  is the exact wiring). Until then, no *real* adapter is graded by CI; the seeded-defect meta-suite is
  what proves the gate works.

---

## For harness maintainers: the seeded-defect meta-suite (SC-004)

The harness proves *its own* detection power in-package — the RS-TCK "the TCK tests itself" pattern.
`__tests__/seeded-defects.test.ts` runs a **compliant reference stub** (expected `report.passed ===
true`) and **one hand-written defective stub per defect class**, asserting each FAILs **exactly** its
own invariant:

```ts
it('detects throw-on-expected-failure (INV-8)', async () => {
  const report = await checkConformance({ makeCapability: () => throwsOnNameNotFoundStub(), forwardVectors });
  expect(report.passed).toBe(false);
  expect(report.results.find((r) => r.invariant === 'INV-8')?.status).toBe('FAIL');
});
```

The four seeded defect classes — throws-on-expected-failure (INV-8), `forwardVerified: undefined`
(INV-6), a URL `label` (INV-16), and a `Date.now()`-in-provenance non-determinism (INV-12) — are each
caught, and the compliant reference passes clean. **100% detection on the seeded set** is what
"SC-004 satisfied" means: no defect stub passes, and the reference never fails. The stubs are abstract
`ResolutionResult`-shaped hand-writes with **no client and no ecosystem assumption**, so the meta-suite
keeps the harness's zero-concrete-adapter-dependency property intact.
