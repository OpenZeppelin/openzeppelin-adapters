---
stage: tests
project: ens-uikit-support
sub_feature: sf-2-forward-resolution
repo: openzeppelin-adapters
mode: extension
extends: packages/adapter-evm-core/src
status: draft
timestamp: 2026-07-04
author: aleksandr.pasevin
previous_stage: artifacts/001-ens-uikit-support/sf-2-forward-resolution/04-code-draft.md
tags: [ens, name-resolution, forward-resolution, tests, vitest, viem, isValidName, capability, evm, adapter, service]
---

# SF-2 · Forward resolution + capability scaffold + isValidName — Test Suite

## Summary

Invariant-driven `vitest` suite verifying the EVM forward-resolution capability against SF-2's
INV-1..INV-21. Because SF-2 is a **public, stateless read primitive**, the eight service-test
techniques collapse to the ones it actually exercises: entry-point invocation (Req/Res), fault
injection (Error Semantics), replay/determinism (Idempotency), ownership & pre-I/O ordering
(Side-Effect/Obs), single-round-trip bounding (Resource), and credential-leak probing (Sensitive
Data) — with Auth / rate / interleaving-ordering / load recorded `n/a` per the Invariants Auth
Boundary section. The fund-safety core is pinned hardest: `strict:true` is asserted on the one
`getEnsAddress` call (INV-7), a `null` return can never surface as a coerced/placeholder address
(INV-2), every expected failure resolves rather than throws with `RuntimeDisposedError` as the sole
sanctioned throw (INV-6), the D-B sync support-gate and shape/normalize gates perform **zero** I/O on
the unsupported paths (INV-16), and the borrowed client is never torn down by `dispose()` (INV-15).
All 90 SF-2 tests pass green against the **real** `@openzeppelin/ui-types@3.1.1` dev:local link; the
full package suite is 925/925 (39 files) with zero regressions. One doc-vs-code divergence (the
`instanceof`-brittleness of the resolver-revert switch) is tested at *actual* behavior and raised as
an Open Question — no source was modified.

## Test Files

All under `packages/adapter-evm-core/src/name-resolution/__tests__/` (co-located, mirroring the SF-1
`error-mapping.test.ts` convention):

| File | Focus | Tests |
|------|-------|-------|
| `fixtures.ts` (not a test) | Mock `PublicClient`, EVM `NetworkConfig`, seven-code set, viem-error factories | — |
| `name-validation.test.ts` | `isValidName` / `normalizeName` — INV-3, INV-4, INV-21 | 21 |
| `provenance.test.ts` | `baseEnsProvenance()` — INV-5, INV-13, INV-19 (label) | 6 |
| `service.test.ts` | `EvmNameResolutionService.resolveName` / `isValidName` / `dispose` — the bulk | 55 |
| `service.normalize-backstop.test.ts` | Isolated `vi.mock` for the D-D normalize-throw backstop — INV-11 site 2 | 1 |
| `name-resolution.factory.test.ts` | `createNameResolution` guarded surface — INV-1, INV-6, INV-15, INV-17, INV-20 | 7 |
| **Total (SF-2)** | | **90** |

## Test Plan

