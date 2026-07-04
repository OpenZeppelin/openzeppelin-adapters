---
stage: tests
project: ens-uikit-support
sub_feature: sf-1-native-error-mapping
repo: openzeppelin-adapters
mode: extension
extends: packages/adapter-evm-core/src/name-resolution
status: draft
timestamp: 2026-07-04
author: aleksandr.pasevin
previous_stage: artifacts/001-ens-uikit-support/sf-1-native-error-mapping/04-code.md
tags: [ens, name-resolution, error-mapping, tests, vitest, viem, evm, adapter, service]
---

# SF-1 · Native-error → NameResolutionError mapping — Test Suite

## Summary

Invariant-driven unit suite for the pure, stateless classification module `mapNameResolutionError`
plus the four typed constructors (`nameNotFound`, `addressNotFound`, `unsupportedName`,
`unsupportedNetwork`). The module has no chain / KV / async / auth / rate / load surface, so the
suite exercises the techniques a codomain-closure function actually admits: entry-point invocation
(Req/Res), fault injection with real `viem` error instances and foreign-realm look-alikes (Error
Semantics), replay/determinism (Idempotency), frozen-input & bounded-traversal probing
(Side-Effect/Obs), credential-leak probing against realistic keyed RPC URLs (Sensitive Data), and
purity/portability + source-introspection structural checks (Perf/Reuse). All 18 invariants
(INV-1..INV-18) are covered; the whole package suite is green with the addition and the type-level
assertions compile under `tsc`. Auth Boundary, Resource/Rate, sequence-interleaving, and load are
`n/a` for a synchronous pure leaf — recorded explicitly, not silently skipped.

**Result: 105/105 tests pass** in the new file; **787/787 pass** for the full `adapter-evm-core`
package (33 files) — zero regressions. (Was 100/782; +5 for the post-close D3 amendment — see
Revision Log.) Test-file type-level assertions typecheck clean (`tsc
--noEmit`, exit 0). The local `@openzeppelin/ui-types@3.1.1` link is materialized (verified:
symlink to the packed local-dev tarball, all seven `NameResolutionError` codes + `RuntimeDisposedError`
resolve), so the suite runs against the real cross-repo shape — no paths override.

## Test file

`packages/adapter-evm-core/src/name-resolution/__tests__/error-mapping.test.ts` — single file,
`describe` blocks grouped by invariant category (idiomatic for a single pure module; mirrors the
sibling `erc3643/__tests__/erc3643.error-mapping.test.ts`).

## Test Plan

