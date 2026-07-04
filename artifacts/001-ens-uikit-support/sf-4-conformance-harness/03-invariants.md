---
stage: invariants
project: ens-uikit-support
repo: openzeppelin-adapters
sub_feature: SF-4
mode: extension
extends: packages/adapter-runtime-utils
status: draft
timestamp: 2026-07-04
author: aleksandr.pasevin
previous_stage: artifacts/001-ens-uikit-support/sf-4-conformance-harness/02-design.md
tags: [conformance, tck, name-resolution, adapter, test-infrastructure, invariants, deep-equal, allowlist, seeded-defect, cross-repo]
---

# SF-4: Adapter Conformance Test Harness — Invariants

## Summary

The subject-under-test for these invariants is **the harness itself**, not the adapters it
grades. SF-4 is a fund-safety gate whose own correctness must be provable: a false pass lets a
broken adapter ship, a false fail or a propagated exception erodes trust in the gate. The
invariants therefore fall into two intertwined obligations: (1) **fidelity** — the harness
correctly classifies adapter behavior against UIKit **INV-6 / INV-8 / INV-12 / INV-16** and
returns per-invariant verdicts as data; and (2) **hygiene** — the harness is a pure, runner-free,
zero-concrete-adapter-dep, side-effect-free function that never throws for adapter misbehavior,
never mutates its inputs, does bounded deterministic work, and proves its own detection power
against a seeded-defect meta-suite (SC-004). The three Design Open Questions are resolved here:
the **optional lifecycle-throw family** is admitted as INV-26 (opt-in, isolated, *not* one of the
required four); **network-switch determinism** is confirmed a non-obligation (INV-13); and the
**INV-8 declared-code-mismatch** granularity is pinned (in-union-but-wrong code → PASS-with-note,
out-of-union code → FAIL; INV-8). Two design gaps were closed locally (INV-6/INV-9 — total
exception containment across *all* vectors, and vector-expectation fidelity); both are flagged in
Dev Notes.

**Invariant-id namespace note.** These `INV-N` are **SF-4's own** invariant numbers (the harness's
contract). They are distinct from the **UIKit INV-6/8/12/16** the harness *enforces*. Throughout,
a bare `INV-N` is SF-4's; the four UIKit obligations are always written `UIKit INV-6/8/12/16`. This
mirrors the spec's cross-repo `SF-N` disambiguation convention.

---

## Request/Response Contract

The harness's "request" is a `ConformanceConfig`; its "response" is a `ConformanceReport` value.
These invariants pin the shape and totality of that response and the two value-contract families
(UIKit INV-6, UIKit INV-16) that inspect a returned resolution value.

### INV-1: ConformanceReport shape and `passed` semantics

**Category:** Request/Response

**Statement:** `checkConformance` resolves to a `ConformanceReport = { results: readonly InvariantResult[]; passed: boolean }` where `passed === results.every(r => r.status !== 'FAIL')`. A `SKIPPED` result **never** contributes to failure; `passed` is `true` for a report whose results are all `PASS`/`SKIPPED` (including the empty-applicable-families case, e.g. a capability with neither `resolveName` nor `resolveAddress`). Every `InvariantResult` carries a non-empty `invariant ∈ {INV-6,INV-8,INV-12,INV-16}` (or the optional lifecycle id per INV-26), a `status ∈ {PASS,FAIL,SKIPPED}`, a stable `key`, and a human-readable `message`.

**Applies to:** `checkConformance`, the `ConformanceReport`/`InvariantResult` types.

**Enforcement mechanism:**
- Type system: `readonly` discriminated result records; `CheckStatus` union closed to the three states.
- Runtime guard: `passed` is *computed* from `results` at assembly time (never set independently), so it can never disagree with the result set.
- Test: seeded-defects meta-suite asserts `passed` tracks the presence/absence of `FAIL` across the compliant reference and each defect stub.

**Violation scenario:** `passed` is tracked as a separate mutable flag and a late `FAIL` push forgets to clear it → a broken adapter reports `passed: true`. Fund-safety hole.

**Severity:** Critical

### INV-2: Total, exactly-once case coverage — SKIPPED is emitted, never dropped

**Category:** Request/Response

**Statement:** For every applicable (invariant-family × case) pair, the report contains **exactly one** `InvariantResult`. A family whose method is absent (feature-detect miss) or whose precondition does not hold contributes `SKIPPED` results (with a reason `message`) — it is never silently omitted. No case is dropped, deduplicated away, or short-circuited out of the report.

**Applies to:** `checkConformance`, all `checks/*` family functions, the feature-detect logic.

**Enforcement mechanism:**
- Type system: each `checks/*` function returns `InvariantResult[]`; the checker concatenates all of them.
- Runtime guard: feature-detection (`typeof cap.resolveName === 'function'` / `resolveAddress`) chooses PASS/FAIL-vs-SKIPPED, never chooses "emit nothing."
- Test: a forward-only stub (no `resolveAddress`) yields SKIPPED for the reverse family **and** UIKit INV-6; a no-method stub yields all-SKIPPED with `passed: true`.

**Violation scenario:** An absent `resolveAddress` causes the reverse family to be skipped by early-`return` with no result appended → the report silently omits UIKit INV-6, and a consumer reads "no INV-6 failure" as "INV-6 satisfied." A dropped case is indistinguishable from a passing case.

**Severity:** Critical

### INV-3: Invariant-numbered, unique, stable report keys

**Category:** Request/Response

**Statement:** Every `InvariantResult.key` begins with the family tag matching its `invariant` (`inv6_…`, `inv8_…`, `inv12_…`, `inv16_…`) and is **unique within a report**. Keys are a pure function of `(family, direction, vector label, expected code)` — deterministic and stable across runs given the same config. The per-family key shapes are fixed: `inv6_<vectorLabel>_forwardVerifiedConcreteBoolean`, `inv8_<direction>_<expectedCode>_neverThrows`, `inv12_<direction>_<vectorLabel>_deterministic`, `inv16_<direction>_<vectorLabel>_labelUserSafe`.

**Applies to:** all `checks/*`, the key-derivation helper, `describeConformance` (keys become `it()` names).

**Enforcement mechanism:**
- Runtime guard: vector `label` defaults to a sanitized `input` (INV-24); the checker derives keys, adding a disambiguating suffix if two vectors sanitize to the same slug (uniqueness preserved).
- Test: two forward vectors with colliding sanitized inputs produce distinct keys; a red key traces to exactly one (invariant, case).

