---
stage: code
project: ens-uikit-support
sub_feature: sf-1-native-error-mapping
repo: openzeppelin-adapters
mode: extension
extends: packages/adapter-evm-core/src
status: draft
timestamp: 2026-07-03
author: aleksandr.pasevin
previous_stage: artifacts/001-ens-uikit-support/sf-1-native-error-mapping/03-invariants.md
tags: [ens, name-resolution, error-mapping, viem, evm, adapter, service, code]
---

# SF-1 · Native-error → NameResolutionError mapping — Code Draft

## Summary

Implements the reusable, **pure, stateless** error-mapping layer for `@openzeppelin/adapter-evm-core`:
`mapNameResolutionError(error, ctx?)` — a total function that classifies a caught native transport
failure into the closed seven-code `NameResolutionError` union (owned by UIKit SF-1) — plus the four
typed constructors (`nameNotFound`, `addressNotFound`, `unsupportedName`, `unsupportedNetwork`) for
the non-throw control paths. All 18 invariants that bind the transport-generic core are enforced in
code with `INV-N` annotations. **SF-2 Design finalized the mapper as this transport-generic core
only**: ENS Universal-Resolver reverts (`ResolverNotFound` / `ResolverNotContract` /
`UnsupportedResolverProfile`) and the UTS-46 `normalize()` throw are **not** mapper rows — SF-2
pre-classifies them on its own resolution control path via the typed constructors here, preserving
INV-11 (the mapper never fabricates a not-found, and never needs the `name`/`address` it does not
carry). The interim `classifyEnsResolverRevert` seam was therefore **removed** (a stub returning
`undefined` is behaviorally identical to the `ADAPTER_ERROR` fallback — dead code, YAGNI); a resolver
revert that nonetheless reaches the mapper is unclassified transport noise and falls to
`ADAPTER_ERROR` (safe). The most consequential carried-in decision is the
SF-2 Research **G2 drift** (pre-authorized in-place): the forward-path `UNSUPPORTED_NETWORK` signal is
viem `ChainDoesNotSupportContract`, corrected in the classification table (row 4).

The code is **verified type-correct against the real local `@openzeppelin/ui-types@3.1.1`** (the
post-UIKit-SF-1 minor); see Implementation Notes § ui-types linking.

## Modules

| Path | Kind | Public exports | Purpose |
|------|------|----------------|---------|
| `packages/adapter-evm-core/src/name-resolution/error-mapping.ts` | new | `mapNameResolutionError`, `nameNotFound`, `addressNotFound`, `unsupportedName`, `unsupportedNetwork`, `ELAPSED_UNMEASURED`, `type NameResolutionErrorContext` | The mapper, the four typed constructors, the context type, the redaction helper, and the internal classification table. |
| `packages/adapter-evm-core/src/name-resolution/index.ts` | new | (re-exports `error-mapping`) | Domain barrel. SF-2 appends `createNameResolution`; SF-5 appends `EnsProvenance` / `isEnsProvenance`. |
| `packages/adapter-evm-core/src/index.ts` | modified | +7 named re-exports | One added export block surfacing the mapper/constructors/context/sentinel at the package root. Additive only; nothing removed or renamed. |

## Invariant Enforcement Map