| Test / block | Invariant | Category / Technique | What it verifies |
|--------------|-----------|----------------------|------------------|
| `maps <shape> to a valid union member` (×17 corpus) | INV-1 | Req/Res · entry-point | Every input shape (Error subclasses, non-Error throws, `null`/`undefined`/primitives/symbol/`{}`/null-proto) → `code ∈ SEVEN_CODES` |
| `never returns an invented code even when biased by every context flag` | INV-1 | Req/Res | Corpus × `{viaGateway, networkId, elapsedMs}` still closed |
| `type-level: return type is exactly NameResolutionError` | INV-1 | Req/Res · compile-time | `expectTypeOf(...).returns` equals the closed union |
| constructor exactness ×4 + no-extra-keys | INV-2 | Req/Res | Each constructor → exact variant, exact keys, values verbatim |
| `type-level: each constructor returns its exact variant` | INV-2 | Req/Res · compile-time | `Extract<union,{code}>` per constructor |
| distinct-identity + mutate-isolation ×3 | INV-3 | Req/Res | Two equal calls → `!==` but `toEqual`; mutating one never affects a later call |
| `accepts <shape> without throwing and without a context arg` (×17) | INV-4 | Req/Res | `unknown` domain; single-arg call always valid |
| `type-level: error param is unknown, context optional` | INV-4 | Req/Res · compile-time | Param signature `[unknown, ctx?]` |
| hostile `get message` / `toString` / null throw ×3 | INV-5 | Req/Res | `ADAPTER_ERROR.message` always non-empty string; extraction never throws (fallback `'unknown error'`) |
| `every non-allowlisted input returns a union member` | INV-6 | Error · totality | No third outcome across the corpus |
| `the only value ever thrown is an allowlist member` | INV-6 | Error · totality | Positive (RDE throws) + negative (corpus never throws) |
| cause-by-reference (Error + non-Error) ×2 | INV-7 | Error · fault injection | `ADAPTER_ERROR.cause === original` (identity) |
| precedence table rows 1–6 (×8) | INV-8, INV-10 | Error · precedence | First-match-wins order snapshotted |
| `same timeout maps by viaGateway alone` | INV-10 | Error | Gateway flag dominates bare-timeout |
| RDE re-throw (direct / nested / foreign-realm by `.name`) ×3 | INV-9 | Error · fault injection | Allowlist re-throws unchanged; needle backstops `instanceof` |
| `TypeError/RangeError/ReferenceError/bare Error → ADAPTER_ERROR` (×4) | INV-9 | Error | Non-members classified, never re-thrown; cause preserved |
| `allowlist checked BEFORE classification` | INV-9 | Error · precedence | Row 0 beats gateway context |
| gateway/offchain/http/timeout+gateway → gateway, never not-found (×4) | INV-11 | Error · fault injection | No gateway→not-found conflation |
| `structural: mapper body constructs no not-found variant` | INV-11 | Error · source introspection | Brace-scoped mapper body has no `NAME_NOT_FOUND`/`ADDRESS_NOT_FOUND`/constructor call |
| **D3** decoded UR `HttpError` revert + gateway ctx → gateway (Row 1) | INV-8, INV-10, INV-11 | Error · fault injection | Decoded revert `errorName='HttpError'` (via `extractRevertInfo`, not `.name`) → EXTERNAL_GATEWAY_ERROR |
| **D3** decoded UR `HttpError` revert, no ctx → gateway (Row 3) | INV-11 | Error · fault injection | Same bucket as `OffchainLookup*`; never not-found |
| **D3** resolver-semantic reverts (`ResolverNotFound`/`ResolverNotContract`/`UnsupportedResolverProfile`) → ADAPTER_ERROR (×3) | INV-11 | Error · fault injection | Stay DISTINCT — SF-2 control-path, NOT mapper rows; never gateway, never not-found |
| elapsedMs verbatim / genuine-0 / (absent,NaN,neg,Inf)→-1 (×6) | INV-12 | Error · boundary | Always finite; `-1` sentinel distinct from real `0` |
| mapper + constructor determinism ×2 | INV-13 | Idempotency · replay | Structurally-equal on repeat (cause by identity) |
| `structural: no clock / RNG / mutable module state` | INV-13 | Idempotency · source introspection | No `Date.now`/`Math.random`/`performance.now`/`new Date`; no top-level `let`/`var` |
| deeply-frozen error not mutated; no logger invoked ×2 | INV-14 | Side-Effect/Obs | Read-only over input; `console.*` spies never called |
| cyclic chain / 10⁴-deep chain / within-cap RDE ×3 | INV-15 | Side-Effect/Obs · adversarial | Bounded traversal terminates; no stack blow-up; allowlist found within depth cap |
| key-in-detail / key-in-message+recoverable-on-cause / userinfo / reason ×4 | INV-16 | Sensitive Data · leak probe | Credentials stripped from renderable fields; full original only on `cause` |
| cause only on ADAPTER_ERROR; type-level cause is `unknown` ×2 | INV-17 | Sensitive Data | Other variants carry no `cause`; no narrower type |
| zero-config use / no injected-dep params / import discipline ×3 | INV-18 | Perf/Reuse · portability + source introspection | Embeddable with no wiring; only ui-types runtime import is `RuntimeDisposedError`; union is `import type` |

## Coverage Matrix

| Invariant | Happy Path | Boundary | Failure | Additional |
|-----------|:---------:|:--------:|:-------:|------------|
| INV-1 (codomain closure) | ✓ | ✓ | ✓ | ✓ type-level |
| INV-2 (constructor payload exactness) | ✓ | | | ✓ type-level, no-extra-keys |
| INV-3 (fresh immutable results) | ✓ | | | ✓ mutate-isolation |
| INV-4 (input domain `unknown`) | ✓ | ✓ | ✓ | ✓ type-level |
| INV-5 (message always string, never throws) | | ✓ | ✓ | ✓ hostile getters |
| INV-6 (totality, single carve-out) | | | ✓ | ✓ corpus sweep |
| INV-7 (ADAPTER_ERROR fallback, cause by ref) | | | ✓ | ✓ non-Error cause |
| INV-8 (deterministic precedence) | ✓ | ✓ | ✓ | ✓ full row table |
| INV-9 (programmer-error allowlist, first) | | ✓ | ✓ | ✓ foreign-realm needle |
| INV-10 (timeout-vs-gateway precedence) | ✓ | ✓ | | ✓ same-error twin |
| INV-11 (gateway ≠ not-found) | | | ✓ | ✓ source introspection |
| INV-12 (elapsedMs finite; -1 sentinel) | ✓ | ✓ | | ✓ genuine-0 vs sentinel |
| INV-13 (referential transparency) | ✓ | | | ✓ source introspection |
| INV-14 (zero side effects; no mutation) | | | | ✓ frozen input, logger spies |
| INV-15 (bounded cause-chain traversal) | | ✓ | | ✓ cyclic + 10⁴-deep adversarial |
| INV-16 (credential redaction) | | ✓ | ✓ | ✓ recoverable-on-cause |
| INV-17 (cause opaque) | ✓ | | | ✓ type-level |
| INV-18 (pure dependency-free leaf) | ✓ | | | ✓ portability + import discipline |

