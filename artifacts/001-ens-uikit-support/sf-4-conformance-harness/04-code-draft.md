---
stage: code
project: ens-uikit-support
repo: openzeppelin-adapters
sub_feature: SF-4
mode: extension
extends: packages/adapter-runtime-utils
status: draft
timestamp: 2026-07-04
author: aleksandr.pasevin
previous_stage: artifacts/001-ens-uikit-support/sf-4-conformance-harness/03-invariants.md
tags: [conformance, tck, name-resolution, adapter, test-infrastructure, deep-equal, allowlist, seeded-defect, cross-repo]
---

# SF-4: Adapter Conformance Test Harness — Code Draft

## Summary

Implemented the parameterized, adapter-agnostic name-resolution conformance harness as a new
`./conformance` subpath in `@openzeppelin/adapter-runtime-utils` — a runner-agnostic pure
`checkConformance(config): Promise<ConformanceReport>` core plus a thin `describeConformance()`
vitest binding, enforcing UIKit **INV-6 / INV-8 / INV-12 / INV-16** (plus the optional
lifecycle family) against a caller-supplied `makeCapability()` factory over declarative
`ResolutionResult`-shaped vectors. The most consequential implementation choice: **key
derivation is centralized in the checker** (not in each `checks/*` file) so report-key
uniqueness (INV-3) and result ordering (INV-16 self-determinism) are provable in one place —
the `checks/*` files stay pure leaf classifiers returning `{status, message}`. All three
Code-Draft open questions were resolved per the dev's confirmation: INV-6 vector-expectation
mismatch = **FAIL + SKIP dependents**; INV-26 lifecycle family **shipped now** (opt-in,
default-absent); INV-8 in-union-but-wrong-code = **PASS-with-note** (no new `CheckStatus`).
Verified GREEN against the real `@openzeppelin/ui-types@3.1.1` dev:local link: `tsc` clean,
ESLint clean, **87 passed / 5 skipped across 8 files** (63/5 new + 24 SF regression, zero
regressions). Strictly additive — only `package.json` modified; guard Proxy + `runtime-*`
untouched.

## Modules

All under `packages/adapter-runtime-utils/src/conformance/` (new). Boundary rule honored: only
`vitest-binding.ts` and `__tests__/*` import a runner; the rest of the core imports **only**
`@openzeppelin/ui-types`.

| Path | Public exports (via `./conformance`) | Purpose |
|---|---|---|
| `index.ts` | `checkConformance`, `describeConformance`, `isUserSafeLabel`, `DEFAULT_LABEL_POLICY`, `normalizeResolutionResult`, `structuralEqual`, `NAME_RESOLUTION_ERROR_CODES`, all types + `ConformanceConfigError` | Curated public surface for the subpath |
| `types.ts` | `ConformanceConfig`, `ForwardVector`, `ReverseVector`, `VectorExpectation`, `InvariantResult`, `ConformanceReport`, `InvariantId`, `CheckStatus`, `LabelPolicy`, `LabelDenyRule`, `NameResolutionErrorCode`, `ConformanceConfigError`, `AnyResolutionResult` | Core types + sole error class |
| `checker.ts` | `checkConformance` | Pure core: validate → feature-detect → per-vector orchestration → assemble report |
| `deep-equal.ts` | `normalizeResolutionResult`, `structuralEqual`, `isPlainObject` | INV-12 engine (normalize pre-pass + hand-rolled comparator) |
| `label-policy.ts` | `DEFAULT_LABEL_POLICY`, `isUserSafeLabel` | INV-16 engine (widened allowlist + denylist) |
| `internal.ts` | `invoke`, `isRuntimeDisposedError`, `describeError`, `safeConstruct`, `sanitizeSlug`, `makeKeyDeduper`, `CheckOutcome`, `InvokeOutcome` | Shared containment wrapper + disposed predicate + key helpers |
| `checks/never-throws.ts` | `NAME_RESOLUTION_ERROR_CODES`, `classifyExpectedFailure`, `neverThrewViolation`, `neverThrewDisposedSkip` | UIKit INV-8 decision table + closed-union set |
| `checks/forward-verified.ts` | `checkForwardVerified` | UIKit INV-6 concrete-boolean check |
| `checks/determinism.ts` | `checkDeterminism` | UIKit INV-12 (normalize → structuralEqual) |
| `checks/label-user-safe.ts` | `checkLabel` | UIKit INV-16 (delegates to policy) |
| `checks/lifecycle.ts` | `checkLifecycle` | OPTIONAL INV-26 lifecycle sanctioned-throw |
| `vitest-binding.ts` | `describeConformance` | Thin, order-preserving projection onto `it()` / `it.skip()` |
| `__tests__/fixtures.ts` | (test-only) abstract stubs + vectors | Caller-owned substrate for the meta-suite |
| `__tests__/seeded-defects.test.ts` | — | SC-004 meta-suite + hygiene proofs (INV-25 et al.) |
| `__tests__/deep-equal.test.ts` | — | Comparator/normalizer unit proof (INV-14/15) |
| `__tests__/label-policy.test.ts` | — | Locked label corpus (INV-5/24) |
| `__tests__/binding.test.ts` | — | Real top-level `describeConformance` usage (INV-19) |

