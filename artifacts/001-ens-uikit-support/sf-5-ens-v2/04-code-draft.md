---
stage: code-draft
project: ens-uikit-support
sub_feature: sf-5-ens-v2
repo: openzeppelin-adapters
mode: extension
extends: packages/adapter-evm-core/src
status: draft
timestamp: 2026-07-04
author: aleksandr.pasevin
previous_stage: artifacts/001-ens-uikit-support/sf-5-ens-v2/03-invariants.md
tags: [ens, ensv2, name-resolution, ccip-read, cross-chain, coinType, ensip-9, ensip-11, viem, EnsProvenance, isEnsProvenance, provenance, capability, evm, adapter, service, code-draft]
---

# SF-5 · ENS v2 (L1-only: CCIP-Read + cross-chain via coinType) + EnsProvenance + isEnsProvenance — Code Draft

> Implements the revised **D-V9** (Design v2): observed `external` + an `EnsProvenance` ride **every**
> forward-resolution success (mainnet-bound CCIP-Read **and** the L1 cross-chain path), over the SF-2
> forward pipeline, additively (D-A signature + D-B behavior unchanged; base `ResolutionProvenance`
> unchanged). No new error code, no SF-1 mapper row, SF-3 reverse untouched.

## What shipped

- A new `EnsProvenance` extension type + `isEnsProvenance` guard + `buildEnsProvenance` / `deriveCoinType`
  / `scopedNetworkId` builders — **observable facts only** (`system`/`coinType`/`external`/`scopedToNetworkId`),
  discriminated by an always-present `system: 'ens'`, a strict superset of the UNCHANGED base type.
- `service.ts` `resolveName` unified over `(client, coinType)` via a private `resolveVia()`; **both**
  branches observe offchain traversal and build `EnsProvenance`. Offchain is observed race-free via a
  **per-call** observing client (`deriveObservingClient`) over a call-local `sawOffchain` flag; `viaGateway`
  is now the observed `sawOffchain` on both paths; single `strict:true` call, never a v2→v1 fallback.
- An additive, gated client model: an optional injected `ensL1Client` on `CreateNameResolutionOptions`,
  wired in `adapter-evm/profiles/shared.ts` to a dedicated mainnet L1 client. Selection precedence
  `bound → ensL1Client → UNSUPPORTED_NETWORK`; `deriveCoinType` throw contained → `UNSUPPORTED_NETWORK`.
- `EnsProvenance` + `isEnsProvenance` (+ builders) re-exported from `@openzeppelin/adapter-evm-core`.

## Source modules

| File | Change | Notes |
|------|--------|-------|
| `packages/adapter-evm-core/src/name-resolution/ens-provenance.ts` | **NEW** | `EnsProvenance`, `isEnsProvenance`, `buildEnsProvenance`, `deriveCoinType`, `scopedNetworkId` |
| `packages/adapter-evm-core/src/name-resolution/service.ts` | **MODIFIED** | client/coinType selection in `resolveName`; shared `resolveVia`; module-level `deriveObservingClient`; ctor gains optional `ensL1Client`; factory 3rd param. **Reverse path (`resolveAddress`) untouched** — still uses `baseEnsProvenance()`. |
| `packages/adapter-evm-core/src/name-resolution/index.ts` | **MODIFIED** | barrel: append `ens-provenance` exports |
| `packages/adapter-evm-core/src/capabilities/name-resolution.ts` | **MODIFIED** | optional `ensL1Client` on `CreateNameResolutionOptions`; threaded to factory |
| `packages/adapter-evm-core/src/index.ts` | **MODIFIED** | re-export `EnsProvenance` + guard + builders |
| `packages/adapter-evm/src/profiles/shared.ts` | **MODIFIED** | `ensL1Client` builder + `resolveMainnetRpcUrl` precedence; passed into both factory maps. Bound `ensClient` unchanged. |
| `packages/adapter-evm-core/src/name-resolution/provenance.ts` | **UNCHANGED** | `baseEnsProvenance` stays (SF-3 reverse) — per directive |

## Invariant → code traceability

Every runtime invariant from `03-invariants.md` has its enforcement in code:

| INV | Enforcement in code |
|-----|---------------------|
| INV-1 return-shape closure | every branch of `resolveName`/`resolveVia` returns an `{ ok }` literal; total `default → mapNameResolutionError` |
| INV-2 success-value fidelity | `if (address === null) return nameNotFound(name)`; `value.address` passed verbatim; `value.name` = original input |
| INV-3 EnsProvenance on every success | single `buildEnsProvenance(...)` site in `resolveVia`'s success arm, reached by both selections; fresh object per call; no `baseEnsProvenance` in forward path |
| INV-4 strict superset | `interface EnsProvenance extends ResolutionProvenance`; base `import type`d, never redefined |
| INV-5 `system` always `'ens'` | `readonly system: 'ens'`; `buildEnsProvenance` sets it unconditionally |
| INV-6 `coinType` number < 2^53 | `coinType: Number(args.coinType)` at the single build site |
| INV-7 `scopedToNetworkId` iff `coinType !== 60` | `scopedNetworkId(coinType, networkId)` (single rule source), conditionally spread |
| INV-8 curated label | `args.external ? 'ENS via external gateway' : 'ENS'` — no interpolation |
| INV-9 truthful observed `external` | `deriveObservingClient` wraps `ccipRead.request` → flips call-local `sawOffchain`; fed to `buildEnsProvenance` — never inferred from the name |
| INV-10 `isEnsProvenance` sound guard | `return (p as Partial<EnsProvenance>).system === 'ens'` — discriminant only, never `label` |
| INV-11 never-throw | `deriveCoinType` in `try/catch → UNSUPPORTED_NETWORK`; `resolveVia` call in `try` with total catch; no `throw` |
| INV-12 `strict:true` both branches | single `getEnsAddress({ name, coinType, strict: true })` in `resolveVia` |
| INV-13 `viaGateway = sawOffchain` | `mapNameResolutionError(error, { …, viaGateway: sawOffchain })` — no hardcoded `false` |
| INV-14 no silent fallback | exactly one `getEnsAddress` call; catch classifies and returns; no retry/second read |
| INV-15 closed 7-code classification | ordered switch unchanged from SF-2; no new `case`/code; `error-mapping.ts` byte-unchanged |
| INV-16 `deriveCoinType` throw contained | sync `try/catch` in `resolveName` before I/O → `UNSUPPORTED_NETWORK` |
| INV-17 client selection precedence | `if supportsEns → bound(60n) else if ensL1Client → L1(derived) else UNSUPPORTED_NETWORK` |
| INV-18 race-free observation | fresh `let sawOffchain` + per-call observing client per `resolveVia`; borrowed client's `ccipRead` never mutated |
| INV-19 statelessness/determinism | no instance/module mutable state beyond the call-local flag; fresh result per call |
| INV-20 read-only/retry-safe | only `getEnsAddress` (a read) invoked; no write/submit/persist |
| INV-21 borrowed no-dispose | `dispose()` touches neither injected client; `deriveObservingClient` reuses transport via `custom(client)`, no teardown of the borrowed source |
| INV-22 pre-I/O gating | selection + `deriveCoinType` + shape/normalize all precede the single `getEnsAddress` |
| INV-23 bounded work + `elapsedMs` | one round-trip; `performance.now()` around the call; no loop; observing client reuses transport |
| INV-24 no credential-leak channel | `ensL1Client` RPC URL never threaded into provenance/errors; `label` constant; redaction still only via SF-1 |
| INV-25 DI seam | `ensL1Client` injected via options/ctor; no client builder inside the service |
| INV-26 additive/optional compat | optional `ensL1Client?`; defaulted ctor param; new exports; base type unchanged; non-EVM untouched |

## Drift from Design/Invariants (surfaced, not silently taken)

1. **Client-selection runs BEFORE the shape/normalize gates (deliberate — preserves SF-2 precedence).**
   Design v2's `resolveName` snippet and INV-22 place shape/normalize *first*, then selection. Doing that
   flips SF-2's delivered INV-12 precedence test ("invalid name on an unsupported network →
   `UNSUPPORTED_NETWORK`"), because a malformed name would hit the shape gate before the support gate and
   return `UNSUPPORTED_NAME`. The Orchestrator directive mandates **precedence unchanged / zero
   regression on resolution behavior**, so I kept SF-2's order: support/selection ladder → shape → normalize
   → `resolveVia`. Observable outcomes differ from the Design snippet in exactly one input class — a
   malformed name **and** an unsupported network — where SF-2's contract (`UNSUPPORTED_NETWORK`) wins.
   INV-16/INV-17/INV-22's substance (all gates before any I/O, first-match selection, `deriveCoinType`
   containment) is fully preserved; only the relative order of two synchronous gates differs. **Recommend
   the SF-5 Invariants/Design note INV-22's ordering as "selection-before-shape" to match delivered SF-2.**