| Test group | Invariant | Technique | What it verifies |
|-----------|-----------|-----------|------------------|
| `resolveName — return-shape closure` | INV-1 | Entry-point | Sweep success / null / classified-revert / timeout / invalid-name / raw-throw → each a `{ ok }`-discriminated `ResolutionResult`; the opposite arm is absent |
| `resolveName — success-value fidelity` | INV-2 | Entry-point | Resolved hex passed through byte-identical (no checksum rewrite/coercion); `value.name` echoes ORIGINAL input; `null` → `NAME_NOT_FOUND`, never `{ok:true, 0x000…}` |
| `isValidName — total/pure/sync` | INV-3 | Boundary corpus | 12-case corpus (empty, hex, dotless, dotted, emoji, normalize-throwing) → always a boolean, never throws |
| `isValidName — shape-gate semantics` | INV-4 | Boundary | Rejects hex + dotless; accepts `.eth`/`.box`/`.xyz` (proves NOT a TLD allowlist); rejects UTS-46-invalid; `true` necessary-not-sufficient |
| `baseEnsProvenance` | INV-5 | Entry-point | Deep-equals `{label:'ENS', external:false}`; no `scopedToNetworkId`; fresh object each call |
| `resolveName — never-throw` | INV-6 | Fault injection | 9-class corpus (TimeoutError, HttpError, decoded reverts, primitives, null, foreign-realm) → resolves; `RuntimeDisposedError` from the call re-propagates (never masked) |
| `createNameResolution — use-after-dispose` | INV-6 | Fault injection | Post-dispose method access throws `RuntimeDisposedError` (guard proxy, before body) |
| `resolveName — strict:true` | INV-7 | Entry-point | `getEnsAddress` invoked with `{ strict: true }` — the fund-safety literal |
| `resolveName — NAME_NOT_FOUND both paths` | INV-8 | Fault injection | `null` return AND `ResolverNotFound`/`ResolverNotContract` reverts → `NAME_NOT_FOUND`; unregistered name on supported net is not `UNSUPPORTED_NETWORK` |
| `resolveName — not-found only on control path` | INV-9 | Fault injection | The `default`(mapper) arm never yields not-found; a gateway-shaped error → `EXTERNAL_GATEWAY_ERROR` |
| `resolveName — total & closed classification` | INV-10 | Fault injection | 10-row class→code table end-to-end; unclassifiable → `ADAPTER_ERROR` w/ `cause` by reference; every code ∈ seven-code set |
| `resolveName — UNSUPPORTED_NAME (sites 1 & 3)` + backstop (site 2) | INV-11 | Fault injection | Shape-gate fail, normalize-throw backstop, `UnsupportedResolverProfile` → `UNSUPPORTED_NAME`; never for a missing record |
| `resolveName — precedence` | INV-12 | Boundary | Invalid name on unsupported net → `UNSUPPORTED_NETWORK` (support-gate wins); `networkId` = `config.id` (drift D1) |
| `resolveName — stateless/deterministic` | INV-13 | Replay | Two equal calls → deep-equal, distinct identities, distinct provenance; interleaved concurrent calls independent |
| `resolveName — read-only/retry-safe` | INV-14 | Entry-point | Only `getEnsAddress` invoked; `sendTransaction`/`writeContract` never called; safe to re-invoke |
| `dispose — borrowed-client no-dispose` | INV-15 | Ownership | `dispose()` calls no client teardown; client still usable after; through service + factory |
| `resolveName — pre-I/O gating` | INV-16 | Sequence | Unsupported net & invalid name → ZERO `getEnsAddress`; valid+supported → exactly one |
| `dispose — idempotent & inert` | INV-17 | Sequence | `dispose()` twice → no throw; borrowed client never closed; no emitter |
| `resolveName — bounded work + elapsedMs` | INV-18 | Quota/boundary | One call even on failure (no retry loop); timeout → `RESOLUTION_TIMEOUT.elapsedMs` finite ≥0 (never `-1`) |
| `resolveName — no leak channel` | INV-19 | Sensitive-data | Keyed URL in native message redacted on returned field, retained only on `cause`; control-path reasons + label leak-free |
| `resolveName — DI seam / portability` | INV-20 | Portability | Runs against a hand-rolled `{chain, getEnsAddress}` with no host wiring; second-host embed |
| `isValidName — independently importable` | INV-21 | Portability | Imported directly from `name-validation.ts`, no service/client constructed |
| `instanceof-brittleness of resolver-revert switch` | INV-6/INV-10 | Fault injection | Real revert → precise `NAME_NOT_FOUND`; foreign-realm revert degrades SAFELY → `ADAPTER_ERROR` (divergence, see Open Q) |

## Coverage Matrix

| Invariant | Happy Path | Boundary | Failure | Additional |
|-----------|:---------:|:--------:|:-------:|-----------|
| INV-1 return-shape closure | ✓ | ✓ | ✓ | |
| INV-2 success-value fidelity | ✓ | | ✓ | |
| INV-3 isValidName total/pure/sync | ✓ | ✓ | ✓ (normalize-throw swallowed) | |
| INV-4 isValidName semantics | ✓ | ✓ | ✓ | ✓ (non-TLD-allowlist) |
| INV-5 baseEnsProvenance shape | ✓ | | | ✓ (fresh-per-call) |
| INV-6 never-throw / sole throw | | | ✓ (9-class corpus) | ✓ (disposed throw + re-propagate) |
| INV-7 strict:true mandatory | ✓ | | | ✓ (spy on options) |
| INV-8 NAME_NOT_FOUND both paths | | ✓ (not UNSUPPORTED_NETWORK) | ✓ (null + 2 reverts) | |
| INV-9 not-found only on control path | | | ✓ | ✓ (gateway→EXT_GATEWAY) |
| INV-10 total & closed classification | ✓ | | ✓ (10-row table) | ✓ (cause preserved) |
| INV-11 UNSUPPORTED_NAME (3 sites) | | | ✓ (sites 1,2,3) | |
| INV-12 precedence | | ✓ (dual-match) | | ✓ (drift D1 networkId) |
| INV-13 stateless/deterministic | ✓ | | | ✓ (replay + concurrent) |
| INV-14 read-only/retry-safe | ✓ | | | ✓ (no-write spies) |
| INV-15 borrowed-client no-dispose | | | | ✓ (ownership × service+factory) |
| INV-16 pre-I/O gating | ✓ (exactly-one) | ✓ (zero calls) | | |
| INV-17 dispose idempotent/inert | | | | ✓ (double-dispose) |
| INV-18 bounded work + elapsedMs | | ✓ (one call) | ✓ (timeout elapsedMs) | |
| INV-19 no credential-leak channel | | | ✓ (redaction) | ✓ (label + reason allowlist) |
| INV-20 DI seam / portability | | | | ✓ (bare host + factory) |
| INV-21 isValidName importable/client-free | ✓ | | | ✓ (direct import) |

