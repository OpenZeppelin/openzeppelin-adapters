---
stage: tests
project: ens-uikit-support
repo: openzeppelin-adapters
sub_feature: SF-4
mode: extension
extends: packages/adapter-runtime-utils
status: draft
timestamp: 2026-07-04
author: aleksandr.pasevin
previous_stage: artifacts/001-ens-uikit-support/sf-4-conformance-harness/04-code-draft.md
tags: [conformance, tck, name-resolution, adapter, test-infrastructure, invariant-driven, deep-equal, allowlist, seeded-defect, cross-repo]
---

# SF-4: Adapter Conformance Test Harness — Test Suite

## Summary

Invariant-driven verification of the conformance harness **itself** (the subject-under-test) against
SF-4's 26 invariants. The Code stage shipped an in-package seeded-defect meta-suite (63 conformance
tests / 5 skipped across 4 files); this stage adds **7 new test files** (+1 test-only helper) that close
the coverage gaps that suite left open — the required-four value/error/idempotency families exercised
end-to-end, the harness-hygiene invariants (fresh-instance/no-dispose, bounded call count, side-effect
freedom, zero-adapter-dep import graph) proven with instrumentation, the full `ConformanceConfigError`
validation table, the `isRuntimeDisposedError` predicate incl. cross-realm, the belt-and-braces denylist
rules in isolation, and SC-004 detection tightened to prove each single-defect stub FAILs *exactly* its
own invariant. One invariant (INV-19 fine-grained runner spy) is partially blocked by an in-process ESM
limitation — the projection is proven end-to-end, and the residual is documented with a Recommended
step-back. Zero concrete-adapter deps; the compliant-EVM run remains out of scope (lives in
`adapter-evm-core`). All green against the real `@openzeppelin/ui-types@3.1.1` dev:local link:
`tsc --noEmit` clean, ESLint `--max-warnings 0` clean, `vitest run` = **11 conformance files, 172
passed / 5 skipped** (109 net-new passing tests; full package 14 files / 186 passed / 5 skipped, zero
regressions).

## Test Plan

New tests this stage (the delta over the Code-stage meta-suite). Every test names its INV-N; each
maps to a verification technique from the service-tests overlay. "UIKit INV-N" = the adapter contract
the harness enforces; bare `INV-N` = SF-4's own invariant.