**Violation scenario:** Two vectors produce the same key → one `it()` overwrites the other in the vitest projection (INV-19), or a report reader cannot tell which case failed. SC-004's "per-invariant message" requirement is undermined.

**Severity:** High

### INV-4: UIKit INV-6 fidelity — `forwardVerified` is a concrete boolean

**Category:** Request/Response

**Statement:** For every `reverseVector` with `expect.ok === true` for which `resolveAddress` returns `{ok:true}`, the harness FAILs iff `typeof value.forwardVerified !== 'boolean'` (missing key, `undefined`, or any non-boolean → FAIL); a concrete `true` **or** `false` → PASS. The harness asserts **only concrete-boolean** — it does **not** re-assert SF-3's "constant-`true`" property (that is the adapter's own contract, out of the harness's scope; see Dev Notes). This family is SKIPPED when `resolveAddress` is absent.

**Applies to:** `checks/forward-verified.ts` (UIKit INV-6).

**Enforcement mechanism:**
- Runtime guard: `typeof … === 'boolean'` on the returned value's `forwardVerified`.
- Test: a `forwardVerified: undefined` stub FAILs UIKit INV-6 with key `inv6_<label>_forwardVerifiedConcreteBoolean`; a `forwardVerified: false` stub PASSes (concrete boolean).

**Violation scenario:** The check uses truthiness (`if (value.forwardVerified)`) instead of `typeof` → `forwardVerified: false` is misread as "missing" and FAILs a compliant adapter (false fail), or `undefined` is coerced and a real defect PASSes (false pass, SC-003 hole).

**Severity:** Critical

### INV-5: UIKit INV-16 fidelity — `provenance.label` is user-safe

**Category:** Request/Response

**Statement:** For every vector (forward or reverse) with `expect.ok === true` for which the method returns `{ok:true}`, the harness runs `isUserSafeLabel(value.provenance.label, config.labelPolicy ?? DEFAULT_LABEL_POLICY)`; a `safe:false` verdict → FAIL with a `message` naming the tripped rule (allow-mismatch, over-length, or the denylist rule `name`). `DEFAULT_LABEL_POLICY` is defense-in-depth: an anchored allowlist `/^[A-Za-z][A-Za-z0-9 ]*(?:[-'][A-Za-z0-9 ]+)*$/`, a `maxLength` of 64 checked separately, and a denylist (`://`, `/0x[0-9a-fA-F]{4,}/`, `@`, ASCII control chars `/[\x00-\x1F\x7F]/`, empty/whitespace-only). The **locked corpus**: PASS = `'ENS'`, `'ENS via external gateway'`, `'SNS'`, `'ENS via CCIP-Read'`; FAIL = `'https://internal-gateway.oz.internal/ccip/...'`, `'0xabcdef…'`, `'gw@resolver:node-7'`, `''`.

**Applies to:** `checks/label-user-safe.ts`, `label-policy.ts` (`isUserSafeLabel`, `DEFAULT_LABEL_POLICY`) (UIKit INV-16).

**Enforcement mechanism:**
- Runtime guard: allowlist `.test()` **and** length check **and** every denylist predicate; `isUserSafeLabel` returns `{safe, reason?}` so the FAIL message can name the rule.
- Test: `label-policy.test.ts` locks the corpus above; all four SC-004 label-defect classes FAIL, all four canonical/SF-5 labels PASS.

**Violation scenario:** The regex is not anchored (`^…$`) → `'good https://evil'` matches a prefix and PASSes; a URL label slips the gate and the UIKit renders an attacker-controlled string as a trusted name.

**Severity:** Critical

### INV-6: Vector-expectation fidelity (local strengthening — see Dev Notes)

**Category:** Request/Response

**Statement:** A vector's declared `expect` is itself part of the contract the fixture asserts. (a) A vector declared `expect.ok === true` whose method returns `{ok:false}` (an *unexpected* typed failure, no throw) is a **FAIL** keyed `inv_expect_<direction>_<label>_expectedSuccessGotFailure`, and the dependent value-checks (UIKit INV-6/INV-16) for that case are recorded `SKIPPED` ("no value to inspect — see expectation FAIL"), never silently passed. (b) A vector declared `expect.ok === false` whose method returns `{ok:true}` is an **INV-8 FAIL** (an expected-failure path silently "succeeded"; see INV-8). Neither direction is ever a silent PASS.

**Applies to:** the checker's per-vector dispatch across `checks/forward-verified.ts`, `checks/label-user-safe.ts`, `checks/never-throws.ts`.

**Enforcement mechanism:**
- Runtime guard: before running a value-check, assert the returned discriminant matches the declared `expect.ok`; on mismatch, record the expectation FAIL/SKIPPED pair.
- Test: a stub that returns `{ok:false, code:'ADDRESS_NOT_FOUND'}` for a declared-`ok:true` reverse vector FAILs the expectation and SKIPs UIKit INV-6/INV-16 for that case — no false pass.

**Violation scenario:** The design's per-family text guards UIKit INV-6/INV-16 behind "on `{ok:true}`" only; without an explicit expectation check, a declared-success vector that returns `{ok:false}` makes the value-checks *not applicable* and slips through with no result → a broken adapter that fails every success case reports `passed: true`.

**Severity:** High

### INV-7: Caller inputs are immutable; the default policy is frozen

**Category:** Request/Response

**Statement:** The harness never mutates the caller-supplied `config`, `forwardVectors`, `reverseVectors`, or `labelPolicy`. `DEFAULT_LABEL_POLICY` is a frozen module constant (pure data + pure predicates); an override enters only via `config.labelPolicy` and is read, never written. The harness holds no retained state between runs.

**Applies to:** `checkConformance`, `label-policy.ts`, all `checks/*`.

**Enforcement mechanism:**
- Type system: all input types are `readonly`; `DEFAULT_LABEL_POLICY` is `Object.freeze`d (deep-frozen incl. the `deny` array).
- Test: run `checkConformance` twice with the same frozen config object; both runs succeed and the config is referentially unchanged; a mutation attempt on `DEFAULT_LABEL_POLICY` throws in strict mode.

**Violation scenario:** The checker sorts `config.forwardVectors` in place → a second run over the same array sees reordered vectors, and a caller reusing the config across suites gets surprising cross-suite coupling.