No invariant row is empty. INV Auth Boundary (whole section), Resource/Rate, side-effect
*interleaving*, and load/soak are **n/a** for a synchronous pure leaf and are not represented as
rows (consistent with the Invariants doc's own Auth-Boundary `n/a` and Resource/Rate note).

## Revision Log

- **2026-07-04 — post-close D3 amendment (+5 tests, test-only, no stage re-open).** SF-2 Code added a
  mapper row (cross-SF drift **D3**): the Universal-Resolver offchain-gateway HTTP failure surfaces as
  a *decoded* revert `errorName === 'HttpError'` on a thrown `ContractFunctionRevertedError`, reached
  via `extractRevertInfo` (the shared revert-info walk) rather than the `.name` needle, and now
  classifies to `EXTERNAL_GATEWAY_ERROR` — Row 1 under a gateway context (viaGateway-dominant, INV-10)
  and Row 3 without one, the same bucket as `OffchainLookup*`. Added a `describe('… D3 …')` block with
  five cases: (1) decoded `HttpError` + `viaGateway:true` → gateway; (2) decoded `HttpError`, no ctx →
  gateway (never not-found); (3–5) the three resolver-*semantic* reverts
  (`ResolverNotFound`/`ResolverNotContract`/`UnsupportedResolverProfile`) → `ADAPTER_ERROR`, confirming
  they stay **distinct** from the D3 transport revert (they are SF-2 control-path outcomes, not mapper
  rows). The HttpError→gateway and ResolverNotFound→ADAPTER_ERROR cases are mutually validating: both
  decode through the same `extractRevertInfo` path, so a broken decode would flip the HttpError case
  red — the pair proves the row discriminates on `errorName`, not that it no-ops. New fixture
  `makeDecodedRevert(errorName)` mirrors the sibling `erc3643` test's revert construction. No source,
  Build Status matrix, or commit touched; SF-1 Tests stays ✅.

## Test Notes

- **No fakes, no chain, no fake timers.** The unit under test is pure and synchronous — the strongest
  possible F.I.R.S.T. profile. Faults are injected as *real* `viem` error instances (`TimeoutError`,
  `HttpRequestError`, `ChainDoesNotSupportContract`, `BaseError`) constructed in-process, plus
  plain-object "foreign-realm" look-alikes (`{ name: 'OffchainLookupError' }`, etc.) that match by
  `.name` but fail `instanceof` — exactly the duplicate-copy/bundling case the classification
  defense-in-depth targets. The `OffchainLookup*` classes are not exported by `viem`, so the
  foreign-realm object is the *only* way to exercise those rows anyway.
- **Structural / source-introspection tests.** Three invariants are partly enforced by reading the
  module source at test time (`readMapperSource()` → `resolve(process.cwd(), 'src/name-resolution/error-mapping.ts')`):
  INV-11 (mapper body constructs no not-found — brace-scoped to `mapNameResolutionError`), INV-13
  (no clock/RNG/mutable module-level binding), INV-18 (the only ui-types *runtime* import is
  `RuntimeDisposedError`; the union is `import type`). These catch a regression that a value-level
  test can't — e.g. someone adding `Date.now()` to stamp a message, or importing a logger. They are
  intentionally coarse (regex over source) and would need updating if the module is reformatted; that
  trade is worth it for pinning the purity/closure guarantees the SF-4 conformance harness leans on.
- **Path resolution under Vite.** `import.meta.url` is not a `file://` URL under Vite's module
  transform, so the source-introspection helper resolves from `process.cwd()` (the package root under
  `pnpm -F … exec vitest`) rather than the module URL. Documented in-file.
- **Type-level invariants.** INV-1/2/4/17 have `expectTypeOf` assertions. The package's own
  `tsc --noEmit` **excludes** `src/**/*.test.ts`, so these were validated separately via a temp
  tsconfig that includes `src/name-resolution/**/*` without the test exclude (`tsc` exit 0). If CI
  should enforce test-file types, that exclude is worth revisiting (see Open Questions).
- **INV-15 depth-cap boundary (deliberate).** The cause-chain walk is bounded by
  `MAX_CAUSE_CHAIN_DEPTH = 32`. The suite verifies an allowlisted `RuntimeDisposedError` nested
  *within* the cap is still re-thrown. A `RuntimeDisposedError` buried *beyond* depth 32 would fall to
  `ADAPTER_ERROR` rather than re-throw — an accepted totality-over-precision trade (never hang on an
  adversarial chain; a real disposed error surfaces at a realistic depth). Called out so it isn't
  mistaken for a coverage gap. See Open Questions.
- **Redaction fixtures are realistic.** The keyed URL uses a 32-char Alchemy-style key (exceeds the
  `/vN/<key>` 16-char redaction floor) so the path-segment pattern actually fires; the userinfo case
  uses `wss://user:pass@host`. Both assert the secret is absent from the rendered field *and* present
  on `cause`.

## Out of Scope

- **Real-chain / live-gateway behavior** — the mapper never touches a network; forward/reverse/v2
  resolution against a mainnet fork or a live CCIP-Read gateway belongs to SF-2/SF-3/SF-5 integration
  suites, not this pure-function unit suite.
- **SF-2/SF-3/SF-5 caller control paths** — the *callers* that invoke `nameNotFound` / `unsupportedName`
  / `unsupportedNetwork` on their resolution control path (and that must supply `ctx.elapsedMs`) are
  those SFs' code + tests. This suite proves the constructors and mapper honor the contract; it does
  not prove any caller uses them correctly.
- **The `elapsedMs`-supply caller obligation (INV-12)** — SF-1 cannot enforce SF-2/SF-3/SF-5 behavior;
  the mapper's `-1` safety net is tested here, the obligation is a cross-SF review item (Invariants
  Dev Notes).