No empty rows — every invariant has ≥1 test. **Recorded `n/a`** (no cell) per the Invariants Auth
Boundary section and INV-14/INV-18: Auth boundary, rate/quota limiting, side-effect *interleaving*
(no mutable state to interleave), and load/soak (a stateless read has no latency-budget or heap-growth
surface at the unit level). These are listed in Out of Scope, not stubbed.

## Test Notes

- **Test environment.** Pure mocked-client unit tests (`vitest@4.1.0`), no live chain, no fork. The
  viem `PublicClient` is a minimal structural mock exposing only what SF-2 reads —
  `chain.contracts.ensUniversalResolver.address` (the D-B support-gate) and `getEnsAddress` (the one
  network call) — built by the single `makeClient` helper in `fixtures.ts`. The `as unknown as
  PublicClient` cast is centralized there (one site) rather than re-cast per file, matching the house
  style in `erc4626.behavior.test.ts`.
- **viem-error fixtures.** `makeTimeoutError` / `makeHttpError` / `makeChainUnsupportedError` use real
  viem constructors; `makeDecodedRevert(errorName)` builds a `ContractFunctionExecutionError` whose
  decoded revert carries `data.errorName` (reached via `extractRevertInfo`, gated on `instanceof
  BaseError`) — verbatim from the SF-1 suite so both classify the same shape identically.
  `foreignRealmError(name)` is a plain `{ name, message }` that matches by `.name` but fails
  `instanceof` — the defense-in-depth / brittleness probe.
- **The D-D normalize-throw backstop (INV-11 site 2) needs a mock.** Real inputs can't reach it —
  `isValidName` and `normalizeName` call the *same* deterministic `normalize`, so any input that
  passes the shape gate also normalizes. `service.normalize-backstop.test.ts` file-scopes a
  `vi.mock('../name-validation')` (shape-gate → `true`, normalize → throws) to exercise the path;
  isolating it in its own file keeps the real validation module for every other test.