| INV-N | Enforced by | Location |
|-------|-------------|----------|
| INV-1 (codomain closure) | `NameResolutionError` return type + unconditional `ADAPTER_ERROR` fallback (row 6) | `error-mapping.ts` `mapNameResolutionError` |
| INV-2 (constructor payload exactness) | `Extract<NameResolutionError,{code}>` return types — extra/missing field is a compile error | `error-mapping.ts` 4 constructors |
| INV-3 (fresh immutable results) | fresh object literals, no module-level cache/singleton | all 5 fns |
| INV-4 (input is `unknown`) | param `error: unknown`; existence-guarded access (`typeof`/`in`/optional) | `collectErrorChain`, `readCause`, `nameOf`, `safeMessage` |
| INV-5 (`ADAPTER_ERROR.message` always a non-empty string, extraction never throws) | `safeMessage()` — `try/catch` around `.message`/`String()`, `FALLBACK_MESSAGE` | `error-mapping.ts` `safeMessage` |
| INV-6 (totality, single carve-out) | exactly one `throw` (row 0); every other path returns; guarded access | `mapNameResolutionError` |
| INV-7 (`ADAPTER_ERROR` fallback preserves `cause` by reference) | row 6 assigns `cause: error` directly | `mapNameResolutionError` |
| INV-8 (deterministic precedence, first-match) | single ordered `if` cascade rows 0→6 | `mapNameResolutionError` |
| INV-9 (programmer-error allowlist, checked first) | `PROGRAMMER_ERROR_CLASSES`/`PROGRAMMER_ERROR_NAMES`, `instanceof`-primary + `.name` fallback, row 0 | `mapNameResolutionError`, `chainMatches` |
| INV-10 (timeout-vs-gateway, `viaGateway` dominates) | row 1 (`viaGateway && (timeout\|offchain\|http)`) precedes row 2 (bare timeout) | `mapNameResolutionError` |
| INV-11 (gateway never conflated with not-found) | classification table has no not-found row; not-found only via constructors | `mapNameResolutionError`, `nameNotFound`/`addressNotFound` |
| INV-12 (`RESOLUTION_TIMEOUT.elapsedMs` finite; `-1` sentinel) | `resolutionTimeout()`: `Number.isFinite && ≥0 ? v : ELAPSED_UNMEASURED` | `error-mapping.ts` `resolutionTimeout`, `ELAPSED_UNMEASURED` |
| INV-13 (referential transparency) | no clock/RNG/mutable module state | whole module |
| INV-14 (zero side effects; error never mutated) | no I/O/logger; `readCause`/`nameOf` read-only | `collectErrorChain`, `readCause`, `nameOf` |
| INV-15 (bounded cause-chain traversal) | visited `Set<object>` + `MAX_CAUSE_CHAIN_DEPTH` cap | `error-mapping.ts` `collectErrorChain` |
| INV-16 (credential redaction in renderable free-text) | `redactSecrets()` + `REDACTION_PATTERNS` applied to `message`/`detail`/`reason`, never `cause` | `error-mapping.ts` `redactSecrets`, `externalGatewayError`, row 6, `unsupportedName` |
| INV-17 (`cause` opaque, `unknown`, only on `ADAPTER_ERROR`) | `cause: error` set only at row 6; no narrowing helper exported | `mapNameResolutionError` |
| INV-18 (pure dependency-free leaf) | `import type` for the union; no injected logger/clock/transport; O(1)+O(bounded) work | whole module (see Note 1) |

## Implementation Notes