- **Avatar-fetch failure mapping** — no mapper row by design (SF-3 degrades to "no avatar"); nothing
  to test at SF-1.
- **Auth / rate-limit / interleaving / load / soak** — no such surface exists on a synchronous pure
  leaf (Invariants Auth-Boundary `n/a`, Resource/Rate note). Recorded, not skipped.

## Dev Notes

- **Two test-code fixes during the stage (no source changes):** (1) source-introspection path moved
  off `import.meta.url` (not `file://` under Vite) to `process.cwd()`; (2) the INV-13 "no mutable
  module state" regex was tightened from any-indented `let`/`var` to column-0 (module-level) only —
  the original wrongly flagged the legitimate function-local `let redacted` in `redactSecrets`.
  INV-13's property is *module-level* mutable state; function locals are fine. No `error-mapping.ts`
  behavior was touched — **no upstream sync required.**
- **No code bugs surfaced.** Every invariant the code claims to enforce (Code Draft §Invariant
  Enforcement Map) is verified true by test. The implementation matches the invariants doc exactly,
  including the row-4 G2 drift (`ChainDoesNotSupportContract` → `UNSUPPORTED_NETWORK`) and the
  removed `classifyEnsResolverRevert` seam (a resolver revert reaching the mapper falls to
  `ADAPTER_ERROR` — verified via the generic `Error → ADAPTER_ERROR` fallback path).
- **Watch-item (build dts warnings) did not affect this stage.** `rolldown-plugin-dts` declaration
  warnings occur on `build`; the test run and the type-level `tsc` both use the source directly and
  the local `ui-types@3.1.1` `dist` types resolved cleanly — type resolution was unaffected.
- **Quality checklist:** every invariant has ≥1 test; every test names its INV-N; no empty matrix
  rows; all failure-path tests assert the specific `code` (never bare `toThrow`); async n/a (module is
  sync); no `as any` / `as unknown as X` in test code; time-dependent tests n/a (no clock).

## Open Questions

1. **[for Docs / CI] Test-file typecheck exclusion.** `tsconfig.json` excludes `src/**/*.test.ts`, so
   the `expectTypeOf` type-level assertions in this suite are not validated by the package's default
   `pnpm typecheck` — only by a manual include. If the type-level invariants (INV-1/2/4/17) should be
   CI-enforced, the pipeline needs a `vitest --typecheck` pass or a test-inclusive tsconfig. Flagged,
   not fixed (touching the shared tsconfig is out of SF-1's scope).
2. **[for SF-4 conformance harness] INV-15 depth-cap semantics.** A `RuntimeDisposedError` nested
   beyond `MAX_CAUSE_CHAIN_DEPTH` (32) degrades to `ADAPTER_ERROR` rather than re-throwing. SF-4's
   never-throw family should be aware this is the intended totality guard, not a violation — the
   conformance harness should not construct a >32-deep disposed chain and expect a throw.