**Severity:** Medium

---

## Error Semantics

The load-bearing family. The harness's whole value is turning adapter misbehavior into *data*,
never an exception — while reserving exactly one throw for genuine caller programmer-error.

### INV-8: UIKit INV-8 fidelity — never-throw taxonomy (the decision table)

**Category:** Error Semantics

**Statement:** For every vector, the harness invokes the method inside `try/catch` and `await`s it, then classifies against this **total** table (a "throw" for an async method means the returned promise rejects; sync-throw and rejection are treated identically per INV-9):

| Observed on an **expected-failure** (`expect.ok:false`) vector | Verdict |
|---|---|
| Returns `{ok:false}`, `code ∈` closed 7-code union, `code === expect.code` | **PASS** |
| Returns `{ok:false}`, `code ∈` closed union, `code !== expect.code` | **PASS** + note ("declared X, adapter returned Y — code precision is SC-002, not INV-8"; resolves Design Open Q3) |
| Returns `{ok:false}` with `code ∉` closed union (or `code` missing / not a string) | **FAIL** (fabricated code outside the typed contract) |
| Returns `{ok:true}` (expected failure silently succeeded) | **FAIL** (also INV-6) |
| Throws / rejects `RuntimeDisposedError` (per INV-11) | **SKIPPED** with note (lifecycle, not the name-resolution contract; cannot occur in a normal run — INV-17) |
| Throws / rejects anything else | **FAIL** (the INV-8 violation) |

The closed 7-code union is derived from `NameResolutionError['code']` (INV-24) so it can never drift from `@openzeppelin/ui-types`. A returned `ADAPTER_ERROR` — including the SF-1 depth-32 folded-disposed case — is a compliant *returned* code (PASS), never a violation.

**Applies to:** `checks/never-throws.ts` (UIKit INV-8).

**Enforcement mechanism:**
- Runtime guard: `try { const r = await m(input); classify(r) } catch (e) { isRuntimeDisposed(e) ? SKIPPED : FAIL }`; closed-union membership tested against the derived code set.
- Test: seeded stubs for each row — throws-on-`NAME_NOT_FOUND` → FAIL; returns-`{ok:true}`-on-failure-vector → FAIL; returns fabricated `'WEIRD_CODE'` → FAIL; returns `ADDRESS_NOT_FOUND` for a declared `NAME_NOT_FOUND` → PASS+note.

**Violation scenario:** The checker only `try/catch`es but doesn't check union membership → an adapter returning `code: 'lol'` PASSes never-throw, and the "typed error surface" guarantee (SC-002) is silently void.

**Severity:** Critical

### INV-9: Total exception containment (local strengthening — see Dev Notes)

**Category:** Error Semantics

**Statement:** **No** capability invocation anywhere in the harness — across all four required families and both success- and failure-expectation vectors — may propagate a throw or promise-rejection out of `checkConformance`. Every `makeCapability()`, `isValidName`, `resolveName`, and `resolveAddress` call is wrapped so that a thrown/rejected non-`RuntimeDisposedError` becomes a `FAIL` result and a `RuntimeDisposedError` becomes `SKIPPED`. A throw on a declared-**success** vector is a never-throw FAIL (attributed to the INV-8 family), and the dependent value-checks (UIKit INV-6/INV-16) and the INV-12 determinism check for that case are recorded `SKIPPED` ("not evaluable — call threw; see INV-8"), never crashed and never double-counted as independent FAILs.

**Applies to:** `checkConformance`, every `checks/*` invocation site.

**Enforcement mechanism:**
- Runtime guard: a single internal `invoke()` wrapper that all families route through, returning a `{threw, disposed, result}` union rather than propagating.
- Test: a stub whose `resolveAddress` throws on a declared-`ok:true` vector produces an INV-8 FAIL + SKIPPED INV-6/INV-16/INV-12 for that case, and `checkConformance` **resolves** (does not reject).

**Violation scenario:** UIKit INV-6's check calls `resolveAddress` without a `try/catch` (the design specifies containment only for the `ok:false` set); a success-vector throw propagates and `checkConformance` **rejects** — adapter misbehavior becomes a harness crash, aborting the whole report and violating "misbehavior is data."

**Severity:** Critical

### INV-10: `ConformanceConfigError` is the sole throw, validated up front

**Category:** Error Semantics

**Statement:** The **only** exception `checkConformance` may throw is `ConformanceConfigError` (`code = 'CONFORMANCE_CONFIG'`), reserved exclusively for caller programmer-error in `config` itself: `makeCapability` not a function; a vector `input`/`label` not a string; `labelPolicy.allow` not a `RegExp`; `labelPolicy.maxLength` not a finite number; `deny` not an array of `{name, test}`. Config validation runs **before any capability call**, so a config error can never be misreported as an adapter FAIL, and adapter misbehavior can never be misreported as a config error.

**Applies to:** `checkConformance` (entry validation), `types.ts` (`ConformanceConfigError`).

**Enforcement mechanism:**
- Runtime guard: an up-front `validateConfig(config)` gate that throws `ConformanceConfigError` and returns before the first `makeCapability()`.
- Test: a config with `makeCapability: null` throws `ConformanceConfigError` synchronously (before any case runs); a well-formed config over a throwing adapter never throws (INV-9).

**Violation scenario:** Config validation is interleaved with case execution → a bad `labelPolicy.allow` surfaces as an INV-16 "FAIL" mid-run, misattributing a harness-invocation bug to the adapter.

**Severity:** High

### INV-11: Single canonical `RuntimeDisposedError` detection predicate

**Category:** Error Semantics

**Statement:** There is exactly one predicate `isRuntimeDisposedError(e): boolean`, used by **both** INV-8 (to route a caught throw to SKIPPED) and the optional lifecycle family INV-26 (to *require* it). Detection is `e instanceof RuntimeDisposedError` (the class is exported from this same package — `runtime-capability.ts`) **with a `e?.name === 'RuntimeDisposedError'` fallback** for cross-realm robustness (mirrors the SF-2/SF-3 `instanceof BaseError` + name-gate pattern). The predicate is total (never throws on a non-object `e`) and is the single source of truth — no ad-hoc `instanceof` scattered across families.

**Applies to:** `checks/never-throws.ts`, the optional `checks/lifecycle.ts` (INV-26), a shared internal helper.

