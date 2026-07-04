---
stage: design
project: ens-uikit-support
repo: openzeppelin-adapters
sub_feature: SF-4
mode: extension
extends: packages/adapter-runtime-utils
status: draft
timestamp: 2026-07-04
author: aleksandr.pasevin
previous_stage: artifacts/001-ens-uikit-support/sf-4-conformance-harness/01-research.md
tags: [conformance, tck, name-resolution, adapter, test-infrastructure, deep-equal, allowlist, seeded-defect, cross-repo]
---

# SF-4: Adapter Conformance Test Harness — Design Document

## Summary

SF-4 adds a **parameterized, adapter-agnostic conformance harness** to `@openzeppelin/adapter-runtime-utils` under a new `./conformance` subpath. Its shape is a **runner-agnostic pure core** — `checkConformance(config): Promise<ConformanceReport>` — that runs any `NameResolutionCapability` implementation against four contract families only an adapter can satisfy (UIKit **INV-6** concrete-boolean `forwardVerified`, **INV-8** expected-failures-never-throw, **INV-12** deterministic-under-stable-state, **INV-16** user-safe `provenance.label`) and returns per-invariant verdicts as **data**, plus a thin `describeConformance()` vitest binding that projects that data onto `it()`/`it.skip()`. The core takes a **capability factory + declarative `ResolutionResult`-shaped vectors** over a caller-owned pinned substrate (Reactive Streams TCK `createPublisher` shape), feature-detects `resolveName`/`resolveAddress` to **skip** absent families, and ships a **seeded-defect meta-suite** (the TCK tests itself) that proves SC-004 100% detection. The two novel semantics this repo owns — **deep-equal-under-cache-TTL** and the **`label` allowlist** — are pinned here: a **hand-rolled** structural comparator (zero third-party dep) over a normalize pre-pass, and a widened anchored allowlist + belt-and-braces denylist with a `labelPolicy` override.

## Module Structure

All new files under a single new directory; **no modification** to any existing `adapter-runtime-utils` source. The `./conformance` subpath keeps test-only surface out of the runtime entry (`.`).

```
packages/adapter-runtime-utils/src/conformance/
├── index.ts              — public re-exports for the ./conformance subpath (the consumer entry)
├── types.ts              — ConformanceConfig, ForwardVector/ReverseVector, VectorExpectation,
│                           InvariantResult, ConformanceReport, LabelPolicy, ConformanceConfigError
├── checker.ts            — checkConformance() pure core: feature-detect + skip, orchestrate the
│                           four families, assemble the ConformanceReport
├── checks/               — one file per invariant family (RS-TCK "one rule per test" traceability)
│   ├── forward-verified.ts   — INV-6
│   ├── never-throws.ts       — INV-8 (throw-vs-return classification)
│   ├── determinism.ts        — INV-12 (call-twice → normalize → structuralEqual)
│   └── label-user-safe.ts    — INV-16 (delegates to label-policy)
├── deep-equal.ts         — normalizeResolutionResult() pre-pass + structuralEqual() (INV-12 engine)
├── label-policy.ts       — DEFAULT_LABEL_POLICY + isUserSafeLabel() (INV-16 engine)
├── vitest-binding.ts     — describeConformance() thin binding (imports vitest — the only file that does)
└── __tests__/
    ├── seeded-defects.test.ts  — SC-004 meta-suite: compliant reference stub + one stub per defect class
    ├── deep-equal.test.ts      — unit tests for the comparator itself (conformance-critical; must-do)
    └── label-policy.test.ts    — label corpus: canonical + SF-5 pass set, SC-004 fail set
```

`package.json#exports` gains a second entry (see Change Plan). The **compliant EVM run** (pointing the harness at the real `createNameResolution` over a mocked viem client) lives in **`adapter-evm-core`'s** own test suite — never here — preserving zero concrete-adapter deps and avoiding a dependency cycle.