- **Type-level enforcement.** `ResolutionResult` is a discriminated union with no shared non-discriminant
  field, so `tsc` already rejects unnarrowed `.value`/`.error` access (part of INV-1's guarantee). The
  test files are written with real types end-to-end (no `as any`); the two `as unknown as` casts are
  the centralized client mock and the deliberate no-write / bare-host portability fixtures.
- **CI caveat (carried from SF-1 Tests Open Q1).** `tsconfig.json` excludes `src/**/*.test.ts`, and
  `vitest` transpiles without full type-checking — so test-file type errors are not caught by the
  default `tsc`/`test` scripts. I typechecked all SF-2 test files out-of-band via a scratch tsconfig
  (`composite:false`, test files included): **zero** type errors in `src/name-resolution/__tests__/`.
  Worth a CI `typecheck:tests` project (Docs/CI).

## Out of Scope

- **Auth boundary tests** — SF-2 is a public read primitive with no authorization surface (Invariants
  § Auth Boundary, `n/a`). The only lifecycle gate (use-after-dispose) is covered under INV-6/INV-17.
- **Rate-limit / quota / backpressure tests** — no rate surface at this layer (INV-18); back-pressure
  is the host runtime's transport concern.
- **Side-effect *interleaving* ordering tests** — the service holds no mutable state (INV-13), so
  there is no observable optimistic/partial state to interleave; concurrent-independence is covered
  under INV-13 instead.
- **Load / soak / latency-budget tests** — a stateless single-read has no heap-growth or throughput
  budget to assert at the unit level; SC-001's ≥95% correctness target is an integration-environment
  concern (real ENS resolution), not a unit test.
- **Live-chain / mainnet-fork resolution** — real `getEnsAddress` behavior, real CCIP-Read traversal,
  and the real UR revert *surface* are integration/E2E concerns. The class→code table is pinned to
  `viem@2.44.4`; a viem major bump requires re-validating INV-8/INV-10/INV-11 against a fork (see
  Invariants Dev Notes). Unit tests fault-inject the documented revert `errorName`s instead.
- **SC-006 non-EVM regression (`adapter-solana`/`-midnight`/`-polkadot`/`-stellar`)** — those packages
  are additively unaffected (the capability is optional at the runtime-map level); their suites live
  in their own packages, out of scope for the `adapter-evm-core` unit suite. Verified indirectly here
  only by the full `adapter-evm-core` suite staying green (925/925, zero regressions).
- **`adapter-evm` runtime registration wiring** (`profiles/shared.ts` `nameResolution` slot / `ensClient`
  helper) — an `adapter-evm`-package concern; this suite covers the core capability and factory.
- **Reverse (SF-3), ENS v2 / `EnsProvenance` (SF-5), the conformance harness (SF-4)** — later
  sub-features; `ADDRESS_NOT_FOUND` is unreachable from SF-2 and is not asserted here.

## Dev Notes

- **Extension mode — regressions.** SF-1's `error-mapping.test.ts` (105 tests) and the full
  `adapter-evm-core` suite (925/925, 39 files) stay green with SF-2 added — the capability is purely
  additive. Baseline was captured green before writing (105 tests) and re-confirmed after.
- **Ran against the REAL `@openzeppelin/ui-types@3.1.1`** dev:local link (materialized in-place;
  resolves to `…openzeppelin-ui-types-3.1.1.tgz`), not the published `3.1.0`. The link is materialized
  as of SF-1 Tests; no re-resolve was needed. All resolution value types (`ResolvedAddress`,
  `ResolutionProvenance`, `ResolutionResult`, `NameResolutionError`, `NameResolutionCapability`,
  `RuntimeDisposedError`) are imported live from it.
- **No source modified.** No production bug was found — the implementation matches the invariants
  (incl. drift D1 `networkConfig.id`, the D-C/D-D/Part-A control-path classification, and the redaction
  delegation to SF-1). The one behavioral note (foreign-realm resolver revert → `ADAPTER_ERROR`) is a
  *documentation* divergence, not a code defect (see Open Questions).
- **Incidental formatting touch — surfaced for the Orchestrator.** A glob `eslint --fix
  src/name-resolution/__tests__/*.ts` also normalized prettier formatting in the SF-1
  `error-mapping.test.ts` (it had a latent multi-line-object prettier violation). The change is
  **formatting-only, no semantic change, still 105/105 green**. Because the entire `src/name-resolution/`
  tree is currently *untracked* in git (SF-1 + SF-2 both uncommitted working tree), there is no
  committed baseline to `git checkout`; deliberately re-introducing the violation would leave SF-1's
  file lint-dirty. Left prettier-compliant and flagged here — the dev decides at commit time.
- **Determinism.** No fake timers needed — `resolveName` reads no clock into its *output*
  (`performance.now()` feeds only the error-path `elapsedMs`, asserted as finite ≥0, never snapshotted
  to an exact value). All tests are F.I.R.S.T.-clean: fast (~0.4s), independent (fresh service + mock
  per test), repeatable, self-validating (every failure asserts a specific `code`).

## Open Questions

1. **`instanceof`-brittleness of the resolver-revert switch — doc-vs-code divergence (route to
   Orchestrator; propose upstream sync to Invariants Dev Notes).** The Invariants Dev Notes state:
   *"Tests should simulate a foreign-realm revert (matching `errorName`, failing `instanceof`) and
   confirm the `switch` still classifies `ResolverNotFound`/`UnsupportedResolverProfile` correctly."*
   The implemented `service.ts` gates the `errorName` read on `error instanceof BaseError`, so a
   foreign-realm/bundled-viem resolver revert does **not** classify to `NAME_NOT_FOUND`/`UNSUPPORTED_NAME`
   — it falls to the mapper's `ADAPTER_ERROR` fallback. This is **safe** (INV-6 never-throws, INV-10
   closed-union, `cause` preserved, never a coerced address — exactly what the Code Draft's own comment
   documents) and is now covered by three tests asserting the *actual* behavior (real revert → precise
   `NAME_NOT_FOUND`; foreign-realm revert → safe `ADAPTER_ERROR`). **Not a bug and not a step-back** —
   the never-throw/closed-union contract holds; only classification *precision* degrades in the rare
   duplicate-copy case. Proposed resolution: reword the Invariants Dev Note to match the code (the
   needle backstops only the *transport* buckets in the SF-1 mapper, not the SF-2 resolver-semantic
   switch), **or** — if cross-realm precision is wanted — a Code-Draft follow-up to move the
   `errorName` extraction ahead of the `instanceof` gate. Flagged for the dev; no source touched.
2. **CI does not typecheck test files (carried from SF-1 Tests Open Q1).** `tsconfig` excludes
   `*.test.ts` and `vitest` skips type-checking, so the real-types-end-to-end guarantee in these tests
   is not CI-enforced by default. Verified out-of-band clean here. A `typecheck:tests` CI project would
   make it durable — for Docs/CI, package-wide (not SF-2-specific).