**Enforcement mechanism:**
- Runtime guard: `e instanceof RuntimeDisposedError || (typeof e === 'object' && e !== null && (e as {name?:unknown}).name === 'RuntimeDisposedError')`.
- Test: a same-realm `RuntimeDisposedError`, a cross-realm structural clone (`{name:'RuntimeDisposedError'}`), and a plain `Error` are classified correctly; `null`/`undefined`/`42` return `false` without throwing.

**Violation scenario:** INV-8 uses bare `instanceof` and a cross-realm disposed error (different bundle copy) fails the `instanceof` → it is misclassified as a non-sanctioned throw and **FAILs a compliant adapter** (false fail on the lifecycle boundary).

**Severity:** High

### INV-12: No opaque leak / no re-throw of adapter errors

**Category:** Error Semantics

**Statement:** When the harness catches an adapter throw it classified as a FAIL, it **never** re-throws or propagates the original error object; it records a diagnostic string — `String(err)` plus `err?.constructor?.name` — into the FAIL `message`. The harness never surfaces a generic `Error`, never wraps an adapter error in its own thrown exception, and never lets an adapter-controlled object escape the report boundary.

**Applies to:** `checks/never-throws.ts`, `checkConformance`.

**Enforcement mechanism:**
- Runtime guard: the catch arm builds a string message; the caught `err` is not stored in the returned structure.
- Test: a stub throwing a custom `class BoomError` yields a FAIL whose `message` contains `'BoomError'` and `String(err)`, and `checkConformance` resolves with that error object nowhere in the returned report.

**Violation scenario:** The FAIL result stores the raw `err` → a live native `Error` with an unstable stack (or an adapter object holding a client handle) leaks into the report, coupling downstream consumers to adapter internals.

**Severity:** Medium

---

## Idempotency & Retry

Reframed for a pure library: "retry" is "call `checkConformance` again." The harness that *checks*
determinism (UIKit INV-12) must itself be deterministic, and its determinism engine is
conformance-critical (a comparator bug is a false gate).

### INV-13: UIKit INV-12 fidelity — the determinism engine (+ network-switch non-obligation)

**Category:** Idempotency & Retry

**Statement:** For every vector (both `ok:true` and `ok:false` expectations), the harness calls the method **twice on the same fresh instance**, runs `normalizeResolutionResult` on each result, then `structuralEqual`; structurally-equal → PASS, else FAIL with a shallow diff hint. **Object identity is never required** — a memoizer returning the same reference and a re-querier returning a fresh-but-equal object both PASS. The normalize pre-pass: (1) recursively drops keys whose value is `undefined` so `{avatarUrl: undefined}` ≡ `{}` (SF-3 INV-4); (2) on `{ok:true}`, drops `avatarUrl` from the value unless `config.stableAvatarSurface === true` (SF-3 INV-13 carry-in); (3) on `{ok:false}`, drops `error.cause` (INV-21) while retaining `code` and every typed payload field. **Network-switch determinism is a confirmed NON-obligation** (resolves Design Open Q2 / Research Open Q4): the capability binds network at factory time (no `setNetwork` on the interface), so INV-12 is single-network by construction — the harness neither switches networks nor probes cross-network determinism; a future runtime-network-switch capability would be a new family, out of scope here.

**Applies to:** `checks/determinism.ts`, `deep-equal.ts` (UIKit INV-12).

**Enforcement mechanism:**
- Runtime guard: two awaited calls on one instance → normalize → `structuralEqual`.
- Test: a `Date.now()`-in-provenance stub FAILs INV-12; a memoizing stub and a re-querying stub both PASS; an `{avatarUrl: undefined}`-vs-`{}` pair PASSes; a flapping-`avatarUrl` adapter PASSes with `stableAvatarSurface:false` and FAILs with `stableAvatarSurface:true`.

**Violation scenario:** normalize drops `avatarUrl` unconditionally → a genuine avatar-determinism defect is invisible even when the caller declared the surface stable; or normalize is non-recursive → a nested `undefined` in `provenance` makes a compliant memoizer flake (false fail).

**Severity:** Critical

### INV-14: `normalizeResolutionResult` correctness

**Category:** Idempotency & Retry

**Statement:** `normalizeResolutionResult(result, {includeAvatar})` is a pure canonicalizer: (a) it recursively removes every own-enumerable key whose value is `undefined`, at every depth, so explicit-`undefined` and absent-key produce identical output; (b) on `{ok:true}` it removes `value.avatarUrl` entirely when `includeAvatar === false`; (c) on `{ok:false}` it removes `error.cause`; (d) it preserves the `ok` discriminant and all other typed fields (`code`, `name`, `address`, `networkId`, `elapsedMs`, `detail`, `message`, `reason`, `forwardVerified`, `provenance`, `scopedToNetworkId`, …) verbatim; (e) it does not mutate its input (returns a new structure). `includeAvatar` follows `config.stableAvatarSurface`.

**Applies to:** `deep-equal.ts` (`normalizeResolutionResult`), unit-tested in `deep-equal.test.ts`.

**Enforcement mechanism:**
- Runtime guard: recursive clone that skips `undefined`-valued keys; explicit key deletes for `avatarUrl`/`cause` per the discriminant.
- Test: `deep-equal.test.ts` asserts the undefined-drop is recursive, the discriminant is preserved, `cause` is dropped only on `{ok:false}`, `avatarUrl` is dropped per `includeAvatar`, and the input object is untouched.

**Violation scenario:** the undefined-drop is shallow → `{provenance:{external:undefined}}` and `{provenance:{}}` normalize differently, and a compliant adapter that omits vs explicitly-undefines an optional provenance field FAILs INV-12 (false fail).

**Severity:** Critical

### INV-15: `structuralEqual` correctness and termination

**Category:** Idempotency & Retry

**Statement:** `structuralEqual(a, b)` is a hand-rolled, zero-third-party-dep comparator that is reflexive and symmetric, and: (a) compares primitives with `Object.is` semantics (strings, numbers incl. `NaN`, booleans, `null`); `undefined` never reaches it post-normalize; (b) arrays: equal length **and** elementwise-recursively-equal; (c) plain objects: identical **own-enumerable key sets** (order-insensitive) **and** per-key recursive equality; (d) a type mismatch (array-vs-object, differing `typeof`) → `false`; (e) any non-plain object encountered (Date/Map/Set/RegExp/typed array — documented as not occurring in the normalized ui-types value core) falls back to `===` identity, a conservative choice that surfaces as an INV-12 FAIL rather than a silent false pass; (f) it **terminates** — recursion is bounded by the finite, acyclic, plain-JSON-ish normalized structure (no cycles occur in ui-types resolution values).