**Boundary rule that shapes the split:** only `vitest-binding.ts` and the `__tests__/` files may import `vitest`. `checker.ts`, `checks/*`, `deep-equal.ts`, `label-policy.ts`, `types.ts`, `index.ts` are **runner-free** — importable by any consumer on any runner. This is what makes the SC-004 meta-test able to assert on results as data rather than scraping runner output.

## Core Types

All types are `readonly`. Names/addresses stay plain `string` (chain-agnostic, mirroring `@openzeppelin/ui-types`). The harness imports the contract types; it never redefines them.

```ts
import type {
  NameResolutionCapability,
  NameResolutionError,
  ResolutionResult,
  ResolvedAddress,
  ResolvedName,
} from '@openzeppelin/ui-types';

/** The closed 7-code set, derived from the union so it can never drift from ui-types. */
export type NameResolutionErrorCode = NameResolutionError['code'];

/** What a vector expects the capability to produce for its input. */
export type VectorExpectation =
  /** Expect a successful resolution. The concrete value is used by INV-12/INV-16; INV-6 asserts on it. */
  | { readonly ok: true }
  /** Expect a typed failure with this code — an EXPECTED-FAILURE vector (drives INV-8). */
  | { readonly ok: false; readonly code: NameResolutionErrorCode };

/** A forward-resolution case: an input name + expected outcome over the caller's pinned substrate. */
export interface ForwardVector {
  readonly input: string;
  readonly expect: VectorExpectation;
  /** Optional short slug for report keys / test names (defaults to a sanitized `input`). */
  readonly label?: string;
}

/** A reverse-resolution case: an input address + expected outcome. */
export interface ReverseVector {
  readonly input: string;
  readonly expect: VectorExpectation;
  readonly label?: string;
}

/** Defense-in-depth policy for INV-16. A label is user-safe iff it matches `allow`, is within
 *  `maxLength`, and trips no `deny` rule. Callers may override the whole policy. */
export interface LabelPolicy {
  /** Anchored allowlist the label MUST fully match. */
  readonly allow: RegExp;
  /** Inclusive maximum length in characters. */
  readonly maxLength: number;
  /** Belt-and-braces denylist; if ANY predicate returns true, the label is rejected. */
  readonly deny: readonly LabelDenyRule[];
}

export interface LabelDenyRule {
  /** Stable identifier surfaced in the FAIL message (e.g. 'contains-url-scheme'). */
  readonly name: string;
  readonly test: (label: string) => boolean;
}

/** Configuration for a single conformance run. */
export interface ConformanceConfig {
  /** Fresh capability per case (RS-TCK createPublisher). MUST wrap a pinned/mocked substrate. */
  readonly makeCapability: () => NameResolutionCapability;
  /** Forward cases. Omit if the adapter has no `resolveName` (family is SKIPPED). */
  readonly forwardVectors?: readonly ForwardVector[];
  /** Reverse cases. Omit if the adapter has no `resolveAddress` (family + INV-6 are SKIPPED). */
  readonly reverseVectors?: readonly ReverseVector[];
  /** When true, INV-12 also compares `avatarUrl`. Default false (SF-3 INV-13 carry-in). */
  readonly stableAvatarSurface?: boolean;
  /** Override the INV-16 policy. Default = DEFAULT_LABEL_POLICY. */
  readonly labelPolicy?: LabelPolicy;
  /** Human-readable suite name for report/test grouping. Default 'NameResolutionCapability'. */
  readonly suiteName?: string;
}

export type InvariantId = 'INV-6' | 'INV-8' | 'INV-12' | 'INV-16';
export type CheckStatus = 'PASS' | 'FAIL' | 'SKIPPED';

/** One verdict, keyed to an invariant and a specific case. */
export interface InvariantResult {
  readonly invariant: InvariantId;
  /** Invariant-numbered key, e.g. 'inv8_reverse_ADDRESS_NOT_FOUND_neverThrows'. */
  readonly key: string;
  readonly status: CheckStatus;
  /** On FAIL: what was expected vs. observed. On SKIPPED: why. On PASS: brief confirmation. */
  readonly message: string;
}

/** The full run outcome — a value, not a thrown result. */
export interface ConformanceReport {
  readonly results: readonly InvariantResult[];
  /** true iff NO result is FAIL. SKIPPED never fails a report. */
  readonly passed: boolean;
}
```