1. **INV-18 vs INV-9 reconciliation (RuntimeDisposedError is a runtime import) — RESOLVED, sync
   applied.** INV-18's original wording said "the only `@openzeppelin/ui-types` import is `import
   type`," but INV-9 requires detecting the re-throw allowlist **`instanceof`-primary**, which needs
   the `RuntimeDisposedError` *class* at runtime. Resolved by importing the **union type-only**
   (`import type { NameResolutionError }`, erased at build — INV-18's substantive guarantee: zero
   runtime coupling to the not-yet-stable type shape) while importing **`RuntimeDisposedError` as a
   runtime value** for `instanceof`. This adds no *new* coupling: `@openzeppelin/ui-types` is already a
   runtime dependency of this package (`erc4626/error-mapping.ts` constructs `InsufficientBalance`
   etc.) and of `@openzeppelin/adapter-runtime-utils` (`runtime-capability.ts` throws
   `RuntimeDisposedError`). The `.name`-needle fallback still backstops the foreign-realm/duplicate-copy
   case. **Dev-approved (Q3 = Y):** the INV-18 clarification is applied to `03-invariants.md` as a
   labeled Code-Draft-originated sync (see its Dev Notes, dated 2026-07-03).

2. **Classification is `instanceof`-primary + `.name`-needle over a self-contained bounded walk.**
   Rather than lean solely on viem's `BaseError.walk` (which only traverses `BaseError` instances and
   would miss a non-Error throw or a foreign-realm error), `collectErrorChain` walks `.cause`
   generically with a visited-set + depth cap (INV-15) and accepts any value (INV-4). `TimeoutError`,
   `HttpRequestError`, `ChainDoesNotSupportContract`, `BaseError` are imported from `viem` for the
   `instanceof` primary; the **`OffchainLookup*` classes are NOT publicly exported by viem** (only
   their types), so they are matched by `.name` needle only — exactly the defense-in-depth the design
   anticipated.

3. **G2 drift applied (row 4).** `CHAIN_UNSUPPORTED_ERROR_NAMES = {ChainDoesNotSupportContract}` →
   `UNSUPPORTED_NETWORK`. `EnsInvalidChainIdError` (coinType, SF-5) and `ClientChainNotConfiguredError`
   (no-chain, pre-empted by SF-2 at construction) are intentionally absent; the latter falls to
   `ADAPTER_ERROR` here.

4. **`src/index.ts` uses explicit named re-exports**, not the `export * from './name-resolution'` the
   design sketched — to match the existing curated-surface style of that file (the skill checklist
   favors a curated public surface over a wildcard dump). The domain barrel `name-resolution/index.ts`
   does use `export *` (internal). Minor deviation from the design sketch; behavior identical.

5. **ui-types linking / build status.** The currently-*resolved* dependency in this workspace is the
   published `@openzeppelin/ui-types@3.1.0`, which predates UIKit SF-1 and does **not** export
   `NameResolutionError` — so `pnpm -F @openzeppelin/adapter-evm-core typecheck` currently reports
   exactly one error (`TS2305` at the import). This is the known cross-repo HOLD, not a code defect. I
   ran `pnpm dev:local` (per the spec's local-linking assumption); it built and packed the **local
   `@openzeppelin/ui-types@3.1.1`** (the post-SF-1 minor, which *does* export the union with all seven
   codes) into `.packed-packages/local-dev/ui.json`. I **verified the draft compiles with zero errors
   against that real local 3.1.1 `dist`** via a tsc `paths` override. The link does not *materialize*
   in-place because pnpm treats the lockfile as satisfied by 3.1.0 and skips re-resolution (a
   pnpmfile-checksum caching quirk that also no-op'd `oz-ui-dev use local`'s own install step and even
   `pnpm install --force`). See Open Questions Q1. No lockfile/pnpmfile churn was left behind.

## Out of Scope

- **The ENS Universal-Resolver reverts (`ResolverNotFound` / `ResolverNotContract` /
  `UnsupportedResolverProfile`) + the UTS-46 `normalize()` throw** — owned by **SF-2's resolution
  control path**, not the mapper. SF-2 Design finalized these as caller-side outcomes, pre-classified
  via the typed constructors here (`unsupportedNetwork`, `unsupportedName`, `nameNotFound`), which
  preserves INV-11 and keeps the `name`/`address` at the site that holds it. The interim
  `classifyEnsResolverRevert` seam was removed (dead-but-safe — a `undefined`-returning stub is
  identical to the `ADAPTER_ERROR` fallback). A resolver revert reaching the mapper is unclassified
  transport noise → `ADAPTER_ERROR` (safe).
- **Forward `resolveName` / `isValidName` / the capability factory** — SF-2.
- **Reverse `resolveAddress` / `forwardVerified` / avatar** — SF-3.
- **ENS v2 / `EnsProvenance` / `isEnsProvenance`** — SF-5 (SF-1 only maps v2 *gateway errors* via
  `ctx.viaGateway`).
- **The conformance harness** — SF-4 (consumes these exports).
- **Tests** — SF-1 Tests stage (`05-tests.md`). No test files written this stage.
- **Avatar-fetch failure mapping** — no mapper row (SF-3 degrades to "no avatar").

## Dev Notes

- **Cross-SF caller obligation (INV-12):** SF-2/SF-3/SF-5 must supply `ctx.elapsedMs` (measured by
  their own timeout wrapper) on any timeout-capable path. A `-1` (`ELAPSED_UNMEASURED`) reaching a
  consumer means a caller forgot to measure — worth a review check in those SFs' Code Draft.
- **Resolver-revert ownership (SF-2 Design outcome):** ENS resolver reverts and normalize-throws are
  pre-classified by SF-2 on its control path via the exported constructors, not by the mapper — so the
  mapper stays the transport-generic core and INV-11 is preserved (the mapper never fabricates a
  not-found nor needs a `name`/`address` it doesn't carry). No mapper context field was added.
- **Redaction is URL-scoped** (userinfo + `/vN/<key>` path segment + `?key=`/`?apiKey=`/`?token=`
  query), per the Invariants-stage default. Conservative (`{16,}` on path keys) to avoid over-scrubbing
  legitimate diagnostic text.
- **viem pin:** the class → code table is pinned to `viem@2.44.4`; a viem major bump requires
  re-validating it (comment in-file).

## Open Questions

1. **[OPEN — carried to SF-1 Tests] Materializing the local `ui-types@3.1.1` link in-place.** The
   draft is verified green against the local 3.1.1 types, but the in-place resolution stays on the
   published 3.1.0 due to pnpm's lockfile-satisfied fast path (even `oz-ui-dev use local` and `pnpm
   install --force` no-op'd). **The SF-1 Tests stage requires the link actually materialized to run**,
   so this is carried forward as that stage's entry blocker. Likely requires clearing the pnpm store
   entry / a clean re-resolve, or a pnpm-version nuance — a dev-env step, not a code issue. The
   Orchestrator is weighing raising it with the UIKit side as a `dev:local` tooling defect (it will
   block SF-2 Code, SF-2 Tests, and all of SF-3/4/5 too).
2. **[RESOLVED — SF-2 Design]** Whether the mapper needs a `name`/`address` context field: **no.** SF-2
   pre-classifies resolver reverts on its control path via the typed constructors, so the mapper never
   builds `UNSUPPORTED_NAME`/`NAME_NOT_FOUND` and needs no extra context field. `NameResolutionErrorContext`
   is unchanged; the `classifyEnsResolverRevert` seam was removed.
3. **[RESOLVED — dev-approved Y, applied]** The INV-18 ↔ INV-9 wording conflict is fixed: `03-invariants.md`
   INV-18 now scopes "type-level only" to the `NameResolutionError` union and explicitly permits the
   runtime `RuntimeDisposedError` import INV-9 requires. Applied as a labeled Code-Draft-originated
   sync (see that artifact's Dev Notes, 2026-07-03).