**Applies to:** `deep-equal.ts` (`structuralEqual`), unit-tested in `deep-equal.test.ts`.

**Enforcement mechanism:**
- Runtime guard: the ~30-line comparator; key-set equality via length + membership, not positional.
- Test: `deep-equal.test.ts` covers primitive equality/inequality, `NaN === NaN` (via `Object.is`), key-order insensitivity (`{a:1,b:2}` ≡ `{b:2,a:1}`), extra/missing key detection, array length mismatch, nested recursion, and the non-plain-object identity fallback.

**Violation scenario:** the comparator checks `Object.keys(a).length === Object.keys(b).length` but not that the *same* keys are present → `{a:1,b:2}` compares equal to `{a:1,c:2}`, and a determinism defect that swaps a key slips through (false pass in the gate itself).

**Severity:** Critical

### INV-16: Harness self-determinism — `checkConformance` is a pure function

**Category:** Idempotency & Retry

**Statement:** Given the same `config` and a capability whose observable behavior is identical, two invocations of `checkConformance` return structurally-equal reports (same results, same order, same statuses, same keys). The harness introduces **no ambient nondeterminism**: no `Date.now()`, `Math.random()`, wall-clock, environment reads, or global mutable state anywhere in the pure core. Result ordering is fixed: families in a stable order, vectors in caller-supplied order, directions forward-then-reverse.

**Applies to:** `checkConformance`, `checker.ts`, all `checks/*`.

**Enforcement mechanism:**
- Runtime guard: the core imports no clock/RNG/env; ordering is derived from the input arrays, not from iteration over an unordered map.
- Test: run `checkConformance` twice over a fixed deterministic stub; assert the two reports are `structuralEqual` (dog-fooding the comparator).

**Violation scenario:** the checker stamps a `timestamp: Date.now()` into a result message → two runs differ, the SC-004 meta-suite's own snapshot/equality assertions flake, and the gate that polices determinism is itself non-deterministic.

**Severity:** High

### INV-17: Fresh-instance isolation; required families never see a disposed instance

**Category:** Idempotency & Retry

**Statement:** The harness calls `config.makeCapability()` to obtain a **fresh** instance per case and never reuses an instance across cases (no cross-case state leakage). The two INV-12 calls are the only intra-case reuse (same instance, by design). The harness **never** calls `dispose()` on any instance used by the four required families — so `RuntimeDisposedError` cannot arise on a required-family call (making the INV-8 SKIPPED-on-disposed branch a defensive dead path in a normal run), and the optional lifecycle probe (INV-26) operates only on its own dedicated instances.

**Applies to:** `checkConformance`, State Ownership model.

**Enforcement mechanism:**
- Runtime guard: `makeCapability()` invoked per case; no `dispose()` call site in `checker.ts`/`checks/*` (except the isolated INV-26 module).
- Test: a `makeCapability` spy asserts one construction per case and zero `dispose` calls during a required-only run; a stub that would throw `RuntimeDisposedError` if disposed never does.

**Violation scenario:** the harness constructs one instance and reuses it across all vectors → a stateful adapter (e.g. one that caches the first query) makes later vectors observe state from earlier ones, and INV-12 determinism is measured against a polluted instance (false pass or false fail).

**Severity:** High

---

## Auth Boundary

### Not applicable — recorded explicitly

SF-4 is a pure, headless test-infrastructure library. It has **no auth boundary**: no caller
identity, no credentials, no privileged operations, no cross-tenant data, no network of its own. It
consumes only a caller-supplied `makeCapability` factory over a caller-owned pinned substrate and
returns a value. There is nothing to authenticate or authorize. This mirrors the SF-1/SF-2/SF-3
finding that the name-resolution primitives are public reads with no auth surface; the harness
inherits none. **No Auth invariants are defined**, by design, not omission.

---

## Side-Effect Ordering & Observability

### INV-18: Pure core is side-effect-free; the report is the sole output surface

**Category:** Side-Effect Ordering & Observability

**Statement:** The pure core (`checker.ts`, `checks/*`, `deep-equal.ts`, `label-policy.ts`, `types.ts`, `index.ts`) performs **no** observable side effect other than calling the injected capability's methods: no `console`/logger, no metrics, no events, no filesystem, no network, no global mutation, no `process`/`env` access. The `ConformanceReport` value is the single observability surface — a red test in CI traces to the violated invariant purely through result data. `sideEffects: false` continues to hold for the package.

**Applies to:** the entire pure core; `package.json#sideEffects`.

**Enforcement mechanism:**
- Runtime guard: no side-effecting imports in the core; the binding's `vitest` import is quarantined to `vitest-binding.ts` (INV-23).
- Test: run `checkConformance` with `console` methods spied → zero calls; tree-shake / import-graph check that the core pulls in only `@openzeppelin/ui-types`.

**Violation scenario:** a family logs `console.error(message)` on FAIL → the core couples to a host runtime, breaks runner-agnosticism, and pollutes CI output for a data-only gate.

**Severity:** High

### INV-19: `describeConformance` is a faithful, order-preserving projection

**Category:** Side-Effect Ordering & Observability