## Public API

Exported from `src/conformance/index.ts` (the `./conformance` subpath).

```ts
/**
 * Run the four conformance families against `config.makeCapability()` over the supplied
 * vectors and return a structured report. Never throws for adapter misbehavior — an adapter
 * that throws on an expected-failure vector is recorded as an INV-8 FAIL, not propagated.
 * Throws ConformanceConfigError only for programmer error in `config` itself.
 *
 * Feature-detection is structural: absent `resolveName` skips the forward family; absent
 * `resolveAddress` skips the reverse family AND INV-6. Skips are reported as SKIPPED, never dropped.
 */
export function checkConformance(config: ConformanceConfig): Promise<ConformanceReport>;

/**
 * Thin vitest binding. Runs checkConformance() once, then projects each InvariantResult onto a
 * test: PASS/FAIL → it() (FAIL bodies call expect.fail(message)); SKIPPED → it.skip().
 *
 * MUST be awaited at the top level of a test file (vitest supports top-level await), because the
 * capability calls run at collection time over the pinned substrate:
 *   await describeConformance({ makeCapability, forwardVectors, reverseVectors });
 */
export function describeConformance(config: ConformanceConfig): Promise<void>;

/**
 * INV-16 primitive, exported for reuse and for the seeded-defect meta-suite. Returns a structured
 * verdict rather than a boolean so the FAIL message can name which rule tripped.
 */
export function isUserSafeLabel(
  label: string,
  policy?: LabelPolicy,
): { readonly safe: boolean; readonly reason?: string };

/** The default, widened, defense-in-depth label policy this repo defines (see Design Decisions). */
export const DEFAULT_LABEL_POLICY: LabelPolicy;

/**
 * INV-12 engine, exported for unit-testing and reuse. Canonicalizes a ResolutionResult for
 * structural comparison, then compares. `includeAvatar` follows `stableAvatarSurface`.
 */
export function normalizeResolutionResult(
  result: ResolutionResult<ResolvedAddress | ResolvedName>,
  opts: { readonly includeAvatar: boolean },
): unknown;
export function structuralEqual(a: unknown, b: unknown): boolean;

// Re-exported types: ConformanceConfig, ForwardVector, ReverseVector, VectorExpectation,
// InvariantResult, ConformanceReport, InvariantId, CheckStatus, LabelPolicy, LabelDenyRule,
// NameResolutionErrorCode, ConformanceConfigError.
```

### Per-family logic (what each `checks/*` function asserts)

**INV-6 — `forward-verified.ts`** (reverse only; SKIPPED if no `resolveAddress`).
For every `reverseVector` with `expect.ok === true`, call `resolveAddress(input)`; on `{ok:true}`, assert `typeof value.forwardVerified === 'boolean'`. A missing/`undefined` field is FAIL. Per SF-3 Approach A the value is expected constant-`true`, but INV-6 asserts only *concrete boolean* (the "constant-true" property is SF-3's, not the harness's to re-litigate). Key: `inv6_<vectorLabel>_forwardVerifiedConcreteBoolean`.