| Test file · group | INV-N | Technique | What it verifies |
|---|---|---|---|
| `contract-coverage` · report shape | INV-1 | Route/entry-point | Every result has a valid `invariant`/`status`, non-empty `key`+`message`; `passed` is *exactly* `results.every(status≠FAIL)`; a SKIPPED-only report still passes |
| `contract-coverage` · exactly-once | INV-2 | Route/entry-point | A compliant fwd+rev run emits exactly 9 results (the correct per-vector family set), keys enumerated; an absent-method failure vector SKIPs INV-8+INV-12 rather than dropping them |
| `contract-coverage` · keys | INV-3 | Boundary | Every key is prefixed with its family tag; two vectors sharing a `label` collide and the deduper appends `_2` (uniqueness preserved) |
| `contract-coverage` · forwardVerified | INV-4 | Boundary | `typeof`-not-truthiness: `false`→PASS, `true`→PASS; `undefined`/`'true'`/`1`/`null`→FAIL; end-to-end `forwardVerified:false` reverse adapter PASSes UIKit INV-6 |
| `contract-coverage` · expectation (fwd) | INV-6 | Failure | Declared `ok:true` forward returning `{ok:false}` → EXPECT FAIL + INV-16/INV-12 SKIPPED, no INV-6; EXPECT key shape asserted |
| `error-semantics` · decision table | INV-8 | Fault injection | `classifyExpectedFailure` over every row: in-union==declared→PASS, in-union≠declared→PASS+SC-002 note, missing/non-string/out-of-union code→FAIL, `{ok:true}`→FAIL; thrown `RuntimeDisposedError`→SKIPPED |
| `error-semantics` · containment | INV-9 | Fault injection | Throw on the 2nd (determinism) call → INV-12 FAIL (not double-counted as INV-8); `makeCapability()` throw contained → INV-8 FAIL, resolves; forward-success throw → INV-8 FAIL + INV-16/INV-12 SKIPPED, no INV-6 |
| `error-semantics` · config validation | INV-10 | Fault injection | 20-row malformed-config table each → `ConformanceConfigError`; validation runs *before* any `makeCapability()` (spy: 0 calls); thrown error carries `code:'CONFORMANCE_CONFIG'`; well-formed config over a throwing adapter never throws |
| `error-semantics` · disposed predicate | INV-11 | Fault injection | `isRuntimeDisposedError`: same-realm instance, cross-realm `{name:'RuntimeDisposedError'}`, name-patched Error → true; plain/Type Error, bare string → false; total on null/undefined/42; the checker uses it (cross-realm disposed throw → INV-8 SKIPPED) |
| `error-semantics` · no leak | INV-12 | Sensitive-data leak | `describeError` yields `<ctor>: <String>` for a custom class and `typeof` for primitives; a custom-class throw surfaces the class name as a *string* and the raw error object never enters the report |
| `determinism` · identity vs equality | INV-13 | Replay | Memoizer (same ref) PASSes; re-querier (fresh-but-equal) PASSes; flapping `avatarUrl` PASSes by default, FAILs under `stableAvatarSurface`; determinism graded on failure vectors too (flapping `detail`→FAIL) |
| `determinism` · normalize | INV-14 | Replay | Normalize preserves the `ok` discriminant and typed fields (incl. concrete `false`), so a differing `code` stays observable |
| `determinism` · comparator | INV-15 | Boundary | `structuralEqual` is reflexive and symmetric over equal/unequal pairs; recurses arrays nested in objects |
| `determinism` · self-determinism | INV-16 | Replay | All forward-family results precede all reverse-family results, in caller order; two runs are `structuralEqual` (dog-foods the comparator) |
| `determinism` · cause-blind | INV-21 | Sensitive-data leak | Fresh native `error.cause` each call still PASSes INV-12; no cause content appears in the report |
| `purity-pluggability` · isolation | INV-17 | Sequence/quota | Spy factory: exactly `1 probe + 1 per case` constructions and **zero** dispose calls on a required-only run |
| `purity-pluggability` · side effects | INV-18 | Sensitive-data leak | `console.{log,info,warn,error,debug}` spied → zero calls across a passing AND a failing run |
| `purity-pluggability` · bounded work | INV-20 | Quota/boundary | Exactly two calls per vector per direction; a throwing vector is called exactly twice (the throw triggers no retry) |
| `purity-pluggability` · import graph | INV-23 | Portability | Static source scan: every core file imports only `@openzeppelin/ui-types` (no runner, no adapter); only `vitest-binding.ts` imports vitest |
| `purity-pluggability` · pluggability | INV-24 | Portability | Grades non-EVM inputs/labels with no `.eth`/`0x` assumption; the closed code set is exactly the 7 ui-types codes and rejects fabrications |
| `binding-projection` · projection | INV-19 | Route/entry-point | End-to-end: a compliant + lifecycle-probe config projects PASS/SKIP as real `it`/`it.skip` (collection-time); `ConformanceConfigError` propagates at collection |
| `label-policy-rules` · denylist | INV-5 | Fault injection | Each shipped denylist rule fires with its named reason under a permissive allow (`contains-url-scheme`/`-hex-run`/`-at-sign`/`-control-char`/`empty-or-whitespace`); allowlist-primary ordering observable (URL→`allow-mismatch`; over-length→`over-length`) |
| `label-policy-rules` · immutability | INV-7 | Fault injection | Reassigning a scalar field and mutating the frozen `deny` array both THROW in strict mode (beyond `Object.isFrozen`) |
| `lifecycle-and-detection` · INV-26 | INV-26 | Fault injection | `dispose()` itself throwing → FAIL; post-dispose non-`RuntimeDisposedError` throw → FAIL; construction failure isolated to INV-26; opting in leaves the four required families **byte-identical** (INV-17 isolation) |
| `lifecycle-and-detection` · SC-004 | INV-25 | Fault injection | Each of the four single-defect stubs FAILs **exactly** its own invariant (no collateral mis-attribution); the compliant reference FAILs nothing |

## Coverage Matrix

