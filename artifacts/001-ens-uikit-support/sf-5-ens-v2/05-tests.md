---
stage: tests
project: ens-uikit-support
sub_feature: sf-5-ens-v2
repo: openzeppelin-adapters
mode: extension
extends: packages/adapter-evm-core/src
status: draft
timestamp: 2026-07-04
author: aleksandr.pasevin
previous_stage: artifacts/001-ens-uikit-support/sf-5-ens-v2/04-code-draft.md
tags: [ens, ensv2, name-resolution, ccip-read, cross-chain, coinType, ensip-9, ensip-11, viem, EnsProvenance, isEnsProvenance, provenance, capability, evm, adapter, service, tests, invariant-driven]
---

# SF-5 · ENS v2 (L1-only: CCIP-Read + cross-chain via coinType) + EnsProvenance + isEnsProvenance — Test Suite

## Summary

Invariant-driven verification of SF-5's provenance-truthfulness extension to the SF-2 forward path. Two
new suites — a pure-unit suite for the `ens-provenance.ts` builders/guard and a service-integration suite
for the `service.ts` forward path — cover all **26 invariants** (INV-1…INV-26), with the load-bearing
new surface (observed `external`, chain-scoping, `viaGateway`-truthfulness, never-silent-fallback,
race-free observation, client selection) verified directly. The offchain CCIP-Read observation is
exercised deterministically by simulating viem's `offchainLookup` seam (a mock `getEnsAddress` that reads
the client-level `ccipRead.request` hook) — no network. The **delivered SELECTION-BEFORE-SHAPE**
precedence (Code drift #1) is the behavior under test for INV-22, not the invariants doc's shape-first
wording (a known reword). Full SF-1/2/3 regression stays green (346 name-resolution, 1079 full core, 149
adapter-evm) with zero behavioral regression; the live `test.offchaindemo.eth` probe and a full real-viem
CCIP round-trip are the sole deliberate Out-of-Scope items (integration/e2e).

## Test files

| File | Change | Contents |
|------|--------|----------|
| `packages/adapter-evm-core/src/name-resolution/__tests__/ens-provenance.test.ts` | **NEW** | 19 tests — pure builders + guard (`buildEnsProvenance`, `isEnsProvenance`, `scopedNetworkId`, `deriveCoinType`), incl. `expectTypeOf` type-level checks (INV-4/5/6/10) |
| `packages/adapter-evm-core/src/name-resolution/__tests__/service.ens-v2.test.ts` | **NEW** | 51 tests — `resolveName`/`resolveVia` forward path over both client selections (mainnet-bound + L1 cross-chain), observation, error semantics, selection, race-freedom, ownership, leak, DI |
| `packages/adapter-evm-core/src/name-resolution/__tests__/fixtures.ts` | **MODIFIED** | Added SF-5 fixtures: `L2_NETWORK_CONFIG` (Base), `NON_ENSIP11_NETWORK_CONFIG` (deriveCoinType-throw), `BASE_COIN_TYPE(_BIGINT)`, `ETH_COIN_TYPE_BIGINT`, `KEYED_L1_RPC_URL`, `offchainGetEnsAddress()` (ccipRead-hook-traversing spy), and `makeClient` `offchain`/`ccipRequest` options. **No existing fixture semantics changed.** |
| `packages/adapter-evm-core/src/name-resolution/__tests__/service.test.ts` | **UNTOUCHED** | SF-2 forward suite (incl. the DEV-APPROVED SF-5 provenance re-baseline the Code stage delivered) — left verbatim; runs green |

**Total new tests:** 70 (19 + 51). No source files modified — Tests stage boundary respected.

## Test Plan

| Test group | Invariant | Type | What it verifies |
|-----------|-----------|------|-----------------|
| return-shape closure over every SF-5 path | INV-1 | Req/Res | both selections + each new failure branch (unsupported, deriveCoinType-throw, null) resolve to a discriminated `{ ok }` |
| success-value fidelity on both branches | INV-2 | Req/Res | L1 address verbatim (never CAIP-10), original name echoed; null → `NAME_NOT_FOUND` |
| EnsProvenance on every success | INV-3 | Req/Res | mainnet-bound **and** L1 successes carry an `isEnsProvenance`-narrowing object; distinct identity per call |
| strict superset of unchanged base | INV-4 | Req/Res | `expectTypeOf<EnsProvenance>().toMatchTypeOf<ResolutionProvenance>()`; all base fields present at runtime |
| `system` always `'ens'` | INV-5 | Req/Res | set on both external states; no `version` field; literal type |
| `coinType` safe-integer number | INV-6 | Req/Res | 60 (mainnet) / 2147492101 (Base) as `number`; JSON-serializable |
| `scopedToNetworkId` iff chain-scoped | INV-7 | Req/Res | absent when mainnet-bound; = **bound** network id (not mainnet, not CAIP-2) when scoped — spec scenario-1 |
| curated label from observed external | INV-8 | Req/Res | `'ENS'` / `'ENS via external gateway'`; both pass SF-4 allowlist, no URL/key/hex/control chars |
| `external` observed, never inferred | INV-9 | Req/Res | CCIP-Read traversal → `true`; on-chain → `false`; an "offchain"-looking name resolved on-chain → `false`; delegates to source hook (no new connection) |
| `isEnsProvenance` sound guard | INV-10 | Req/Res | `true` for both branches; `false` for SF-3 base + a label-`'ENS'` base (no string-match) + malformed; total, never throws |
| never-throw across new branches | INV-11 | Error | L1-path fault injection resolves (never rejects); `RuntimeDisposedError` re-thrown, not masked |
| `strict:true` on both branches | INV-12 | Error | mainnet-bound `{coinType:60n,strict:true}`; L1 `{coinType:<Base>,strict:true}` |
| `viaGateway = observed sawOffchain` | INV-13 | Error | timeout **with** traversal → `EXTERNAL_GATEWAY_ERROR`; **without** → `RESOLUTION_TIMEOUT`; on both paths |
| never a silent fallback | INV-14 | Error | gateway failure → `EXTERNAL_GATEWAY_ERROR` ≠ `NAME_NOT_FOUND`; exactly one `getEnsAddress`, no retry/second read |
| closed seven-code classification | INV-15 | Error | L1-path class→code table stays within the seven-code set; SF-5 invents none |
| `deriveCoinType` throw contained | INV-16 | Error | non-ENSIP-11 bound chainId → `UNSUPPORTED_NETWORK`, **zero** I/O; valid chainId → one call; unit-level throw is `EnsInvalidChainIdError` |
| gated client-selection precedence | INV-17 | Error | bound-UR→mainnet-bound; L2+ensL1Client→L1; L2 alone→`UNSUPPORTED_NETWORK`; mainnet+ensL1Client→bound wins (no L1 hop) |
| race-free observation | INV-18 | Idempotency | N interleaved calls over one shared client — each `external` matches its own path; borrowed `ccipRead` never mutated |
| stateless & deterministic | INV-19 | Idempotency | equal inputs → deep-equal, distinct-identity provenance; build-level determinism |
| read-only on selected client | INV-20 | Idempotency | L1 path touches only `getEnsAddress`; no write/submit API |
| borrowed no-dispose ownership (both clients) | INV-21 | Side-Effect/Obs | `dispose()` tears down neither injected client; both usable afterward |
| pre-I/O gating + SELECTION-BEFORE-SHAPE | INV-22 | Side-Effect/Obs | invalid name on L2-no-ensL1Client → `UNSUPPORTED_NETWORK` (selection wins); invalid name on bad-chainId L2 → `UNSUPPORTED_NETWORK` (containment wins); one call on the valid path |
| bounded work + elapsedMs | INV-23 | Resource | ≤1 round-trip (no retry loop); L1 timeout → finite `elapsedMs` (never `-1`) |
| no new credential-leak channel | INV-24 | Sensitive Data | keyed L1 RPC URL redacted on returned field (kept on `cause`); provenance fields carry no URL/key |
| DI seam extends to ensL1Client | INV-25 | Perf/Reuse | L1 path runs against a hand-rolled `{chain,getEnsAddress}` with no host wiring |
| additive, optional API-compat | INV-26 | Perf/Reuse | `ensL1Client` optional (type-level); service without it resolves mainnet-bound with a superset provenance; SC-006 non-EVM suites unchanged |

## Coverage Matrix

| Invariant | Happy | Boundary | Failure | Additional |
|-----------|:-----:|:--------:|:-------:|-----------|
| INV-1 return-shape closure | ✓ | ✓ | ✓ | |
| INV-2 success-value fidelity | ✓ | | ✓ | |
| INV-3 EnsProvenance every success | ✓ | | | ✓ (fresh-identity) |
| INV-4 strict superset | ✓ | | | ✓ (type-level) |
| INV-5 `system` discriminant | ✓ | ✓ | | ✓ (type-level) |
| INV-6 `coinType` number | ✓ | ✓ | | |
| INV-7 `scopedToNetworkId` iff scoped | ✓ | ✓ | ✓ (scenario-1) | |
| INV-8 curated label | ✓ | ✓ | | |
| INV-9 observed `external` | ✓ | ✓ | ✓ (inference guard) | ✓ (delegation) |
| INV-10 sound guard (SC-005) | ✓ | | ✓ | ✓ (soundness/total) |
| INV-11 never-throw | | | ✓ | ✓ (disposed re-throw) |
| INV-12 `strict:true` both branches | ✓ | | | |
| INV-13 `viaGateway` observed | | ✓ | ✓ | |
| INV-14 no silent fallback | | | ✓ | ✓ (one-call) |
| INV-15 closed 7-code | | | ✓ | |
| INV-16 deriveCoinType contained | ✓ | | ✓ | |
| INV-17 selection precedence | ✓ | ✓ | | |
| INV-18 race-freedom | | | | ✓ (interleaving) |
| INV-19 statelessness | ✓ | | | ✓ (determinism) |
| INV-20 read-only | | | | ✓ |
| INV-21 no-dispose ownership | | | | ✓ (side-effect/obs) |
| INV-22 selection-before-shape | | ✓ | ✓ | |
| INV-23 bounded work | | | ✓ | ✓ (resource) |
| INV-24 no credential-leak | | | ✓ | ✓ (sensitive) |
| INV-25 DI seam | ✓ | | | ✓ (portability) |
| INV-26 additive/optional | ✓ | | | ✓ (type-level) |

No invariant row is empty. Auth is `n/a` (public read primitive — Invariants § Auth Boundary), recorded, not stubbed.

## Verification (direct binaries, against `@openzeppelin/ui-types@3.1.1` overlay)

| Check | Command | Result |
|-------|---------|--------|
| Typecheck (core) | `adapter-evm-core: tsc --noEmit` | ✅ OK (validates `expectTypeOf` INV-4/5/6/10/26) |
| Lint (new/changed test files) | `eslint` | ✅ OK |
| SF-5 new suites | `vitest run …/ens-provenance.test.ts …/service.ens-v2.test.ts` | ✅ **70 passed** (19 + 51) |
| Regression — name-resolution | `vitest run src/name-resolution` | ✅ **346 passed** (276 SF-1/2/3 + 70 SF-5) |
| Regression — full core | `vitest run` | ✅ **1079 passed** (1009 + 70) |
| Regression — adapter-evm (SC-006) | `adapter-evm: vitest run` | ✅ **149 passed / 1 skipped** — non-EVM & EVM adapters untouched |

## Test Notes

- **Offchain-observation seam (INV-9/13/18) is verified deterministically via a mock, by design.** viem
  pre-binds a client's `getEnsAddress` to that client and reads the client-level `ccipRead.request` in
  its `offchainLookup` (confirmed in `viem/_esm/utils/ccip.js@2.44.4`:
  `const ccipRequest_ = ccipRead?.request ?? ccipRequest`). The `deriveObservingClient` transport-less
  branch (its own doc-comment's sanctioned test-double path) is exercised by an
  `offchainGetEnsAddress` spy that reads `this.ccipRead.request` exactly as `offchainLookup` does — so
  the per-call observing wrapper flips `sawOffchain`, `external` is observed `true`, and the wrapper
  delegates to the **source** client's own hook (asserted call-count = 1) rather than viem's networked
  default. This faithfully tests the code SF-5 owns (`deriveObservingClient` + the flag threading),
  fast and deterministic.
- **`viaGateway`-truthfulness (INV-13)** is pinned on both branches with the timeout-with-vs-without-hook
  discrimination the Invariants Dev Notes flagged as load-bearing.
- **SELECTION-BEFORE-SHAPE (INV-22, Code drift #1).** Per the Orchestrator directive, the delivered
  precedence keeps SF-2's order (support/selection ladder → shape → normalize). The tests assert a
  malformed name on an unsupported network returns `UNSUPPORTED_NETWORK` (both the no-`ensL1Client` and
  the `deriveCoinType`-throw sub-cases) — **not** the invariants doc's shape-first `UNSUPPORTED_NAME`
  wording, which is the known reword. This preserves the zero-regression proviso.
- **Type-level invariants (INV-4/5/6/10/26)** are asserted with `expectTypeOf` and enforced by
  `tsc --noEmit`; every one additionally has a runtime value assertion (no type-only rows).
- **`as unknown as` casts** appear only for deliberately partial hand-rolled clients (INV-20/21/25
  portability probes) — the identical pattern the SF-2 suite already uses for its bare-client tests; the
  full `PublicClient` cast stays centralized in `fixtures.makeClient`.
- **Fixtures are additive.** All SF-5 fixture additions are new exports / new optional `makeClient`
  options; no existing SF-2/3 fixture semantics changed, so the SF-2/3 suites run verbatim.

## Out of Scope

- **Live `test.offchaindemo.eth` network probe** — requires a live mainnet RPC + a reachable CCIP-Read
  gateway; inherently non-deterministic and network-bound (violates F.I.R.S.T. for a unit suite).
  Belongs to an integration/e2e suite. The deterministic seam probe above covers the code SF-5 owns; a
  live probe additionally guards viem's own hook-reading contract on a real gateway.
- **Full real-viem CCIP-Read round-trip (real `getEnsAddress` → `OffchainLookup` → gateway → callback).**
  viem@2.44.4 routes CCIP-Read through `resolveWithGateways` + a nested `x-batch-gateway:true` protocol;
  reproducing it faithfully in a unit test would couple the suite to viem internals (a spike confirmed
  it hangs / requires re-implementing the batch-gateway flow). This is the "viem major bump
  re-validates INV-9" integration check the Invariants Dev Notes call for — integration scope, not unit.
- **`deriveObservingClient` real-client (`custom(client)`) branch** — its transport-reuse / no-new-
  connection property (INV-21/23) on a *real* viem client is only exercisable with a real transport;
  the unit suite covers the transport-less branch (no-mutation of the borrowed `ccipRead`, one
  round-trip). Integration scope.
- **SC-006 non-EVM adapters (solana/midnight/polkadot/stellar) internal behavior** — verified only by
  running their existing suites green (regression), not re-tested here; SF-5 does not touch them.
- **The mapper's internal class→code table + redaction internals** — SF-1's suite (`error-mapping.test.ts`);
  SF-5 adds no row (INV-15) and relies on SF-1's redaction (INV-24). Not re-tested here.
- **Auth** — no authorization surface (Invariants § Auth Boundary); nothing to test.

## Dev Notes

- 70 new tests, all 26 invariants covered, every invariant row in the matrix non-empty. No source
  touched (Tests boundary). No commits.
- **Matrix discrepancy flagged to Orchestrator:** at Tests entry, `00-specify.md` showed `(SF-5, Code)`
  still `⏸️` despite `04-code-draft.md` + the delivered source being complete — the Code stage did not
  flip its cell. I flipped only `(SF-5, Tests)`. The Code cell needs an Orchestrator-owned correction.
- **Upstream gap (no step-back):** INV-22's invariants-doc wording is shape-first; the delivered code is
  selection-before-shape (Code drift #1, dev-directed). The tests assert the delivered behavior. Suggest
  the Orchestrator route a one-line reword of INV-22's Statement to "selection-before-shape" so the
  Invariants artifact matches delivered SF-2/SF-5 (fix-forward, not a step-back — behavior is correct
  and zero-regression).

## Open Questions

1. **INV-22 reword (for the Invariants artifact).** Confirm the reword of INV-22 Statement/violation to
   selection-before-shape — a documentation sync, not a behavior change (Docs stage can carry it, or the
   Orchestrator routes it to `Dev3 03 Invariants`).
2. **Integration/e2e slice for the live seam (Docs / post-core).** The live `test.offchaindemo.eth`
   probe and the full real-viem CCIP round-trip are the natural home for a small integration suite that
   guards the viem-internal `ccipRead.request` contract on a viem major bump (Invariants Dev Notes). Not
   an SF-5 unit-suite gap — flagged for whoever owns the adapter's integration tier.