**Modified (1 file):** `package.json` — added `"./conformance"` export, promoted `vitest` to an
**optional peer** (`peerDependenciesMeta.vitest.optional = true`) while keeping it as a dev-dep.

**Untouched (verified):** `src/index.ts` (`.` entry), `runtime-capability.ts` (guard Proxy —
consumed via `RuntimeDisposedError`, never modified), `runtime-factories.ts`, `profile-runtime.ts`.
`sideEffects: false` holds.

## Invariant Enforcement Map

SF-4's own invariants (the harness is the subject-under-test). "UIKit INV-N" = the adapter
contract the harness *enforces*.

| INV-N | Enforced by | Location |
|-------|-------------|----------|
| INV-1 (report shape; `passed` computed) | `passed = results.every(r => r.status !== 'FAIL')` | `checker.ts` (assemble) |
| INV-2 (total coverage; SKIP not dropped) | per-vector emission + `absentMethodResults` | `checker.ts` |
| INV-3 (unique, invariant-numbered keys) | `deriveKeys` + `makeKeyDeduper` | `checker.ts`, `internal.ts` |
| INV-4 (UIKit INV-6 concrete boolean) | `typeof … === 'boolean'` | `checks/forward-verified.ts` |
| INV-5 (UIKit INV-16 user-safe label) | allow + length + deny | `label-policy.ts`, `checks/label-user-safe.ts` |
| INV-6 (vector-expectation fidelity) | `EXPECT` FAIL + dependents SKIP | `checker.ts` (`runVector`) |
| INV-7 (inputs immutable; policy frozen) | `readonly` types + `Object.freeze` (deep) | `types.ts`, `label-policy.ts` |
| INV-8 (UIKit INV-8 never-throw table) | `classifyExpectedFailure` + closed-union `Set` | `checks/never-throws.ts` |
| INV-9 (total exception containment) | single `invoke()` wrapper on every call | `internal.ts`, `checker.ts` |
| INV-10 (sole throw = config error) | `validateConfig` up front | `checker.ts` |
| INV-11 (single disposed predicate) | `isRuntimeDisposedError` (instanceof + name) | `internal.ts` |
| INV-12 (no opaque leak / no re-throw) | `describeError` (string only, raw err dropped) | `internal.ts` |
| INV-13 (UIKit INV-12 determinism) | two calls → normalize → `structuralEqual` | `checks/determinism.ts` |
| INV-14 (`normalizeResolutionResult`) | recursive undefined-drop + avatar/cause drop | `deep-equal.ts` |
| INV-15 (`structuralEqual`) | hand-rolled comparator, identity fallback | `deep-equal.ts` |
| INV-16 (harness self-determinism) | no clock/RNG/env; input-derived ordering | `checker.ts` |
| INV-17 (fresh instance/case; no dispose) | `makeCapability()` per case; core never disposes | `checker.ts` |
| INV-18 (side-effect-free core) | no I/O in core | whole core |
| INV-19 (faithful binding projection) | one `it`/`it.skip` per result, in order | `vitest-binding.ts` |
| INV-20 (bounded work; no retries) | ≤2 calls/vector, no loops over adapter data | `checker.ts` |
| INV-21 (`error.cause` never inspected) | normalize drops `cause`; never read | `deep-equal.ts` |
| INV-22 (no persist/log; no secrets) | no I/O anywhere | whole core |
| INV-23 (zero-adapter-dep; quarantined vitest) | imports = ui-types only; vitest peer-optional | module tree, `package.json` |
| INV-24 (full pluggability; policy override) | closed set derived from union; `labelPolicy` used verbatim | `checks/never-throws.ts`, `checker.ts` |
| INV-25 (SC-004 100% detection) | compliant ref + 1 stub/defect, key-asserted | `__tests__/seeded-defects.test.ts` |
| INV-26 (OPTIONAL lifecycle throw) | opt-in dedicated-instance probe | `checks/lifecycle.ts`, `checker.ts` |

## Implementation Notes

- **Key derivation centralized in the checker (minor structural refinement of the design).**
  The design sketched `checks/*` returning `InvariantResult[]`. To make INV-3 uniqueness and
  INV-16 ordering provable in one place, `checks/*` return pure `{status, message}` leaves and
  the checker attaches `invariant` + deduped `key`. Per-family logic stays isolated per file
  (RS-TCK "one rule per test" traceability preserved). Forward-consistent; no behavior change.
- **`InvariantId` extended by two members** beyond the design's four: `'EXPECT'` (the INV-6
  vector-expectation-fidelity FAIL, key `inv_expect_…`) and `'INV-26'` (optional lifecycle,
  key `inv26_lifecycle_disposedThrows`). The four UIKit families keep their exact ids/keys, so
  the SC-004 meta-suite assertions on `INV-6/8/12/16` are unaffected. Documented on the type.
- **`ConformanceConfig.lifecycleProbe?: boolean` added** (design did not enumerate it; INV-26
  references it). Default `false` → no lifecycle result appears (byte-identical required run).