**INV-8 — `never-throws.ts`** (forward + reverse; per-direction SKIPPED if the method is absent).
For every vector with `expect.ok === false` (the expected-failure set — Research's `createFailedPublisher` analog), invoke the method inside `try/catch` and `await` the promise:
- Returns `{ok:false}` with a code in the closed 7-code union → **PASS** (incl. a returned `ADAPTER_ERROR`, even the SF-1 depth-32 folded-disposed case).
- Returns `{ok:true}` where a failure was expected → **FAIL** (an expected-failure path silently "succeeded").
- **Throws / rejects `RuntimeDisposedError`** → out of scope for INV-8 (lifecycle, not the name-resolution contract). This cannot occur in a normal run because the harness never disposes the capabilities it creates (see State Ownership) and never calls on a disposed instance; if it is observed it is recorded as SKIPPED with a note, never FAIL.
- **Throws / rejects anything else** → **FAIL** (the INV-8 violation). A "throw" for an async method means the returned promise rejects; the checker treats sync-throw and promise-rejection identically.

Key: `inv8_<direction>_<expectedCode>_neverThrows`.

**INV-12 — `determinism.ts`** (forward + reverse; per-direction SKIPPED if absent).
For every vector (both `ok:true` and `ok:false` expectations), call the method **twice on the same fresh instance** (memoizer returns cached-equal; re-querier returns fresh-equal — both pass). Run `normalizeResolutionResult` on each result, then `structuralEqual`. Structurally-equal → PASS; otherwise FAIL with a shallow diff hint in the message. Object *identity* is never required. Key: `inv12_<direction>_<vectorLabel>_deterministic`.

**INV-16 — `label-user-safe.ts`** (forward + reverse; SKIPPED if neither method present).
For every vector with `expect.ok === true`, on `{ok:true}` run `isUserSafeLabel(value.provenance.label, config.labelPolicy)`. `safe:false` → FAIL, message naming the tripped rule. Key: `inv16_<direction>_<vectorLabel>_labelUserSafe`.

### The INV-12 engine — normalize pre-pass + `structuralEqual`

`normalizeResolutionResult(result, {includeAvatar})` canonicalizes so that two runs of a *compliant* adapter compare equal regardless of memoize-vs-re-query:
1. **Recursively drop keys whose value is `undefined`.** This is the resolution of must-do #1: `{avatarUrl: undefined}` and `{}` (key absent) **normalize to the same shape and therefore compare EQUAL** — consistent with SF-3 INV-4 (`avatarUrl` is key-absent-when-undefined) and with the closed union's optional fields (`scopedToNetworkId?`). Documented and unit-tested.
2. **On `{ok:true}`:** if `!includeAvatar`, drop `avatarUrl` from the value entirely (SF-3 INV-13 carry-in — the avatar surface may flap without violating determinism).
3. **On `{ok:false}`:** drop `error.cause`. `cause` is `unknown`-typed diagnostic data that may carry a live native `Error` (unstable stack/fields); chain-agnostic code MUST NOT narrow it, so it is excluded from the determinism compare. The `code` and all typed payload fields (`name`/`address`/`networkId`/`elapsedMs`/`detail`/`message`/`reason`) remain compared.

`structuralEqual(a, b)` — hand-rolled, ~30 lines, zero third-party dep:
- `Object.is`-style primitive compare (strings, numbers, booleans, `null`); `undefined` never reaches it post-normalize.
- Arrays: equal length + elementwise recursive.
- Plain objects: identical own-enumerable key sets + recursive per-key.
- Type mismatch (array vs object, differing typeof) → `false`.
- **Domain assumption (documented):** the normalized resolution core is plain JSON-ish data — strings, booleans, numbers, `null`, nested plain objects. No `Date`/`Map`/`Set`/`RegExp`/typed arrays occur (the ui-types value types contain none). If a non-plain object is ever encountered it falls back to `===` (identity) — a conservative choice that would surface as a determinism FAIL rather than a silent false pass.

## State Ownership & Boundaries

| Element | Kind | Lifecycle / ownership |
|---|---|---|
| `checkConformance` | Stateless async function | Owns no retained state. Per case, calls `config.makeCapability()` to get a **fresh** instance, runs that case's calls, drops the reference. Aggregates `InvariantResult[]` locally and returns. |
| Capability instances | Caller-constructed, harness-scoped | Created by the injected `makeCapability`. The harness **does not** call `dispose()` — lifecycle/dispose is the OPTIONAL family deferred to Invariants (call C), and never disposing keeps `RuntimeDisposedError` out of the required families entirely. Instances are GC'd after their case. |
| The pinned substrate | **Caller-owned** | The mocked/pinned backend a capability wraps is the caller's responsibility (RS-TCK "stable underlying state" is a fixture property). The harness demands it via the factory shape but never constructs or owns it. |
| `DEFAULT_LABEL_POLICY` | Module constant (frozen) | Pure data + pure predicates; no mutable state. A consumer override is passed per-call in `config.labelPolicy`, never mutated. |
| `describeConformance` | Stateless async binding | Runs `checkConformance` once at collection time, captures the report in a local, emits synchronous `it()`s. No cross-run state. |

**DI seam:** the single seam is `makeCapability: () => NameResolutionCapability`. Everything the harness needs to vary per ecosystem (EVM-over-mock, abstract stub, future SNS adapter) enters through it. Vectors and `labelPolicy` are the other injected inputs. There is no global registration and no singleton.

## Integration Patterns

**1. The compliant EVM run (in `adapter-evm-core`'s test suite — not in this package):**

```ts
import { describeConformance } from '@openzeppelin/adapter-runtime-utils/conformance';
import { createNameResolution, createEvmPublicClient } from '@openzeppelin/adapter-evm-core';
import { mockEnsClient } from './fixtures'; // pinned viem client — caller-owned substrate

await describeConformance({
  suiteName: 'adapter-evm-core NameResolutionCapability',
  makeCapability: () => createNameResolution(evmConfig, { publicClient: mockEnsClient() }),
  forwardVectors: [
    { input: 'vitalik.eth', expect: { ok: true } },
    { input: 'nope.eth',    expect: { ok: false, code: 'NAME_NOT_FOUND' } },
  ],
  reverseVectors: [
    { input: '0xd8dA…', expect: { ok: true } },
    { input: '0x0000…', expect: { ok: false, code: 'ADDRESS_NOT_FOUND' } },
  ],
  stableAvatarSurface: false, // avatar excluded from the determinism compare
});
```

**2. Runner-agnostic core use (any test runner, or CI gate script):**

```ts
import { checkConformance } from '@openzeppelin/adapter-runtime-utils/conformance';

const report = await checkConformance(config);
if (!report.passed) {
  const failures = report.results.filter((r) => r.status === 'FAIL');
  throw new Error(`Adapter is non-conformant:\n${failures.map((f) => `${f.key}: ${f.message}`).join('\n')}`);
}
```

**3. The seeded-defect meta-suite (in-package, proves SC-004):**

```ts
// each stub is a hand-written NameResolutionCapability wrapping declarative results (no client)
it('detects throw-on-expected-failure (INV-8)', async () => {
  const report = await checkConformance({ makeCapability: () => throwsOnNameNotFoundStub(), forwardVectors });
  expect(report.passed).toBe(false);
  expect(report.results.find((r) => r.invariant === 'INV-8')?.status).toBe('FAIL');
});
```

## Error Handling

The harness follows a **Result-style** posture for the subject under test and a **typed-throw** posture only for its own programmer errors — chosen so adapter misbehavior is *data* the report captures, never an exception that aborts the run.

- **Adapter misbehavior is never thrown by the harness.** A thrown/rejected expected-failure vector becomes an INV-8 `FAIL` result; a missing `forwardVerified` becomes an INV-6 `FAIL`; etc. `checkConformance` resolves to a `ConformanceReport` in all these cases.
- **`ConformanceConfigError extends Error`** (`code = 'CONFORMANCE_CONFIG'`) is the *only* throw from `checkConformance`, reserved for genuine caller error: `makeCapability` not a function; a vector `input` not a string; `labelPolicy.allow` not a `RegExp`. These are bugs in the harness *invocation*, not adapter non-conformance, so they surface loudly rather than as a misleading FAIL.
- **No generic `Error` throws, no opaque leak.** The harness never re-throws an adapter's caught error; it records `String(err)` (and `err?.constructor?.name`) into the FAIL message for diagnosis.

```ts
export class ConformanceConfigError extends Error {
  readonly code = 'CONFORMANCE_CONFIG' as const;
  constructor(message: string) {
    super(message);
    this.name = 'ConformanceConfigError';
  }
}
```

## Events / Observability

**The `ConformanceReport` is the sole observability surface** — one `InvariantResult` per (invariant × case), each carrying a stable `key`, a `status`, and a human-readable `message`. The pure core emits **no logs, no metrics, no events** (that would couple it to a host runtime and undermine runner-agnosticism). The `describeConformance` binding projects the same data onto vitest test names (`it(result.key, …)`), so a red test in CI points straight at the violated invariant and case. No Prometheus/OTel surface — this is test infrastructure, not a long-running service.

## Change Plan (Extension Mode)

**New modules** (all under `src/conformance/`): `index.ts`, `types.ts`, `checker.ts`, `checks/{forward-verified,never-throws,determinism,label-user-safe}.ts`, `deep-equal.ts`, `label-policy.ts`, `vitest-binding.ts`, and `__tests__/{seeded-defects,deep-equal,label-policy}.test.ts`.

**Modified modules:** exactly one — `packages/adapter-runtime-utils/package.json`. Add a `./conformance` export and promote `vitest` from a bare dev-dep to a **peer + dev** dep so the binding's `vitest` import is declared for consumers:

```jsonc
"exports": {
  ".": "./src/index.ts",
  "./conformance": "./src/conformance/index.ts"
},
"peerDependencies": {
  "@openzeppelin/ui-types": "^3.1.0",
  "vitest": "^4.1.0"
},
"peerDependenciesMeta": { "vitest": { "optional": true } }, // pure core needs no runner
"devDependencies": { "@openzeppelin/ui-types": "^3.1.0", "@types/node": "^25.0.0", "typescript": "^5.9.2", "vitest": "^4.1.0" }
```

**Unchanged modules (explicit):** `src/index.ts` (the `.` entry) and its exports, `runtime-capability.ts` (the guard Proxy is *consumed*, never modified — the harness relies on its `RuntimeDisposedError`-on-post-dispose behavior but never disposes), `runtime-factories.ts`, `profile-runtime.ts`. `sideEffects: false` holds — the new modules are side-effect-free.

**API compatibility:** purely additive. The existing `.` entry and every current export are untouched; nothing consumes the new subpath yet except `adapter-evm-core`'s tests. Non-EVM adapters are unaffected (SC-006). **No new third-party runtime dependency** — the harness stays on `@openzeppelin/ui-types` + `vitest` (peer).

**Migration:** none for existing consumers. New consumers import from `@openzeppelin/adapter-runtime-utils/conformance`.

## Design Decisions Log

- **D-1 — Runner-agnostic pure core + thin vitest binding (Research Open Q1 resolved).** `checkConformance` returns a `ConformanceReport` value; `describeConformance` is a ~20-line projection onto vitest. Chosen over a `describe.for`-only harness so the SC-004 seeded-defect meta-suite asserts on results *as data* (`report.passed`, per-key status) instead of scraping runner pass/fail. The small indirection is worth it for a fund-safety gate whose own correctness must be provable.
- **D-2 — Hand-rolled `structuralEqual`; `dequal` dropped (Research Open Q2/Axis-B, Orchestrator-approved).** The zero-third-party-dep footprint is a first-class property of a harness consumed across many adapter repos, so we hand-roll a ~30-line comparator instead of adding `dequal`. The resolution core is plain JSON-ish data (no `Date`/`Map`/`Set`/`RegExp`/typed arrays), so `dequal`'s extra type handling is unused surface. `dequal` is cited as prior art for the algorithm. **Must-do (a):** `{avatarUrl: undefined}` ≡ `{}` — the normalize pass drops undefined-valued keys recursively, so explicit-undefined and absent-key compare EQUAL (consistent with SF-3 INV-4). **Must-do (b):** the comparator is unit-tested in `deep-equal.test.ts` because a comparator bug is a false pass/fail in the gate itself.
- **D-3 — `error.cause` excluded from the INV-12 determinism compare.** `cause` is `unknown`-typed diagnostic data that may hold a live native `Error` with unstable fields; the ui-types doc forbids chain-agnostic narrowing of it. Comparing it would make a compliant adapter flake. Only `code` + typed payload fields participate. (Novel semantic this repo owns, alongside the avatar rule.)
- **D-4 — `avatarUrl` compared only under `stableAvatarSurface` (SF-3 INV-13 carry-in).** Default `false`. A memoizing adapter and a re-querying adapter must both pass; the avatar derives from a broader, possibly-flapping surface, so it is excluded from determinism unless the caller declares the surface stable.
- **D-5 — Widened label allowlist + denylist + `labelPolicy` override (Research Open Q2, Orchestrator-approved, hyphen+apostrophe).**
  - Allowlist: `/^[A-Za-z][A-Za-z0-9 ]*(?:[-'][A-Za-z0-9 ]+)*$/` — must start with a letter (rejects `0x…` and bare digits), allows internal single hyphen/apostrophe as prose connectors (accommodates SF-5's `'ENS via CCIP-Read'` without forcing SF-5 hyphen-free), no `:`/`/`/`@`.
  - Length guard: `maxLength = 64`, checked separately (keeps the regex readable and avoids catastrophic backtracking).
  - Denylist (reject if ANY trips): contains `://`; matches `/0x[0-9a-fA-F]{4,}/`; contains `@`; contains an ASCII control char (`/[\x00-\x1F\x7F]/`); is empty or whitespace-only after trim.
  - **Verified corpus** (locked in `label-policy.test.ts`): PASS = `'ENS'`, `'ENS via external gateway'`, `'SNS'`, `'ENS via CCIP-Read'`; FAIL = `'https://internal-gateway.oz.internal/ccip/...'` (url), `'0xabcdef…'` (hex), `'gw@resolver:node-7'` (@/internal-id), `''` (empty). All four SC-004 label defect classes fail.
  - The whole policy is overridable via `config.labelPolicy` so an ecosystem can tune it without forking. Mirrors SF-1's defense-in-depth classifier (allowlist-primary + denylist-fallback).
- **D-6 — Vectors are declarative `ResolutionResult`-shaped expectations over a `makeCapability()` factory (Research Open Q3, confirmed).** Fresh instance per case (RS-TCK `createPublisher`); the pinned substrate is caller-owned. Research's separate `expectedFailureVectors` array is **folded** into per-vector `expect: {ok:false, code}` tags — one taxonomy, less redundancy; the INV-8 input set is exactly the `ok:false`-tagged vectors (the `createFailedPublisher` analog). Abstract stubs drive the in-package meta-suite; real-client-over-mock lives in `adapter-evm-core`. No client mocks in the harness → no concrete-adapter dep, no dep cycle.
- **D-7 — INV-8 throw-vs-return classification (commitment #4).** Only an actually-thrown/rejected **non-`RuntimeDisposedError`** on an expected-failure vector is a FAIL. A returned `{ok:false}` (any closed-union code, incl. depth-32 folded-disposed `ADAPTER_ERROR`) is PASS. A returned `{ok:true}` where failure was expected is FAIL. `RuntimeDisposedError` is lifecycle — out of the INV-8 family; the harness never disposes, so it should never appear.
- **D-8 — Harness never calls `dispose()`; lifecycle-throw is an OPTIONAL family deferred to Invariants (Research Open Q5, confirmed).** Keeping dispose out of the required run keeps `RuntimeDisposedError` off the INV-8 surface and keeps the four families strictly about the name-resolution contract. Whether to add an optional post-dispose `RuntimeDisposedError` family is Invariants' call.
- **D-9 — `describeConformance` is awaited at top level.** The capability/substrate calls run at vitest collection time; results are captured before `it()`s are emitted. Documented as a usage requirement. Valid because the substrate is pinned/synchronous-to-construct.
- **D-10 — `passed` counts only FAIL.** `SKIPPED` (absent optional method) never fails a report — mirrors RS-TCK required-vs-optional; a forward-only adapter passes with the reverse family SKIPPED.
- **D-11 — `isValidName` presence.** It is type-required on the interface, so TS guarantees it; the harness does not add it as one of INV-6/8/12/16. A lightweight non-family presence/`typeof`-boolean assertion may be added at Code stage but is explicitly not a conformance family here.

## Out of Scope

- **The lifecycle / post-dispose `RuntimeDisposedError` family** — deferred to Invariants as an optional family (D-8); not built as a required family here.
- **The compliant EVM run itself** — lives in `adapter-evm-core`'s test suite (dep-cycle avoidance); this design only defines the harness it plugs into and the vector shape it supplies.
- **Automated mutation testing (Stryker) as the shipping gate** — cited as SC-004 rationale in Research; the shippable gate is the deterministic hand-seeded set. Optional post-core hardening only.
- **ENS v2 / `EnsProvenance`-specific conformance** — SF-5 is additive; any v2-specific label vetting or provenance-narrowing check is an SF-5 extension of this suite, flagged there, not built here. The widened allowlist already accommodates SF-5's real labels.
- **Live-network / testnet-fork resolution** — the harness is substrate-agnostic and expects pinned/mocked backends; end-to-end fork tests belong to each adapter's own integration suite.
- **Non-`NameResolutionCapability` capabilities** — the harness is scoped to name resolution; generalizing the TCK pattern to other Tier-2 capabilities is a separate initiative.
- **SC-002 exact-code-distinctness enforcement beyond the closed-union membership check** — INV-8 asserts never-throw + returns `{ok:false}` + code ∈ closed union; asserting the *declared* code matches exactly is used for reporting but is not what fails the INV-8 family (a returned wrong-but-valid code is still never-throw-compliant). Precise per-code correctness is the adapter's own test suite's job.

## Dev Notes

- This is TEST INFRASTRUCTURE — the viem-first directive does **not** apply. The harness depends only on `@openzeppelin/ui-types` (+ `vitest` peer for the binding); it must never import viem or any concrete adapter.
- Invariant ids are kept **aligned with UIKit's** (INV-6/8/12/16) so a red conformance test is traceable across repos — the enforcement UIKit's SF-1 invariants doc (lines 497/507) explicitly delegated here.
- SF-3 Approach A (suppress-on-mismatch) means the reverse success path only ever surfaces forward-verified names, so INV-6's returned `forwardVerified` is expected constant-`true`; the harness asserts *concrete boolean* (INV-6's scope), and mismatch is exercised as an `ADDRESS_NOT_FOUND` expected-failure vector (INV-8), never a `forwardVerified:false` success.
- No drift raised. All four design calls were resolved design-internally with the Orchestrator (A–D green-lit); commitments 1–5 confirmed current at stage start. No edit to delivered SF-1/SF-2/SF-3 code, no SF-1 mapper change, no spec-body edit.

## Open Questions

1. **Optional lifecycle-throw family** — should Invariants add an optional family asserting a post-dispose call rejects/throws `RuntimeDisposedError`? Real guard-Proxy behavior, but lifecycle rather than name-resolution contract. Deferred to Invariants (D-8). *(Owner: Invariants.)*
2. **Network-switch determinism is moot** — the capability binds network at factory time (no `setNetwork`), so INV-12 is single-network by construction; the harness need not probe cross-network determinism. Confirm at Invariants and record as an explicit non-obligation. *(Owner: Invariants.)*
3. **INV-8 declared-code-mismatch reporting granularity** — when an expected-failure vector returns `{ok:false}` with a *different* closed-union code than declared, the current design PASSES INV-8 (never-throw held) and only notes the mismatch in the message. Confirm Invariants agrees this stays out of the INV-8 failure condition (it is SC-002 code-precision, the adapter's own suite's concern), or wants a separate soft-check surfaced. *(Owner: Invariants.)*