2. **`deriveObservingClient` mechanism (discharges Invariants Open Q1).** viem pre-binds a client's
   `getEnsAddress` (and the `call`/`readContract`/`offchainLookup` it delegates to) to *that* client, so
   overriding `ccipRead` on a shallow clone is ignored by the source's pre-bound action. Chosen mechanism:
   - **Real client (has a reusable transport — `client.request` + `chain`):** build a fresh
     `createPublicClient({ chain, transport: custom(client), ccipRead })`. `custom(client)` delegates
     transport requests back to the borrowed client → **no new RPC connection**, borrowed client
     **untouched** (INV-21/INV-23 both hold as stated). The fresh client's pre-bound actions consult *our*
     `ccipRead`, so offchain traversal is observed (INV-9).
   - **Transport-less client (a hand-rolled unit-test double that stubs `getEnsAddress` directly and
     performs no real offchain lookup):** reuse it via a prototype clone with `ccipRead` overridden — there
     is no gateway hop to observe. The branch is on **transport reusability**, not test-detection, and does
     not feed `external` from anything but the hook (INV-9 intact).

3. **`resolveMainnetRpcUrl` precedence (Design Open Q4, `shared.ts` wiring):** mainnet-bound → reuse the
   configured endpoint; otherwise viem's default mainnet public transport (documented rate-limit caveat).
   Used only for the L2-bound cross-chain path; carries no secret threaded into provenance/errors (INV-24).

4. **Minor:** `CcipRequestReturnType` is not a top-level viem export in `2.44.4` → typed the observing
   `ccipRead.request` return as `Hex` (its definition). No behavioral effect.

## SF-2 re-baseline (the DEV-APPROVED delivered-code touch)

**File touched:** `packages/adapter-evm-core/src/name-resolution/__tests__/service.test.ts` — **2 forward-success
assertions** re-baselined (the "~6" estimate; the other forward provenance assertions — fresh-object
identity at line 416, `label === 'ENS'` at the redaction test — pass unchanged because `external` stays
observed-false on the on-chain mock):

- **INV-2 fidelity test:** `provenance` `toEqual({ label:'ENS', external:false })` → `{ system:'ens',
  label:'ENS', external:false, coinType:60 }` (mainnet-bound, on-chain, unscoped → no `scopedToNetworkId`).
- **`value.name` echo test:** `getEnsAddress` call args gain the now-explicit `coinType: 60n` alongside the
  unchanged `strict:true` (consequence of unifying the call over `(client, coinType)`).

**NOT touched (per directive):** `provenance.ts` (`baseEnsProvenance` stays for SF-3 reverse), the SF-1
mapper (`error-mapping.ts`, byte-unchanged), and SF-3 reverse (`service.reverse.test.ts`,
`provenance.test.ts`). RESOLUTION behavior (address, error codes, precedence, `null → NAME_NOT_FOUND`) is
unchanged.

**Result:** full SF-1/SF-2/SF-3 regression suite **GREEN** — zero behavioral regression.

## Verification (direct binaries, against `@openzeppelin/ui-types@3.1.1` overlay)

| Check | Command | Result |
|-------|---------|--------|
| Typecheck (core) | `adapter-evm-core: tsc --noEmit` | ✅ OK |
| Typecheck (evm) | `adapter-evm: tsc --noEmit` | ✅ OK |
| Build (core dist) | `tsdown` | ✅ complete; `EnsProvenance`/`isEnsProvenance`/builders present in `dist/index.d.*` |
| Lint (core + evm changed files) | `eslint` | ✅ OK |
| Regression — name-resolution | `vitest run src/name-resolution` | ✅ **276 passed** (SF-1/2/3) |
| Regression — full core | `vitest run` | ✅ **1009 passed** (40 files) |
| Regression — adapter-evm | `vitest run` | ✅ **149 passed / 1 skipped** |

## Boundary note

Per the Dev3 Code-Draft role, **no SF-5 tests were authored** — SF-5 test authoring (including the
`ccipRead.request` observation probe on `test.offchaindemo.eth`, the chain-scoped `scopedToNetworkId`
probe, and the interleaved race-freedom check named in the Invariants Dev Notes) is **Dev3 05 Tests**'
stage. This Code Draft delivers the implementation + the sanctioned SF-2 provenance re-baseline, and
verifies the existing regression suite stays green.

## No commits

Per role + directive, no commits were made. The dev approves commits separately.