- **Closed 7-code union pinned at compile time** — `CODES` is `satisfies readonly
  NameResolutionErrorCode[]` plus a two-way `extends` assertion, so any drift in
  `@openzeppelin/ui-types` breaks the build here (INV-24, stronger than a hand-kept list).
- **Feature-detect via a discarded probe instance** (never disposed → INV-17). If the probe
  construction itself throws, both methods are treated as present so each per-vector
  construction surfaces the failure as FAIL data rather than a silent skip.
- **Two calls per vector** (INV-20): call #1 drives INV-8 / expectation / UIKit INV-6 / INV-16;
  call #2 drives INV-12 — both on the same fresh instance. A throw on call #2 is attributed to
  INV-12 (not double-counted under INV-8, which examined call #1).
- **INV-9 widened to every call** via one `invoke()` wrapper: a throw on a *success* vector is an
  INV-8 FAIL with dependents (UIKit INV-6/16 + INV-12) SKIPPED; `checkConformance` still resolves.
- **Allowlist-primary ordering is observable:** a URL label FAILs via the anchored allowlist
  (`allow-mismatch`) before the denylist's `contains-url-scheme` rule runs — belt-and-braces,
  as designed. A test was corrected to assert the FAIL, not a specific rule name.

## Out of Scope

- **The compliant EVM conformance RUN** — lives in `adapter-evm-core`'s OWN tests (dep-cycle
  avoidance, INV-23). Not added here; this stage delivers only the harness it plugs into.
- **ENS v2 / `EnsProvenance`-specific conformance** — SF-5 additive; the widened allowlist
  already accommodates SF-5 labels (`'ENS via CCIP-Read'`), but no v2-specific family is built.
- **Automated mutation testing (Stryker)** — the shippable gate is the deterministic seeded set
  (INV-25); mutation testing is optional post-core hardening.
- **A machine-filterable INV-8 code-mismatch signal** (Invariants Open Q3) — deferred; the
  in-union-but-wrong-code note lives in the `message` string, no new `CheckStatus`.
- **Harness-imposed timeouts / cancellation** — a hanging substrate is the caller's fixture
  concern (INV-20); the harness `await`s honestly.
- **A dedicated `vitest`-spy test of the binding's projection counts** — covered pragmatically
  by a real top-level `describeConformance` usage (`binding.test.ts`); a finer spy-based
  assertion is left to the Tests stage.

## Dev Notes

- **⚠️ Build-environment incident (restored).** Running `pnpm typecheck` unexpectedly triggered
  a workspace-wide `pnpm install`, which reverted the `@openzeppelin/ui-types` **dev:local**
  overlay (the `.packed-packages/local-dev` `.tgz` that carries the SF-1 name-resolution types)
  to the registry `3.1.1` (which lacks them) across `adapter-runtime-utils`, `adapter-evm-core`,
  and `adapter-evm`. The good tgz-based pnpm store dir was intact, so I re-pointed the three
  `node_modules/@openzeppelin/ui-types` symlinks back to the dev:local overlay (exactly what
  `oz-ui-dev use local` creates) — atomic, no reinstall, no lockfile/workspace churn, minimal
  blast radius given the concurrently-running agents. **No git-tracked files were changed by the
  incident** (lockfile / `pnpm-workspace.yaml` clean). **Recommendation for concurrent agents:**
  verify with `./node_modules/.bin/tsc` / `./node_modules/.bin/vitest` directly rather than
  `pnpm <script>`, or re-run `pnpm dev:local` at a quiet moment. Flagged to the Orchestrator.
- **Verification (all against the real `@openzeppelin/ui-types@3.1.1` dev:local link):** `tsc
  --noEmit` clean; ESLint `--max-warnings 0` clean (auto-fixed prettier formatting only, no
  substantive findings); `vitest run` = **8 files, 87 passed, 5 skipped** (the 5 skips are the
  binding SKIP-projection `it.skip`s over the forward-only reverse family). SC-004 meta-suite
  proves 100% detection with the correct invariant key for each of the four defect classes.
- **No SF-1/2/3 source touched, no SF-1 mapper change, no spec-body edit, no upstream drift.**
  The only modified file is `adapter-runtime-utils/package.json`.
- Three Design Open Questions were already resolved at Invariants; the three Code-Draft Open
  Questions (INV-6 severity, INV-26 ship-now, INV-8 signal) were confirmed by the dev before
  coding and implemented as confirmed.

## Open Questions

1. **Binding projection coverage depth (for Tests).** `binding.test.ts` exercises the real
   top-level `describeConformance` path (green PASS its + SKIP its). If the Tests stage wants a
   finer assertion that the emitted `it`/`it.skip` **count and order** exactly mirror
   `report.results`, add a `vi.spyOn`-based test there (INV-19). *(Owner: Tests.)*
2. **`adapter-evm-core` compliant-run wiring (downstream, not this package).** The compliant EVM
   `describeConformance(...)` over a mocked viem client belongs in `adapter-evm-core`'s tests to
   fully discharge SC-004 against a real adapter. Flag when that package's Tests/Code runs.
   *(Owner: adapter-evm-core slice.)*