All 26 SF-4 invariants covered. "New" = this stage's files; "Code" = the Code-stage suite
(`seeded-defects` / `deep-equal` / `label-policy` / `binding`) which remains part of the green run.

| Invariant | Happy | Boundary | Failure | Additional | Source |
|-----------|-------|----------|---------|------------|--------|
| INV-1 (report shape; `passed` computed) | ✓ | | | ✓ (SKIP-only passes) | New `contract-coverage` + Code |
| INV-2 (total, exactly-once coverage) | ✓ | | | ✓ (absent-method SKIP) | New `contract-coverage` + Code |
| INV-3 (unique, invariant-numbered keys) | ✓ | ✓ (label collision→`_2`) | | ✓ (prefix match) | New `contract-coverage` + Code |
| INV-4 (UIKit INV-6 concrete boolean) | ✓ | ✓ (false/1/'true'/null) | ✓ (undefined) | ✓ (e2e false→PASS) | New `contract-coverage` + Code |
| INV-5 (UIKit INV-16 user-safe label) | ✓ | ✓ (over-length) | ✓ (each deny rule) | ✓ (allowlist-primary) | New `label-policy-rules` + Code |
| INV-6 (vector-expectation fidelity) | | | ✓ (fwd + rev EXPECT) | ✓ (dependents SKIP) | New `contract-coverage` + Code |
| INV-7 (inputs immutable; policy frozen) | | | ✓ (mutation THROWS) | ✓ (deny-array frozen) | New `label-policy-rules` + Code |
| INV-8 (UIKit INV-8 never-throw table) | ✓ | ✓ (all table rows) | ✓ (fabricated/throw) | ✓ (disposed→SKIP) | New `error-semantics` + Code |
| INV-9 (total exception containment) | | | ✓ (2nd-call/ctor/fwd) | ✓ (resolves, no dbl-count) | New `error-semantics` + Code |
| INV-10 (sole throw = config error) | ✓ (throwing adapter ok) | ✓ (20-row table) | ✓ | ✓ (before-any-call; code) | New `error-semantics` |
| INV-11 (single disposed predicate) | ✓ | ✓ (cross-realm) | | ✓ (total; checker uses it) | New `error-semantics` |
| INV-12 (no opaque leak / no re-throw) | | | ✓ (custom class) | ✓ (raw obj absent) | New `error-semantics` + Code |
| INV-13 (UIKit INV-12 determinism) | ✓ (memoize+re-query) | ✓ (avatar surface) | ✓ (flap detail) | ✓ (failure vectors) | New `determinism` + Code |
| INV-14 (`normalizeResolutionResult`) | ✓ | | | ✓ (discriminant kept) | New `determinism` + Code `deep-equal` |
| INV-15 (`structuralEqual`) | ✓ | ✓ (reflexive/symmetric) | | ✓ (nested arrays) | New `determinism` + Code `deep-equal` |
| INV-16 (harness self-determinism) | ✓ | | | ✓ (ordering + cross-run) | New `determinism` + Code |
| INV-17 (fresh instance; no dispose) | ✓ | | | ✓ (spy: ctor#, 0 dispose) | New `purity-pluggability` |
| INV-18 (side-effect-free core) | ✓ | | | ✓ (console spy, 0 calls) | New `purity-pluggability` |
| INV-19 (faithful binding projection) | ✓ (e2e PASS/SKIP) | | ✓ (config error) | ⚠ fine spy — see OOS | New `binding-projection` + Code `binding` |
| INV-20 (bounded work; no retries) | ✓ | ✓ (exact call count) | ✓ (throw = 2, no retry) | | New `purity-pluggability` |
| INV-21 (`error.cause` never inspected) | ✓ | | | ✓ (no cause in report) | New `determinism` + Code `deep-equal` |
| INV-22 (no persist/log; no secrets) | | | | ✓ (via INV-18 + INV-12) | New `purity-pluggability` + Code |
| INV-23 (zero-adapter-dep; quarantine) | ✓ | | | ✓ (import-graph scan) | New `purity-pluggability` |
| INV-24 (full pluggability; override) | ✓ (non-EVM) | | ✓ (override honored) | ✓ (closed code set) | New `purity-pluggability` + Code |
| INV-25 (SC-004 100% detection) | ✓ (reference clean) | | ✓ (each defect) | ✓ (exactly-own-invariant) | New `lifecycle-and-detection` + Code |
| INV-26 (OPTIONAL lifecycle throw) | ✓ (opt-in PASS) | | ✓ (3 fail branches) | ✓ (byte-identical isolation) | New `lifecycle-and-detection` + Code |

No empty invariant rows. Auth Boundary: n/a (pure test-infra library — recorded `n/a` in the
invariants doc; nothing to authenticate).

## Test Notes

- **Files (all under `packages/adapter-runtime-utils/src/conformance/__tests__/`):**
  `contract-coverage.test.ts`, `error-semantics.test.ts`, `determinism.test.ts`,
  `purity-pluggability.test.ts`, `binding-projection.test.ts`, `lifecycle-and-detection.test.ts`,
  `label-policy-rules.test.ts`, plus the test-only helper `harness-fixtures.ts`. **No source file
  was modified** — the harness is exercised as shipped.
- **`harness-fixtures.ts` (test-only helper).** Adds instrumentation the Code-stage `fixtures.ts`
  did not need: a `spyOnFactory` that counts constructions/disposes/resolution calls (INV-17/20), a
  memoizing reverse stub and a flapping-`avatarUrl` stub (INV-13), a throw-on-second-call stub
  (INV-9), flapping `detail`/`cause` stubs (INV-13/21), and a `RuntimeDisposedError` thrower
  (INV-8/11). Kept separate from `fixtures.ts` so the Code-stage substrate stays byte-for-byte as
  shipped (clean stage attribution). It builds only on the abstract `makeStub` — zero concrete-adapter
  deps (INV-23). `spyOnFactory` reassigns the plain stub's own methods, so it is documented to accept
  only NON-guarded bases (a guard Proxy would reject the reassignment).
- **Type-level enforcement.** The four `InvariantId` families and the closed 7-code union are pinned
  at compile time (`satisfies` + two-way `extends` in `never-throws.ts`); `readonly` input types make
  the immutability contract partly type-enforced. Runtime tests still verify behavior (INV-4/7/8/24)
  because an adapter feeds untyped data through the DI seam.
- **Deliberate boundary casts.** Feeding *adversarial* non-boolean / malformed values that an honest
  adapter's types forbid requires single-step casts at the injection boundary: `forwardVerified as
  boolean` and `error as NameResolutionError` (from `unknown`) via local helpers, and `… as never` for
  the malformed-config table (matching the Code-stage seeded convention, e.g. `null as never`). One
  `undefined as unknown as boolean` in `lifecycle-and-detection` mirrors the shipped seeded defect
  (b) verbatim. No `as any`; the SUT's own types are never bypassed.
- **INV-19 seam.** The binding imports `it`/`it.skip` from the `vitest` **ES-module namespace**, whose
  exotic `[[Set]]`/`[[DefineOwnProperty]]` reject both `vi.spyOn` (`configurable:false`) and direct
  reassignment (namespace `[[Set]]` returns false in-process) — empirically confirmed. So the
  fine-grained "exact `it`/`it.skip` call count and order" spy (Code Open Q1) is not achievable
  in-process without a runner-injection seam. INV-19 is instead proven **end-to-end**: `binding.test.ts`
  (Code) + `binding-projection.test.ts` (new) run the real binding at collection time and the
  projected PASS→`it` (green) / SKIPPED→`it.skip` are observable in the reporter, plus the
  `ConformanceConfigError`-at-collection path is asserted. See the Step-Back Suggestion.
- **Direct-binary discipline.** All verification ran via `./node_modules/.bin/tsc` and
  `./node_modules/.bin/vitest` (and the workspace-root `eslint`) directly — never a bare `pnpm <script>`
  — per the operational directive, to avoid reverting the `@openzeppelin/ui-types` dev:local overlay.
  The overlay symlink was confirmed intact (→ `.packed-packages/local-dev` tgz) before and after.

## Out of Scope

- **The compliant EVM conformance RUN** — lives in `adapter-evm-core`'s own tests (dep-cycle
  avoidance, INV-23). This stage tests the harness against abstract `ResolutionResult`-shaped stubs
  only; the real-adapter run over a mocked viem client is that package's Tests slice.
- **INV-19 exact-emission spy (call count + order + FAIL→`it(expect.fail)` branch).** Blocked
  in-process by ESM-namespace immutability of the `vitest` runner API (see Test Notes). The projection
  is a 1:1 order-preserving loop proven end-to-end for PASS/SKIP + the exception path; the FAIL-branch
  emission cannot be asserted without either a red test or a runner seam. Documented as a Recommended
  step-back below.
- **Mutation testing (Stryker).** The shippable gate is the deterministic seeded set (INV-25),
  now tightened to exactly-own-invariant; automated mutation testing remains optional post-core.
- **A machine-filterable INV-8 code-mismatch signal** (Invariants Open Q3) — the in-union-wrong-code
  note stays prose in the `message`; no new `CheckStatus`, so nothing new to test.
- **Load / soak / concurrency tests** — the harness is a pure, bounded, synchronous-traversal library
  with no daemon, queue, or wall-clock surface (INV-20); there is no realistic-workload latency budget
  to assert. Not applicable.
- **`isValidName` conformance** — not one of the four required families; the harness does not grade it
  (the lifecycle probe uses it only as a post-dispose trigger). Out of SF-4's scope.

## Dev Notes

- **No step-back on the two local strengthenings (INV-6/INV-9).** Both were already discharged by the
  Code stage and are now covered end-to-end here (forward + reverse EXPECT; three distinct containment
  call sites). No design gap surfaced during testing.
- **INV-25 tightened beyond the Code stage.** The seeded suite asserted "the right key FAILs"; this
  stage adds that each single-defect stub FAILs *exactly* its own invariant and nothing else — the
  precise anti-mis-attribution guarantee SC-004 needs.
- **No bug found in the harness.** Every one of the 172 conformance assertions passes against the
  source as shipped; no code change was needed or made. If the Orchestrator later wants the INV-19
  fine-grained spy, the smallest enabling change is a runner-injection seam (below), which is a
  Code-stage edit — routed via the Orchestrator, not applied here.

## Open Questions

1. **INV-19 runner seam (for Docs / a future hardening pass).** Should `describeConformance` accept an
   optional injected `{ it }` runner (defaulting to the vitest import) so the exact-emission spy
   becomes possible? It is purely additive and would not change the default call site. *(Owner:
   Orchestrator → Code, if desired.)*
2. **`adapter-evm-core` compliant-run wiring (downstream).** The compliant EVM
   `describeConformance(...)` over a mocked viem client belongs in that package's Tests slice to fully
   discharge SC-004 against a real adapter. Carried forward from the Code stage. *(Owner:
   adapter-evm-core slice.)*

## Step-Back Suggestion (Optional)

**Target stage:** Code Draft
**Severity:** Recommended — improves testability of an otherwise well-covered invariant
**Issue:** INV-19's fine-grained assertion (emitted `it`/`it.skip` count + order exactly mirror
`report.results`, incl. the FAIL→`it(() => expect.fail(msg))` branch) cannot be verified in-process:
`describeConformance` reads the runner from the immutable `vitest` ES-module namespace, so neither
`vi.spyOn` nor reassignment can intercept the calls, and a FAIL projection run at collection time turns
the file red.
**Current workaround:** INV-19 is proven end-to-end for the PASS and SKIPPED projections (`binding.test.ts`
+ `binding-projection.test.ts`) and for the `ConformanceConfigError`-at-collection path; only the
FAIL-branch emission and the exact count/order spy are deferred (Out of Scope, above).
**Why step-back would be better:** A one-line, purely-additive runner-injection seam on
`describeConformance` (`config`-level or a second optional arg defaulting to the vitest import) would let
a test pass a recording `it`/`it.skip` and assert the projection 1:1 — closing INV-19 completely without
changing any default behavior. The test case that exposed the limit: `binding-projection.test.ts`
(the removed recorder swap threw `Cannot assign to read only property 'it' of object '[object Module]'`).

The Orchestrator decides whether to act on this. It is a suggestion, not a blocker — INV-19's
consumer-visible contract is already verified.