**Statement:** `describeConformance(config)` runs `checkConformance` **once** at collection time (awaited at top level), captures the report, then emits **exactly one** vitest test per `InvariantResult`, in report order: `PASS` → `it(key, () => {})`; `FAIL` → `it(key, () => expect.fail(message))`; `SKIPPED` → `it.skip(key)`. It never merges, drops, or reorders results, and it does not itself classify adapter behavior (that is `checkConformance`'s job). The only exception it propagates is `ConformanceConfigError` (a caller programmer-error that should fail collection loudly, per INV-10); adapter misbehavior always arrives as data and becomes a red/ skipped `it()`, never a collection-time crash.

**Applies to:** `vitest-binding.ts` (the only core-adjacent file importing `vitest`).

**Enforcement mechanism:**
- Runtime guard: a single `for (const r of report.results)` loop with a status switch; `await`ed report before any `it()`.
- Test: a mixed report (PASS/FAIL/SKIPPED) yields the exact same count and order of `it`/`it.skip` calls (vitest `it` spy); a `ConformanceConfigError` from a bad config surfaces at collection.

**Violation scenario:** the binding filters out `SKIPPED` results → the test output hides which families were skipped, and a forward-only adapter looks fully certified when the reverse family (and UIKit INV-6) never ran.

**Severity:** High

---

## Resource Limits & Rate

### INV-20: Bounded, deterministic work; no retries, no unbounded loops

**Category:** Resource Limits & Rate

**Statement:** A `checkConformance` run performs a **fixed, finite** number of capability calls, a pure function of the vector counts: INV-8 → 1 call per vector (both directions, over the never-throw path); INV-12 → 2 calls per vector; UIKit INV-6/INV-16 reuse the INV-12/expectation results where possible, adding no unbounded work. The harness performs **no** retries, **no** polling, **no** backoff, and **no** timeout of its own (a slow or hanging substrate is the caller's fixture responsibility — the harness `await`s honestly). `structuralEqual` recursion is bounded by the finite acyclic normalized structure (INV-15). There is no in-memory queue, connection pool, or lock — the harness is a stateless traversal.

**Applies to:** `checkConformance`, `checks/*`, `deep-equal.ts`.

**Enforcement mechanism:**
- Runtime guard: call counts derive from array lengths; no `while`/recursion over adapter-controlled data except the bounded `structuralEqual` walk.
- Test: a call-counting spy asserts exactly `expected(vectorCounts)` invocations; a stub with N vectors never triggers more than the derived call count.

**Violation scenario:** a "retry once on throw" convenience is added to the never-throw check → the call count doubles for failing adapters, INV-20's bound is void, and a deliberately-throwing stub is invoked twice, muddying the INV-8 classification.

**Severity:** Medium

---

## Sensitive Data Handling

### INV-21: `error.cause` is never narrowed, inspected, or compared

**Category:** Sensitive Data Handling

**Statement:** `error.cause` is `unknown`-typed diagnostic data that may hold a live native `Error` (unstable stack/fields) or arbitrary adapter-internal objects. The harness **never narrows or inspects** `cause`: it is dropped from the INV-12 determinism compare (INV-14) and is never surfaced in a report message, never structurally walked, never serialized. Only `code` and the typed payload fields participate in any harness logic. (This is the harness honoring the ui-types rule that chain-agnostic code MUST NOT narrow `cause`.)

**Applies to:** `deep-equal.ts` (normalize drop), `checks/*` (never read `cause`).

**Enforcement mechanism:**
- Runtime guard: normalize deletes `error.cause`; no code path reads `.cause`.
- Test: an adapter whose `error.cause` differs across the two INV-12 calls (e.g. a fresh native `Error` each time) still PASSes INV-12 (cause excluded); the report contains no `cause`-derived content.

**Violation scenario:** the diff hint in an INV-12 FAIL serializes the whole `error` including `cause` → a native `Error`'s stack (possibly containing file paths or an RPC URL) leaks into CI logs via the report message.

**Severity:** Medium

### INV-22: No adapter output is persisted or logged; the harness handles no secrets

**Category:** Sensitive Data Handling

**Statement:** The harness holds no secrets (no keys, no credentials — it is a pure grader over pinned fixtures) and persists/logs nothing. Any adapter-provided string that reaches a report `message` (a bad `label` in an INV-16 FAIL, `String(err)` in an INV-8 FAIL) lives **only** in the returned report value — it is not written to disk, not logged, not sent anywhere. The report is the caller's to handle; the harness closes every other channel.

**Applies to:** the entire pure core (reinforces INV-18/INV-12/INV-21).

**Enforcement mechanism:**
- Runtime guard: no I/O, logging, or persistence in the core (INV-18).
- Test: covered by INV-18's `console`-spy zero-call assertion and INV-12's "error object nowhere in the report" assertion.

**Severity:** Medium

---

## Performance, Scalability & Re-usability

### INV-23: Zero concrete-adapter deps; runner-free core; quarantined `vitest`

**Category:** Performance, Scalability & Re-usability

**Statement:** The harness depends **only** on `@openzeppelin/ui-types` (types) plus `vitest` as an **optional peer** used solely by the binding. It imports **no** concrete adapter (no `adapter-evm-core`, no `viem`) — the compliant EVM run lives in `adapter-evm-core`'s own tests, preserving zero-concrete-adapter-deps and avoiding a dependency cycle. Only `vitest-binding.ts` and the `__tests__/` files may import `vitest`; `checker.ts`, `checks/*`, `deep-equal.ts`, `label-policy.ts`, `types.ts`, `index.ts` are **runner-free** and importable by any consumer on any runner or in a plain CI gate script.

**Applies to:** `package.json` (deps/peer/exports), the whole module tree, the import boundary rule.

**Enforcement mechanism:**
- Type system / build: `./conformance` subpath export; `vitest` as `peerDependenciesMeta.optional`.
- Test: an import-graph assertion that the pure core's transitive imports are `@openzeppelin/ui-types`-only; a smoke test that imports `checkConformance` in a no-vitest context and runs it.

**Violation scenario:** a family imports `viem`'s `isAddress` for "convenience" → the harness gains a concrete-ecosystem dep, breaks adapter-agnosticism, and a non-EVM adapter repo pulling the suite drags in `viem`.

**Severity:** Critical

### INV-24: Full pluggability; no ecosystem-specific assumptions; policy override honored

**Category:** Performance, Scalability & Re-usability

**Statement:** Everything the harness varies per ecosystem enters through the DI seam: `makeCapability`, `forwardVectors`/`reverseVectors`, `stableAvatarSurface`, `labelPolicy`, `suiteName`. There is **no** global registration, singleton, or hardcoded ecosystem assumption — no `.eth`, no `0x`-EVM-address shape, no chain id, no viem type beyond what the caller's fixtures supply. Names/addresses are plain `string` (chain-agnostic). The closed error-code set is derived from `NameResolutionError['code']` so it tracks ui-types automatically. A caller-supplied `config.labelPolicy` fully overrides `DEFAULT_LABEL_POLICY` (no merge, no silent fallback to defaults for a provided policy).

**Applies to:** `types.ts`, `checker.ts`, `label-policy.ts`.

**Enforcement mechanism:**
- Type system: `NameResolutionErrorCode = NameResolutionError['code']`; config carries all variability.
- Test: the seeded-defect meta-suite uses abstract `ResolutionResult`-shaped stubs (no client, no `.eth`); a custom `labelPolicy` that rejects `'ENS'` makes the canonical label FAIL — proving the override is honored, not merged.

**Violation scenario:** a family hardcodes `if (!input.endsWith('.eth'))` → an `adapter-solana` (SNS) run mis-fails every vector, and the "reusable across adapter repos" promise is broken.

**Severity:** High

### INV-25: SC-004 self-verification — the seeded-defect meta-suite achieves 100% detection

**Category:** Performance, Scalability & Re-usability

**Statement:** The in-package meta-suite (`seeded-defects.test.ts`) proves the gate's own detection power: a **compliant reference stub** yields `report.passed === true` (all applicable results PASS/SKIPPED), and **one stub per defect class** yields `report.passed === false` with the **correct invariant key** FAILing — (a) throws-on-expected-failure → an INV-8 `inv8_…_neverThrows` FAIL; (b) `forwardVerified: undefined` → an INV-6 `inv6_…_forwardVerifiedConcreteBoolean` FAIL; (c) non-user-safe (URL) `label` → an INV-16 `inv16_…_labelUserSafe` FAIL; (d) non-deterministic (`Date.now()` in provenance) → an INV-12 `inv12_…_deterministic` FAIL. Detection rate on the seeded set is **100%** (no defect stub passes; the reference never fails). This is the harness's regression guard against false passes — the RS-TCK "the TCK tests itself" pattern.

**Applies to:** `__tests__/seeded-defects.test.ts`, and transitively every family it exercises.

**Enforcement mechanism:**
- Runtime guard: each meta-test asserts both `report.passed` **and** the specific FAILing key/invariant (not just "some failure").
- Test: the meta-suite is itself the test; CI failure of any assertion blocks the gate from shipping.

**Violation scenario:** a defect stub is added but its meta-assertion only checks `passed === false` (not the key) → a family mis-attributing a defect (e.g. an INV-12 defect FAILing under INV-16) passes the meta-test, and the "per-invariant message" guarantee (SC-004) silently rots.

**Severity:** Critical

### INV-26: (OPTIONAL FAMILY) Lifecycle sanctioned-throw — resolves Design Open Q1

**Category:** Performance, Scalability & Re-usability *(cross-cuts Error Semantics)*

**Statement:** This is an **opt-in, default-SKIPPED, isolated** family — explicitly **NOT** one of the four required families and never part of the required-run `passed` verdict unless the caller opts in. When enabled (e.g. `config.lifecycleProbe === true`) **and** `makeCapability()` produces an instance exposing a `dispose` method (a guard-wrapped `RuntimeCapability`), the harness: constructs a **dedicated** fresh instance (never one used by INV-6/8/12/16), calls `dispose()`, then invokes a resolution method and asserts the call throws/rejects `RuntimeDisposedError` (detected via INV-11) → PASS; throws something else, or does not throw → FAIL. When not enabled, or the instance exposes no `dispose`, the family is `SKIPPED` (with a reason). Because the probe runs only on its own disposed instance, INV-17's guarantee (required families never see a disposed instance) is preserved and `RuntimeDisposedError` stays off the INV-8 surface.

**Rationale (Open Q1 resolution):** admitting the family *completes the throw taxonomy* — INV-8 says "every non-`RuntimeDisposedError` throw is a violation" but never positively verifies the sole *sanctioned* throw actually fires post-dispose. Gating it opt-in and isolated closes that gap without compromising the design's purity (D-8: the required families never dispose). Code-Draft **may** implement it now or defer it to post-core hardening — either way the required-four gate is unaffected and the invariant is specified.

**Applies to:** an optional `checks/lifecycle.ts`, `checkConformance` (opt-in dispatch).

**Enforcement mechanism:**
- Runtime guard: opt-in flag + `typeof instance.dispose === 'function'` gate; dedicated instance; post-dispose call asserted to throw `RuntimeDisposedError` via INV-11.
- Test: a guard-wrapped compliant stub PASSes the lifecycle family when opted in; a stub that swallows post-dispose calls FAILs; an un-wrapped stub (no `dispose`) is SKIPPED; with the flag off, no lifecycle result appears and the four required families are byte-identical to a non-opted run.

**Violation scenario:** the probe reuses an INV-8 instance and disposes it mid-run → subsequent INV-8 vectors on that instance throw `RuntimeDisposedError`, and the never-throw family mis-SKIPs (or, if INV-11 is wrong, mis-FAILs) real cases — the exact contamination D-8 was designed to prevent.

**Severity:** Medium (opt-in; a defect here cannot affect the required-four verdict)

---

## Existing Invariants (Extension Mode)

### Preserved (must not break)

- **The guard Proxy's disposal semantics** (`runtime-capability.ts:~197–213`): post-`dispose()` access throws `RuntimeDisposedError`. The harness **consumes** this behavior (INV-11, INV-26) and **never modifies** `runtime-capability.ts`.
- **Minimal dependency footprint** (`@openzeppelin/ui-types` only): preserved and made an explicit invariant (INV-23).
- **`sideEffects: false`** for the package: preserved (INV-18) — all new modules are side-effect-free.
- **Existing `runtime-*` exports** (`guardRuntimeCapability`, `withRuntimeCapability`, `registerRuntimeCapabilityCleanup`, `createRuntimeFromFactories`, `createLazyRuntimeCapabilityFactories`): untouched; the `.` entry is unchanged.

### Modified

- **`package.json`** — the **only** modified file: add the `./conformance` subpath export and promote `vitest` from a bare dev-dep to an **optional peer + dev** dep (INV-23). Purely additive; no existing export changes.

### New

- All INV-1 … INV-26 are new, scoped to `src/conformance/`. No new third-party **runtime** dependency.

---

## Invariant Coverage Matrix

| Function / module | Invariants | Enforcement |
|---|---|---|
| `checkConformance()` (pure core) | INV-1, INV-2, INV-3, INV-6, INV-7, INV-9, INV-10, INV-16, INV-17, INV-20 | Req/Res + Err + Idem + Resource + Reuse |
| `checks/forward-verified.ts` (UIKit INV-6) | INV-4, INV-2, INV-6, INV-9 | Req/Res + containment |
| `checks/never-throws.ts` (UIKit INV-8) | INV-8, INV-9, INV-11, INV-12, INV-6 | Error Semantics |
| `checks/determinism.ts` (UIKit INV-12) | INV-13, INV-9, INV-16 | Idempotency |
| `checks/label-user-safe.ts` (UIKit INV-16) | INV-5, INV-2, INV-6, INV-9 | Req/Res |
| `deep-equal.ts` — `normalizeResolutionResult` | INV-14, INV-21, INV-7 | Idempotency + SensitiveData |
| `deep-equal.ts` — `structuralEqual` | INV-15 | Idempotency |
| `label-policy.ts` — `isUserSafeLabel` / `DEFAULT_LABEL_POLICY` | INV-5, INV-7, INV-24 | Req/Res + Reuse |
| `vitest-binding.ts` — `describeConformance` | INV-19, INV-10, INV-18, INV-23 | Observability + Reuse |
| `__tests__/seeded-defects.test.ts` (SC-004) | INV-25, INV-1, INV-8, INV-4, INV-5, INV-13 | Self-verification |
| `__tests__/deep-equal.test.ts` | INV-14, INV-15 | Comparator unit proof |
| `__tests__/label-policy.test.ts` | INV-5, INV-24 | Corpus lock |
| `checks/lifecycle.ts` (OPTIONAL, INV-26) | INV-26, INV-11, INV-17 | Opt-in lifecycle |
| package (`package.json`, module boundary) | INV-23, INV-18, INV-24 | Deps + side-effects + pluggability |

No empty rows. Auth Boundary is recorded `n/a` (pure library — see that section).

## Out of Scope

- **Auth invariants** — no auth boundary exists in a pure test-infra library (documented in the Auth section).
- **The four UIKit obligations as SF-4's *own* code invariants** — UIKit INV-6/8/12/16 are the adapter's contract; SF-4 invariants are about *faithfully enforcing* them, not re-deriving them. Their in-adapter correctness (e.g. `forwardVerified` constant-`true`) is SF-3's, not the harness's.
- **SC-002 exact-per-code correctness** — INV-8 asserts never-throw + returns `{ok:false}` + `code ∈` closed union; a returned in-union-but-wrong code is a PASS-with-note (Open Q3), not an INV-8 FAIL. Precise per-code correctness is each adapter's own suite's job.
- **The compliant EVM run** — lives in `adapter-evm-core`'s tests (INV-23 dep-cycle avoidance); not defined here.
- **ENS v2 / `EnsProvenance`-specific conformance** — SF-5 additive; the widened allowlist already accommodates SF-5 labels, but no v2-specific narrowing family is defined here.
- **Automated mutation testing (Stryker)** — the shippable gate is the deterministic seeded set (INV-25); mutation testing is optional post-core hardening.
- **Harness-imposed timeouts / cancellation** — a hanging substrate is the caller's fixture concern (INV-20); the harness adds no timeout of its own.
- **Network-switch determinism** — a confirmed non-obligation (INV-13); network binds at factory time.

## Dev Notes

- **Two design gaps closed locally at Invariants (both flagged, neither a step-back):**
  1. **Total exception containment (INV-9).** The design (`02-design.md` INV-8 section) specifies `try/catch` only for the `expect.ok:false` set, while UIKit INV-6/INV-12/INV-16 call the method on `ok:true` vectors. Without containment on those calls, a throw on a *success* vector would propagate out of `checkConformance`, converting adapter misbehavior into a harness rejection — a direct violation of the core "misbehavior is data" contract (`02-design.md` Error Handling). INV-9 widens containment to **every** capability call and classifies a success-vector throw as a never-throw FAIL. *This strengthens without restructuring; Code-Draft should route all calls through one `invoke()` wrapper.*
  2. **Vector-expectation fidelity (INV-6).** The design guards the value-checks behind "on `{ok:true}`", leaving a hole: a declared-`ok:true` vector that returns `{ok:false}` (no throw) makes UIKit INV-6/INV-16 not-applicable and could slip as a non-result. INV-6 makes the expectation itself checkable (FAIL + dependent SKIPPED). *If the Orchestrator/dev prefers the narrower design behavior (only assert on realized `{ok:true}`), INV-6 can be softened to a note-only signal — flagged for confirmation.*
- **Three Design Open Questions resolved:** Q1 → INV-26 (optional, opt-in, isolated lifecycle family; **admitted**, not dropped, because it completes the throw taxonomy while preserving D-8 purity). Q2 → INV-13 (network-switch determinism is a confirmed **non-obligation**). Q3 → INV-8 table (in-union-but-wrong code = **PASS-with-note**; out-of-union code = **FAIL**).
- **`RuntimeDisposedError` detection (INV-11)** is deliberately a single shared predicate with a cross-realm name fallback, symmetric with the `instanceof BaseError` + name-gate pattern SF-2/SF-3 adopted — so the harness is robust to a duplicated-bundle `RuntimeDisposedError` class.
- **The comparator/​normalizer (INV-14/INV-15) are conformance-critical** and get their own unit-test file precisely because a bug there is a false pass/fail in the gate itself (design D-2 must-do (b)).
- **No drift raised to any upstream stage.** No edit to delivered SF-1/SF-2/SF-3/SF-5 code, no SF-1 mapper change, no spec-body edit. The two local strengthenings patch the *design* forward-consistently and are recorded above for the Orchestrator.

## Open Questions

1. **INV-6 severity of vector-expectation mismatch.** Confirm a declared-`ok:true`-returns-`{ok:false}` case should FAIL (current INV-6 stance) rather than being treated as a fixture-authoring issue surfaced as a note. Affects Code-Draft's classification. *(Owner: Code Draft / dev confirm.)*
2. **INV-26 implement-now vs defer.** The optional lifecycle family is specified; Code-Draft decides whether to ship it in the first cut or defer to post-core hardening. Either choice leaves the required-four gate identical. *(Owner: Code Draft.)*
3. **INV-8 mismatch-note surfacing.** Open Q3 is resolved as PASS-with-note in the `message` (no new `CheckStatus`). If the dev later wants the code-precision mismatch as a machine-filterable signal (not just prose), that is an additive report-schema change deferred to a future SF-5 extension. *(Owner: dev, if/when SC-002 tooling wants it.)*
