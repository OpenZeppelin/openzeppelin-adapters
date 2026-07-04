---
stage: research
project: ens-uikit-support
repo: openzeppelin-adapters
sub_feature: SF-4
mode: extension
extends: packages/adapter-runtime-utils
status: draft
timestamp: 2026-07-04
author: aleksandr.pasevin
previous_stage: null
tags: [conformance, tck, name-resolution, adapter, test-infrastructure, deep-equal, allowlist, seeded-defect, cross-repo]
---

# SF-4: Adapter Conformance Test Harness — Research Report

## Summary

SF-4 is a **parameterized, adapter-agnostic conformance harness** (home: `@openzeppelin/adapter-runtime-utils`) that any `NameResolutionCapability` implementation runs against to prove the four contract obligations only an adapter can satisfy: UIKit **INV-6** (`forwardVerified` is always a concrete boolean), **INV-8** (expected failures return `{ ok: false }`, never throw), **INV-12** (deterministic-input-under-stable-state returns structurally-equal results), and **INV-16** (`provenance.label` is user-safe). It must hit **SC-004** — 100% detection on a seeded-defect set (throw-on-expected-failure, `undefined` `forwardVerified`, non-user-safe `label`, non-deterministic).

**Verdict: BUILD** — as a **runner-agnostic pure checker** that returns a structured `ConformanceReport`, wrapped by a thin `vitest` binding. The canonical prior art is the **Reactive Streams TCK** (extend-a-base + factory-method parameterization, rule-numbered test naming, required-vs-optional skipping). This is TEST INFRASTRUCTURE, so the viem-first directive does not apply; the harness depends only on `@openzeppelin/ui-types` and stays free of any concrete adapter. Two novel-semantics decisions this repo owns are proposed below: **deep-equal-under-cache-TTL** (compare the reverse *core* unconditionally; include `avatarUrl` only under a declared-stable avatar surface) and the **`label` allowlist** (anchored allowlist regex + belt-and-braces denylist, defense-in-depth mirroring SF-1's classifier).

---

## The Contract Under Test (ground-truth, read from disk)

The harness parameterizes over `NameResolutionCapability` (from `@openzeppelin/ui-types`, UIKit SF-1, shipped `@3.1.1`):

- `packages/types/src/adapters/capabilities/name-resolution.ts` — `isValidName(name): boolean` (required, sync, no I/O), `resolveName?(name): Promise<ResolutionResult<ResolvedAddress>>` (optional), `resolveAddress?(address): Promise<ResolutionResult<ResolvedName>>` (optional). Feature detection is **structural** (`if (cap.resolveName)`), so the harness must **skip** a family when its method is absent — the required-vs-optional split, exactly as the RS TCK skips `Publisher` tests for a `Subscriber`-only library.
- `packages/types/src/common/name-resolution.ts` — value types + the **closed 7-code** `NameResolutionError` union: `NAME_NOT_FOUND`, `ADDRESS_NOT_FOUND`, `UNSUPPORTED_NETWORK`, `UNSUPPORTED_NAME`, `RESOLUTION_TIMEOUT`, `EXTERNAL_GATEWAY_ERROR`, `ADAPTER_ERROR`. `ResolvedName.forwardVerified: boolean` (no `?`), `ResolutionProvenance.label: string`, `ResolvedName.avatarUrl?: string`, `ResultResult<T> = {ok:true,value} | {ok:false,error}`.

The four adapter-side invariants the harness enforces (from UIKit `sf-1-name-resolution-capability/03-invariants.md`, verified on disk):

| UIKit INV | Statement (verbatim gist) | What only an adapter can violate |
|-----------|---------------------------|----------------------------------|
| **INV-6** | Every `ResolvedName` from `resolveAddress` carries `forwardVerified: boolean` — never `undefined`/optional. | An adapter that skips forward-verify and *omits* the field. |
| **INV-8** | Adapters MUST NOT throw for expected failure paths — every expected failure is `{ ok: false }` with a union code. | An adapter that lets a native RPC/gateway/timeout error propagate as a thrown exception. |
| **INV-12** | For fixed `(network, name)`/`(network, address)` under stable underlying state, repeated calls return **structurally equal** `ResolutionResult<T>`. Adapter MAY memoize or re-query; interface takes no position. | An adapter whose result varies call-to-call under stable state (e.g. a `Date.now()` in provenance, unstable object identity leaking through). |
| **INV-16** | `provenance.label` is a **user-safe rendered string** — never internal identifiers, opaque enums, RPC URLs, debug strings. Contract, not type-enforceable. | An adapter that emits `'https://internal-gateway.oz.internal/ccip/...'` or `0x…` as `label`. |

UIKit's own invariants doc (INV lines 497, 507) is explicit that these "**cannot be enforced by SF-1's tests**" and must live in "an adapter conformance suite owned by the sibling `openzeppelin-adapters` initiative" — SF-4 *is* that action item landing.

---

## Existing TypeScript Implementations

There is **no** existing TS package that is a drop-in conformance/TCK harness for a capability interface. The relevant TS prior art is the parameterization and comparison machinery, not a ready-made suite:

- **`vitest` `describe.each` / `describe.for` / `test.for`** — [vitest.dev/api/describe](https://vitest.dev/api/describe). `describe.for` is the modern, type-simplified form; `describe.each` is Jest-compat. This is the idiomatic TS way to run one suite body against N inputs (here: N adapters or N seeded defects). Already available — `adapter-runtime-utils` dev-deps `vitest@^4.1.0`. **Caveat:** coupling assertions directly to `describe.each` makes the *meta-test* (proving SC-004 detection) awkward — you'd have to capture runner pass/fail output. Prefer a pure checker (see Recommendation).
- **`dequal`** — [github.com/lukeed/dequal @ `37c21f6`](https://github.com/lukeed/dequal/tree/37c21f675c1f538f2d4b63ebf19a161411e7a5fd). Tiny (~350B), zero-dep, correct structural deep-equal (handles `Date`, `RegExp`, `Map`, `Set`, typed arrays). No field-exclusion knob — you normalize the inputs first.
- **`fast-deep-equal`** — [github.com/epoberezkin/fast-deep-equal @ `a8e7172`](https://github.com/epoberezkin/fast-deep-equal/tree/a8e7172b6c411ec320d6045fd4afbd2abc1b4bde). Also zero-dep, fast; same "no exclusion" story.
- **`fast-equals`** (`createCustomEqual`) — [npmjs.com/package/fast-equals](https://www.npmjs.com/package/fast-equals). Supports custom comparators (could exclude a field mid-walk), at the cost of a heavier API and a dep.
- **Node `assert.deepStrictEqual` / vitest `expect().toStrictEqual`** — built-in, strict (distinguishes `undefined` props, checks prototypes). `toStrictEqual` is notable because it **treats `{a: undefined}` as different from `{}`** — directly useful for catching an `avatarUrl: undefined` vs key-absent drift (SF-3 INV-4), and for the `forwardVerified: undefined` defect.
- **chai issue #885** ("Ability to exclude property from `deepEqual`") — [github.com/chaijs/chai/issues/885](https://github.com/chaijs/chai/issues/885) — confirms mainstream deep-equal libs have **no built-in field exclusion**; the accepted practice is normalize-then-compare. This validates the "strip `avatarUrl` before compare unless stable" approach over a bespoke recursive comparator.

**Existing in-repo (`@openzeppelin/adapter-runtime-utils`) — extension surface:** `src/index.ts` re-exports `guardRuntimeCapability`, `withRuntimeCapability`, `registerRuntimeCapabilityCleanup`, `createRuntimeFromFactories`, `createLazyRuntimeCapabilityFactories`. `src/runtime-capability.ts` holds the **guard Proxy** that throws `RuntimeDisposedError` on any method apply / property read after `dispose()` (lines 197–213). Tests use `vitest`; `src/__tests__/partial-adapter.test.ts` already exercises partial-capability stubs — the closest existing kin to a seeded-defect stub. Package deps are minimal: `@openzeppelin/ui-types` (peer + dev), `@types/node`, `typescript`, `vitest`. **No dependency on any concrete adapter** — this is the property the harness must preserve.

---

## Cross-Ecosystem Implementations

### The canonical pattern — Reactive Streams TCK

[reactive-streams-jvm/tck @ `a625d3a`](https://github.com/reactive-streams/reactive-streams-jvm/tree/a625d3aba756e9842ad1291a5b73f5db280b6168/tck) is the reference design for "a parameterized suite that any implementation runs to prove contract compliance." Four load-bearing ideas transfer directly:

1. **Parameterize over a factory, not an instance.** The implementer extends a base verification class and overrides `createPublisher(long elements)` / `createFailedPublisher()`. The suite calls the factory to get a **fresh** instance per test. → For SF-4: the harness takes a **`makeCapability()` factory** (fresh instance per case) plus a **controlled substrate** (the caller supplies the capability wired over a *mocked/pinned* backend). You cannot assert INV-12 determinism against live mainnet — "stable underlying state" is a property the *fixture* guarantees, exactly as `createPublisher(elements)` lets the TCK pin the element stream. `createFailedPublisher()` is the direct analog of our **expected-failure fixtures** (a client that yields `NAME_NOT_FOUND`, times out, etc.).

2. **Rule-numbered test naming ties every failure to a spec rule.** Convention `TYPE_spec###_DESC`, where `TYPE ∈ {required, optional, stochastic, untested}` and `###` is the rule number. → SF-4 test/report keys should be **invariant-numbered**: `inv6_forwardVerified_concreteBoolean`, `inv8_<code>_neverThrows`, `inv12_reverseCore_deepEqual`, `inv16_label_userSafe`. This is what makes the SC-004 "per-invariant failure message" requirement fall out for free.

3. **Required vs optional = MUST vs SHOULD/MAY, and optional tests self-skip.** `required_` covers MUST rules; `optional_` covers MAY/SHOULD or tests needing extra config (`@Additional(implement = "createFailedPublisher")`). → SF-4: `resolveName`/`resolveAddress` are **structurally optional** — skip (not fail) their families when absent. The **avatar determinism** assertion is *optional*, gated on a `stableAvatarSurface` declaration (the SF-3 carry-in). Skips must be reported as `SKIPPED`, never silently dropped.

4. **The TCK tests itself.** The RS project ships `tck-tests` that feed *deliberately non-conforming* Publishers/Subscribers to the verifications and assert the verifications **fail them** — the TCK's own regression guard against false passes. → This *is* SC-004: our **seeded-defect set** is the same meta-test pattern (see § Seeded-Defect Harness).

Other TCK confirmations of the same shape: the **Java SE / Jakarta CDI TCK** ([azul.com TCK overview](https://www.azul.com/blog/use-tck-testing-to-ensure-that-your-java-distribution-conforms-to-the-java-se-specification/), [JBoss CDI TCK ch.7](https://docs.jboss.org/cdi/tck/reference/2.0.0.Alpha4/en-US/html/executing.html)) — binary "pass ALL tests to be compliant," no partial pass. That all-or-nothing posture is right for a fund-safety gate.

### Tooling Decision Matrix

Axes scored: **adapter-agnosticism** (zero concrete-adapter deps), **meta-testability** (can the SC-004 seeded-defect test introspect results programmatically), **runner coupling**, **ergonomics for other adapter repos**, **runtime footprint**.

**Axis A — Parameterization / suite shape**

| Candidate | Adapter-agnostic | Meta-testable | Runner coupling | Ergonomics | Verdict |
|-----------|:---:|:---:|:---:|:---:|---------|
| **Pure checker → `ConformanceReport`, thin vitest binding** ⭐ | ✅ ui-types only | ✅ report is a value; assert on it directly | ✅ core is runner-free; binding is swappable | ✅ `runConformance(makeCap, fixtures)` returns data or drives `it()` | **Recommended** |
| vitest `describe.each` over factory (RS-TCK-literal) | ✅ | ⚠️ must capture runner pass/fail to prove SC-004 | ❌ hard-wired to vitest | ✅ familiar | Fallback |
| Snapshot testing (`toMatchSnapshot`) | ✅ | ❌ snapshots aren't per-invariant verdicts | ❌ | ⚠️ brittle across adapters | Reject |
| Automated mutation testing only (Stryker) as the suite | ✅ | n/a (different tool) | n/a | ❌ not a shipable gate other repos run | Reject as *primary* |

**Fallback if the preferred option is unavailable:** if a pure checker proves awkward to wire (e.g. async fixture lifecycles), fall back to `describe.for` over the factory with a `vi`-captured result collector — same invariants, more runner coupling.

**Axis B — Deep-equal engine (INV-12)**

| Candidate | Strict (`undefined`≠absent) | Field-exclusion story | Zero-dep | Verdict |
|-----------|:---:|:---:|:---:|---------|
| **`dequal` + normalize-before-compare** ⭐ | ⚠️ treats `undefined`≡absent → *normalize first* | ✅ strip `avatarUrl` in a pre-pass | ✅ ~350B | **Recommended** |
| vitest `expect().toStrictEqual` | ✅ built-in strict | ⚠️ exclusion via pre-normalize only | ✅ (test-time) | Strong for the vitest binding layer |
| `assert.deepStrictEqual` (node) | ✅ | ⚠️ pre-normalize | ✅ built-in | Viable, ties core to node `assert` |
| `fast-equals` `createCustomEqual` | ✅ configurable | ✅ comparator can skip a key mid-walk | ❌ dep | Over-powered; reject |

Recommendation nuance: run a **normalize pre-pass** (strip `avatarUrl` unless `stableAvatarSurface`), then `dequal` for the report core; the vitest binding may additionally use `toStrictEqual` for a richer diff on failure.

**Axis C — `label` user-safety check (INV-16)**

| Candidate | False-negative risk (misses a bad label) | False-positive risk (rejects legit) | Dep weight | Verdict |
|-----------|:---:|:---:|:---:|---------|
| **Anchored allowlist regex + explicit denylist (defense-in-depth)** ⭐ | Low | Low (tunable) | zero | **Recommended** |
| Pure denylist (`no ://`, `no 0x…`) | Medium (novel bad shapes slip) | Very low | zero | Weak alone |
| Pure allowlist (char-class only) | Low | Medium (SF-5 labels may fail) | zero | Good but brittle to future labels |
| Sanitizer lib (validator.js) | Low | Medium | ❌ dep | Reject (overkill) |

**Axis D — Seeded-defect harness (SC-004)**

| Candidate | Deterministic | Targets the 4 named defect classes | CI cost | Verdict |
|-----------|:---:|:---:|:---:|---------|
| **Hand-written defect stubs (negative fixtures) + meta-assert suite fails each** ⭐ | ✅ | ✅ one stub per class, plus the compliant EVM adapter | ✅ cheap | **Recommended** |
| Automated mutation testing (Stryker-JS) on the EVM adapter | ⚠️ mutant set drifts | ⚠️ mutants ≠ the 4 named classes | ❌ slow | Optional post-core hardening |
| Property-based generation of bad results | ❌ nondeterministic | ⚠️ | ⚠️ | Reject for the gate |

Stryker-JS ([github.com/stryker-mutator/stryker-js @ `be04600`](https://github.com/stryker-mutator/stryker-js/tree/be0460088a9af7c4c43442c38b52fdf94e99703c)) is the JS mutation-testing reference — cite it as the *rationale* (SC-004's "100% detection" is a mutation score of 100% on a hand-curated mutant set), but the **shipable gate** is the deterministic hand-seeded set, mirroring the RS TCK's own `tck-tests`.

### Distribution & Adoption Story

The harness is a **shared test-suite package entry**, consumed by *other* adapter repos' test suites (`adapter-solana`, `adapter-midnight`, …) — the spec's explicit "reusable gate." Distribution decisions:

- **Home:** `@openzeppelin/adapter-runtime-utils` (settled in spec Assumptions — it already houses `runtime-capability.ts`/`runtime-factories.ts` and the guard Proxy the never-throw/lifecycle checks lean on). Add a **conformance subpath export** (e.g. `@openzeppelin/adapter-runtime-utils/conformance`) so pulling the suite doesn't drag test-only concerns into the runtime entry.
- **`vitest` as a `peerDependency`** of the harness (it's already a dev-dep) — the *pure checker* core needs no runner; only the thin binding imports `describe/it/expect`, so a consumer on a different runner can call the checker and adapt it. Keep the checker core importable without `vitest`.
- **Zero concrete-adapter deps.** The parameterized suite + seeded-defect stubs live in `adapter-runtime-utils` and need only `@openzeppelin/ui-types`. The **compliant-adapter run** (pointing the suite at the real EVM adapter) lives in **`adapter-evm-core`'s** own test suite, which dev-deps `adapter-runtime-utils`. This keeps the harness truly adapter-agnostic and avoids a dependency cycle.
- **Semver:** adding a new invariant to the suite is a **breaking** change for downstream adapters (previously-passing adapters may now fail) — treat suite-tightening as a major bump, and expose invariant families behind named opt-in/opt-out flags so an adapter can adopt incrementally (mirrors RS TCK required/optional).

---

## Ecosystem Needs

- **UIKit (primary consumer):** SF-4 makes UIKit **SC-004** (no silent coercion of unresolved names) and **SC-006** (graceful degradation) *enforceable against a real adapter* rather than aspirational. UIKit's own SF-1 invariants doc explicitly routes INV-6/8/12/16 enforcement here.
- **Other OpenZeppelin adapters:** `adapter-solana` (SNS), `adapter-midnight`, future `.sui`/Aptos — each will run this suite to certify their `NameResolutionCapability` before the UIKit consumes them. The suite must not assume ENS/EVM specifics (no `.eth`, no viem, no `0x`-EVM-address assumptions beyond what the *fixtures* supply).
- **Adapter authors' inner loop:** like the RS TCK, the suite doubles as a **spec-by-example** — reading the seeded-defect stubs teaches an author exactly what "compliant" means. Name tests by invariant so a red test points straight at the violated obligation.

---

## Gap Analysis

- **No off-the-shelf TS capability-TCK exists** — this is genuinely new in the TS/adapter ecosystem; the design must be lifted from JVM TCK conventions, not copied from an npm package.
- **"Deep-equal under cache TTL" is undefined until this repo defines it.** Nobody ships this semantic; it is SF-4's to invent (see Key Design Considerations #1).
- **The `label` allowlist is undefined** — UIKit deferred it to this repo (UIKit Open Question line 517). SF-4 owns it.
- **Determinism is only assertable over a controlled substrate.** A naive "call twice, deep-equal" against a live client is a flaky test, not a conformance check. The gap is *fixture design*: the harness must demand a pinned/mocked backend from the caller (the `createPublisher(elements)` lesson).
- **The sanctioned-throw boundary is subtle** (carry-in): `RuntimeDisposedError` is the *only* allowed throw (guard Proxy, `runtime-capability.ts:199,208`). INV-8 concerns **expected failure paths** (the 7-code union) — use-after-dispose is a *lifecycle* error, not an expected failure. And SF-1's mapper depth-caps its cause-walk at **32**, so a `RuntimeDisposedError` buried >32 deep in a native cause chain folds to a **returned** `ADAPTER_ERROR` (not a throw). The harness must therefore classify **throw vs return**: an actual *thrown* non-`RuntimeDisposedError` on an expected-failure input is the only INV-8 violation; a returned `ADAPTER_ERROR` (even one that "was" a deep disposed error) is compliant.

---

## Existing Codebase Analysis (Extension Mode)

- **Current architecture (`packages/adapter-runtime-utils/src/`):** `runtime-capability.ts` (guard Proxy + lifecycle: dispose ordering, pending-promise rejection, `RuntimeDisposedError` on post-dispose access), `runtime-factories.ts`, `profile-runtime.ts`, `index.ts` (barrel). Tests co-located in `src/__tests__/` on `vitest`; `partial-adapter.test.ts` already builds partial-capability stubs — the pattern the seeded-defect stubs extend.
- **Integration points:** new files only — e.g. `src/conformance/{index.ts, checker.ts, deep-equal.ts, label-allowlist.ts, fixtures.ts, vitest-binding.ts}` and `src/conformance/__tests__/seeded-defects.test.ts`. Add a `./conformance` subpath to `package.json#exports`. **No modification** to `runtime-capability.ts` — the harness *consumes* the guard's `RuntimeDisposedError` behavior, doesn't change it.
- **Existing invariants that must not break:** the guard Proxy's disposal semantics; the minimal dependency footprint (ui-types only); `sideEffects: false`. The conformance subpath must not import any concrete adapter, or it breaks adapter-agnosticism *and* risks a dependency cycle.
- **Compatibility:** purely additive. Existing `runtime-*` exports untouched; non-EVM adapters unaffected (SC-006).

---

## Recommendation

- **Verdict: BUILD.** In `@openzeppelin/adapter-runtime-utils`, as a runner-agnostic **pure checker** returning a structured `ConformanceReport`, plus a thin `vitest` binding and a deterministic **seeded-defect** meta-suite that proves SC-004.

- **Recommended approach:** Follow the Reactive Streams TCK shape adapted to TS. The public entry accepts a **capability factory + a controlled fixture set**, runs four invariant families, and returns per-invariant verdicts (`PASS | FAIL | SKIPPED` + message keyed by invariant id). Feature-detect `resolveName`/`resolveAddress` and **skip** absent families. Determinism is checked only over the caller-supplied pinned substrate. Ship the suite dependency-light (ui-types only; vitest as peer); run the compliant EVM adapter through it from `adapter-evm-core`'s tests; keep the seeded-defect stubs in-package as the SC-004 regression guard.

  Sketch (signatures only):
  ```ts
  export interface ConformanceConfig {
    makeCapability(): NameResolutionCapability;      // fresh instance per case (RS-TCK createPublisher)
    forwardVectors?: ForwardVector[];                // {input, expect: ok-value | error-code} over a pinned backend
    reverseVectors?: ReverseVector[];
    expectedFailureVectors: FailureVector[];         // drives INV-8 (RS-TCK createFailedPublisher)
    stableAvatarSurface?: boolean;                   // gates avatarUrl in the INV-12 compare (SF-3 carry-in)
    labelPolicy?: LabelPolicy;                       // override the default allowlist if an ecosystem needs it
  }
  export interface InvariantResult {
    invariant: 'INV-6' | 'INV-8' | 'INV-12' | 'INV-16';
    key: string;                                     // e.g. 'inv8_RESOLUTION_TIMEOUT_neverThrows'
    status: 'PASS' | 'FAIL' | 'SKIPPED';
    message: string;                                 // per-invariant, human-readable on FAIL
  }
  export type ConformanceReport = { results: InvariantResult[]; passed: boolean };
  export function checkConformance(cfg: ConformanceConfig): Promise<ConformanceReport>;   // pure core
  export function describeConformance(name: string, cfg: ConformanceConfig): void;        // vitest binding
  ```

- **Key design considerations (for Design stage):**
  1. **Deep-equal-under-cache-TTL semantics (this repo defines it).** Proposal: two calls with identical input over a stable substrate must be **structurally equal** on the **reverse/forward core** — `{address, name, forwardVerified, provenance}` for reverse; `{name, address, provenance}` for forward — compared with `dequal` after a normalize pre-pass. **`avatarUrl` is compared only when `stableAvatarSurface === true`** (SF-3 INV-13 caveat: `avatarUrl` derives from a broader, possibly-flapping surface and is failure-isolated to `undefined`; asserting it unconditionally would make a compliant memoizing-vs-re-querying adapter flaky). Object *identity* is explicitly **not** required — a memoizer returning the same reference and a re-querier returning a fresh-but-equal object both pass. This is the precise "TTL-agnostic" definition the spec asks for.
  2. **`label` allowlist (this repo defines it).** Defense-in-depth, mirroring SF-1's classifier (`instanceof`-primary + needle-fallback): (a) **allowlist** — must match `/^[A-Za-z][A-Za-z0-9 ]{0,63}$/` (anchored start-with-letter rejects `0x…` and bare digits; char-class rejects `:`/`/` so URLs fail; length-bounded), **and** (b) **denylist** belt-and-braces — reject if it contains `://`, matches `/0x[0-9a-fA-F]{4,}/`, contains `@`, contains control chars, or is empty. The three canonical labels (`'ENS'`, `'ENS via external gateway'`, `'SNS'`) pass; all four SC-004 label defects fail. Expose `labelPolicy` so an ecosystem can supply its own allowlist without forking the harness.
  3. **Throw-vs-return classification for INV-8.** The checker must `try/catch` each expected-failure vector and distinguish: *returned* `{ok:false}` with a union code = PASS; *thrown* `RuntimeDisposedError` = out-of-scope (lifecycle, not expected-failure) — do not run expected-failure vectors on a disposed capability; *thrown anything else* = INV-8 FAIL. A returned `ADAPTER_ERROR` is always compliant (incl. the depth-32 folded-disposed case).
  4. **Parameterize over a factory + controlled substrate, never a live instance.** Fresh instance per case; determinism/expected-failure vectors driven by pinned/mocked backends the caller supplies. This is the single biggest correctness lever — it's what separates a conformance check from a flaky integration test.
  5. **Meta-test the harness (SC-004).** Ship ≥5 stubs: one compliant reference + one per defect class (throws-on-expected-failure, `forwardVerified: undefined`, non-user-safe `label`, non-deterministic). Assert `checkConformance` returns `passed: true` for the reference and `passed: false` with the *correct invariant key* for each defect — 100% detection, per-invariant message.

- **Risks:**
  - **False pass = fund-safety hole** (spec stakes rationale). The seeded-defect meta-suite is the mitigation, but it only covers *known* defect shapes; a novel non-compliance could slip. Mitigate with the belt-and-braces denylist and (post-core) optional Stryker mutation runs.
  - **Over-tight `label` allowlist rejects legitimate future labels** (e.g. SF-5's `'ENS via CCIP-Read'` has a hyphen the default regex rejects). See Open Questions — needs an SF-5 label vetting pass or a slightly widened char-class.
  - **Determinism check depends on the caller supplying a truly stable substrate** — if an adapter author points it at a live client, it flakes and erodes trust in the gate. Documentation + a fixture helper must make the pinned-substrate path the path of least resistance.
  - **Runner-agnostic core adds a small indirection** vs. writing raw `describe.each`. Judged worth it because SC-004's meta-test needs to introspect results as data.

---

## Out of Scope

- **The type shape itself** — `NameResolutionCapability`, value types, and the error union live in `@openzeppelin/ui-types` (UIKit SF-1) and are consumed, never modified.
- **UIKit-side display invariants** — suppress-to-hex rendering of unverified/mismatched names is the UIKit SF-4 display layer's job (spec Edge Cases); SF-4-adapters enforces the *signal* (`forwardVerified` boolean, ADDRESS_NOT_FOUND on mismatch), not the render policy.
- **ENS v2 / `EnsProvenance` conformance** — SF-5 is additive; if the harness needs v2-specific label vetting or provenance-narrowing checks, that's an SF-5 extension of this suite, flagged not built here.
- **Automated mutation testing (Stryker) as the shipping gate** — cited as rationale; deferred to optional post-core hardening.
- **Live-network / testnet-fork integration testing** — the harness is substrate-agnostic and expects mocked/pinned backends; end-to-end fork tests belong to each adapter's own integration suite.
- **Non-`NameResolutionCapability` capabilities** — the harness is scoped to name-resolution; generalizing the pattern to other Tier-2 capabilities is a separate initiative.

## Dev Notes

- This is TEST INFRASTRUCTURE: the viem-first directive does **not** apply. The harness depends only on `@openzeppelin/ui-types`; it must never import viem or any concrete adapter.
- Cross-repo: the harness is the enforcement mechanism UIKit's SF-1 invariants doc (lines 497/507) explicitly delegated to this repo. Keep the invariant ids aligned with UIKit's (INV-6/8/12/16) so a red test is traceable across repos.
- SF-3 Approach A (suppress-on-mismatch) means the reverse path never surfaces a forward-mismatched name; the harness's INV-6 family asserts `forwardVerified` is a concrete boolean (constant-`true` on any returned name), and mismatch is exercised as an **ADDRESS_NOT_FOUND expected-failure** vector, not a `forwardVerified:false` success.

## Open Questions

1. **Runner coupling — confirm the pure-checker split.** Recommendation is a runner-agnostic `checkConformance` core + thin vitest binding, chosen so the SC-004 meta-test can assert on results as data. Design should confirm vs. a simpler `describe.for`-only harness. *(Owner: Design.)*
2. **`label` allowlist width vs. SF-5.** The default `/^[A-Za-z][A-Za-z0-9 ]{0,63}$/` rejects hyphenated labels like `'ENS via CCIP-Read'`. Do we (a) widen to allow internal single hyphens (`/^[A-Za-z][A-Za-z0-9 ]*(?:-[A-Za-z0-9 ]+)*$/`, still blocking `://` and `0x`), or (b) require SF-5 to choose hyphen-free labels? Needs an SF-5 label vet. *(Owner: Design + SF-5.)*
3. **Fixture/substrate contract.** What shape does the caller supply for a "pinned backend"? Options: a fully-constructed capability over a mocked viem client (EVM-specific, lives in `adapter-evm-core` tests) vs. an abstract `ResolutionResult`-returning stub (ecosystem-agnostic, lives in the harness). Likely both: abstract stubs for the seeded-defect meta-suite, real-client-over-mock for the compliant EVM run. *(Owner: Design.)*
4. **Should INV-12 also assert cross-call `provenance` object-shape stability under a network switch is impossible?** The capability binds network at factory time (no `setNetwork`), so determinism is single-network by construction — confirm the harness need not probe network-switch determinism. *(Owner: Design/Invariants.)*
5. **Lifecycle probe as an optional family.** Should the harness *optionally* assert the sanctioned throw (post-dispose call → `RuntimeDisposedError`) as a separate optional family, distinct from INV-8? It's real behavior the guard Proxy provides, but it's lifecycle, not name-resolution contract. *(Owner: Invariants.)*
