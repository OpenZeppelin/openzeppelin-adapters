---
stage: docs
project: ens-uikit-support
sub_feature: sf-5-ens-v2
repo: openzeppelin-adapters
mode: extension
extends: packages/adapter-evm-core/src
status: draft
timestamp: 2026-07-04
author: aleksandr.pasevin
previous_stage: artifacts/001-ens-uikit-support/sf-5-ens-v2/05-tests.md
tags: [ens, ensv2, name-resolution, ccip-read, cross-chain, coinType, ensip-9, ensip-11, viem, EnsProvenance, isEnsProvenance, provenance, ensL1Client, l1-fallback, docs, api-reference, integration-guide, capability, evm, adapter, service]
---

# SF-5 · ENS v2 (L1-only: CCIP-Read + cross-chain via coinType) + EnsProvenance + isEnsProvenance — Documentation

## Summary

Integrator-facing documentation for the ENS v2 layer delivered in `@openzeppelin/adapter-evm-core`
(SF-5), documented **as delivered** against the source, not the design sketch. SF-5 is a
provenance-truthfulness + client-model extension to the SF-2 forward path, so this pass **updates**
the existing `docs/name-resolution/` set (README, API reference, integration guide, examples) that
SF-2/SF-3 Docs built, rather than starting a new doc tree. Everything documented traces to the
delivered `ens-provenance.ts`, the modified `service.ts` (forward `resolveVia` + client selection),
`capabilities/name-resolution.ts` (`ensL1Client` option), the barrel/index re-exports, and the
`adapter-evm/profiles/shared.ts` L1 wiring — and was cross-checked against the built
`dist/index.d.mts` type declarations. Two items the Orchestrator explicitly assigned to this stage
are covered: (1) the **L1-FALLBACK** wiring (the gated `ensL1Client`), deliberately deferred from
SF-2 Docs; and (2) the **mainnet-bound CCIP-Read provenance upgrade** (truthful observed `external`
on the primary v2 case, D-V9 revised). The base `ResolutionProvenance` contract is documented as
**unchanged** (no SF-1 contract change) — `EnsProvenance` is a strict superset.

## Documents

| Document | Change | Purpose | Audience |
|----------|--------|---------|----------|
| `docs/name-resolution/README.md` | **UPDATED** | Landing page — v2 hook, "what it does not do" re-scoped, Key Concepts + Safety extended | All integrators |
| `docs/name-resolution/api-reference.md` | **UPDATED** | Added the `EnsProvenance` surface (type + guard + builders), `ensL1Client` option, selection-before-shape precedence, forward provenance-upgrade note, viem v2 version pins | TS developers |
| `docs/name-resolution/integration-guide.md` | **UPDATED** | Registration now shows the `ensL1Client` wiring; new Pattern 5 (read v2 provenance) + Pattern 6 (L1 cross-chain); Common Mistakes re-scoped | Adapter / dapp integrators |
| `docs/name-resolution/examples/ens-v2-resolve/` | **NEW** | Runnable v2 example: `isEnsProvenance` narrowing, observed `external`, L1 cross-chain wiring block | All integrators |
| `docs/name-resolution/examples/README.md` | **UPDATED** | Index gains the `ens-v2-resolve` example; scope note re-scoped to three slices | All integrators |

All built docs live under `packages/adapter-evm-core/docs/name-resolution/` (co-located with the
package), matching where SF-2/SF-3 placed them.

### What each update covers

- **README** — v2 added to the one-line hook and the direction list; the "what it does not do"
  block re-scoped from "v2 is SF-5, not here" to the *actual* delivered non-goals (no `version`
  field — not observable; no `external` → mechanism mapping — UIKit SF-6's call; no `EnsProvenance`
  on reverse; no Namechain/ENS-L2). A v2 quick-start snippet (narrow with `isEnsProvenance`) sits
  after the reverse snippet. Key Concepts gains four v2 bullets (observed-facts provenance,
  L1-only/`coinType` cross-chain + gated `ensL1Client`, never-silent-fallback). Safety re-scoped:
  the old "mainnet-bound `coinType` 60 / no fallback" and "label is the fixed literal `'ENS'`"
  bullets are replaced with the delivered behavior (L1-starts + gated cross-chain, scoped-address
  binding, two-valued curated `label`, observed `external`).
- **API reference** — title/scope note now covers SF-5; exports-at-a-glance gains the five v2
  exports (marked SF-5); `CreateNameResolutionOptions` gains `ensL1Client?` with the full selection
  semantics; the service constructor + `createEvmNameResolutionService` gain the 3rd optional param;
  `resolveName`'s success value is `EnsProvenance` (with a boxed provenance-upgrade note preserving
  the base-type-unchanged fact) and its precedence table is rewritten to the delivered
  selection-before-shape ladder (1a–1d) with the observed-`viaGateway` note; `resolveAddress` gains
  a boxed "reverse keeps base provenance" note; `baseEnsProvenance` re-documented as reverse-only; a
  new **ENS v2 provenance surface** section documents `EnsProvenance` / `isEnsProvenance` /
  `buildEnsProvenance` / `deriveCoinType` / `scopedNetworkId` with full signatures (verified against
  `dist/index.d.mts`); the version-pin section gains the four SF-5 viem couplings.
- **Integration guide** — title/scope re-scoped; Pattern 1 registration now shows the delivered
  `ensClient` + `ensL1Client` + `resolveMainnetRpcUrl` wiring in `shared.ts`; **Pattern 5** (read
  ENS v2 provenance via `isEnsProvenance`) and **Pattern 6** (L1 cross-chain from an L2-bound
  runtime, with the 4-step selection precedence and the never-silent-fallback statement) added;
  Pattern 2's success comment points at the narrowing; Common Mistakes: the stale "assuming L2→L1
  fallback (not implemented)" mistake is replaced with "expecting L2→L1 without wiring `ensL1Client`
  (gated)", plus new v2 mistakes (`label` matching, `external`-as-mechanism, scoped-address
  mis-binding, `isEnsProvenance` on reverse, expecting silent fallback).
- **Example** — `ens-v2-resolve/resolve.ts` + README: a real viem-mainnet v2 resolution that
  narrows with `isEnsProvenance` and prints the observed `external` / `coinType` /
  `scopedToNetworkId`, plus a documented L1 cross-chain (`ensL1Client`) wiring block. Mirrors the
  `forward-resolve` example's runnable shape (`pnpm tsx resolve.ts <name>`).

## Source of truth

The docs were generated from the delivered source and verified against the built type declarations:

- `packages/adapter-evm-core/src/name-resolution/ens-provenance.ts` — `EnsProvenance`,
  `isEnsProvenance`, `buildEnsProvenance`, `deriveCoinType`, `scopedNetworkId` (observable-facts
  shape; `system:'ens'` discriminant; `coinType:number` via `Number()`; `scopedToNetworkId` iff
  `coinType !== 60`; `label` = `'ENS'` | `'ENS via external gateway'`).
- `packages/adapter-evm-core/src/name-resolution/service.ts` — the forward `resolveName` client +
  coinType selection ladder (`supportsEns()` → bound/`60n`; else `ensL1Client` →
  `deriveCoinType(networkConfig.chainId)`; else `UNSUPPORTED_NETWORK`), the shared `resolveVia`
  (single `strict:true` `getEnsAddress`, `buildEnsProvenance` on success, observed `sawOffchain` fed
  as `viaGateway`), the per-call `deriveObservingClient`, **selection-before-shape** ordering, and
  the **unchanged reverse `resolveAddress`** (still `baseEnsProvenance()`).
- `packages/adapter-evm-core/src/capabilities/name-resolution.ts` — `CreateNameResolutionOptions`
  gains `ensL1Client?`; threaded to the factory as the 3rd arg.
- `packages/adapter-evm-core/src/name-resolution/index.ts` + `src/index.ts` — the v2 re-exports.
- `packages/adapter-evm/src/profiles/shared.ts` — the `ensL1Client` builder + `resolveMainnetRpcUrl`
  precedence, passed into both (eager + lazy) factory maps; bound `ensClient` unchanged.
- `packages/adapter-evm-core/dist/index.d.mts` — confirmed the five v2 exports and their exact
  signatures (`isEnsProvenance(p: ResolutionProvenance): p is EnsProvenance`,
  `deriveCoinType(chainId: number): bigint`, `scopedNetworkId(coinType: bigint, networkId: string):
  string | undefined`, `buildEnsProvenance({external, coinType, networkId})`, `interface
  EnsProvenance extends ResolutionProvenance`).

Behavioral details reflected verbatim from code: `deriveCoinType` reads `networkConfig.chainId`
(the delivered field, not the design's `viemChain.id`); the mainnet-bound path uses `publicClient`
(not `ensL1Client`) at `coinType 60`; `ensL1Client` is consulted **only** when `supportsEns()` is
false; `label` is two-valued and chosen from the observed `external`; the reverse path narrows
`false` under `isEnsProvenance`.

## The two Orchestrator-assigned items (proviso c)

1. **Additive gated L1-FALLBACK (`ensL1Client`) — deferred from SF-2 Docs, documented here.**
   Covered in three places: the API reference `CreateNameResolutionOptions.ensL1Client` entry (full
   selection semantics + when it is/ isn't consulted), the integration guide Pattern 1 wiring (the
   `adapter-evm-core` option **and** the `adapter-evm/profiles/shared.ts` builder with
   `resolveMainnetRpcUrl` precedence) and Pattern 6 (an L2-bound runtime with `ensL1Client` present
   resolves on L1 with `coinType = toCoinType(boundChainId)` + `scopedToNetworkId`), and the example's
   L1-wiring block. The gating (`UNSUPPORTED_NETWORK` when absent; SF-2 parity) is stated everywhere
   it appears. SF-2's Docs "no L2→L1 fallback (not implemented)" note is now corrected to the
   delivered gated behavior.
2. **Mainnet-bound CCIP-Read provenance upgrade (D-V9 revised).** Documented as: every forward
   success (mainnet-bound CCIP-Read **and** the L1 cross-chain path) carries an `EnsProvenance` with
   a **truthful observed** `external`; SF-2's old `{ label:'ENS', external:false }` output is now the
   `EnsProvenance` superset. The API reference's boxed "SF-5 provenance upgrade" note makes explicit
   that the base `ResolutionProvenance` static type is unchanged while the runtime value is always
   the superset. SF-2's Docs `baseEnsProvenance` "external is always false on v1 / SF-5 will detect
   offchain" note is superseded and re-scoped to reverse-only.

## Out of Scope

- **`provenance.external` → v2-mechanism (registry / ccip-read) mapping** — Open Q1, deliberately
  **OPEN for UIKit SF-6**. The adapter surfaces only the raw observed `external`; the docs state
  plainly that interpreting it into a mechanism label is the consumer's call and pin no contract.
- **`EnsProvenance` on reverse (`resolveAddress`) results** — the reverse path keeps
  `baseEnsProvenance()` (SF-3, out of SF-5 scope); documented as an intentional asymmetry
  (`isEnsProvenance` → `false` on reverse), not a gap.
- **Namechain / ENS-L2 resolution** — cancelled (spec Plan Revision 1); documented as a non-goal
  (ENS v2 is L1-only). The `'namechain'` mechanism value is absent from the delivered enum.
- **CHANGELOG entry** — `adapter-evm-core/CHANGELOG.md` is **changeset-driven** (auto-generated
  per-PR by the release tooling), not hand-edited per sub-feature; SF-2/SF-3/SF-4 Docs all deferred
  the changelog to the joint commit/release point. Following that precedent, the changeset for the
  SF-1..SF-5 ENS work is authored at the commit/release point (dev's call), not here. The minor-bump
  framing (additive optional option, new exports, forward-success provenance shape change) is
  captured in the SF-5 Design's Change Plan for whoever writes that changeset.
- **Live / integration examples** (a real `test.offchaindemo.eth` CCIP round-trip; a real Base
  cross-chain resolve) — the runnable example uses the viem mainnet default transport like the SF-2
  example; a live CCIP-Read gateway hop and a real chain-scoped resolve belong to an integration
  tier (SF-5 Tests Out-of-Scope item #2 / Open Q2). The example's L1-wiring is shown as a
  configuration block rather than a hard-coded runnable Base resolve for that reason.
- **UIKit-side v2 UX** (SF-6 hooks/consumers) — a different repo/initiative; these docs stop at the
  adapter's exported surface.

## Known Limitations

- **Reverse-path gateway timeout mis-buckets (Finding 4, deliberate).** Offchain traversal is
  observed on the **forward path only** by design (D-V5: only `resolveVia` wraps `ccipRead` to flip
  `sawOffchain`). `resolveAddress` therefore passes `viaGateway: false` unconditionally to the SF-1
  mapper. Consequence: an ENSIP-19 **L2-primary reverse** resolution that fails with a gateway
  **timeout** is classified `RESOLUTION_TIMEOUT` rather than `EXTERNAL_GATEWAY_ERROR` — the
  gateway-precedence rule (SF-1 INV-10) can't fire without an observed gateway hop.
  `OffchainLookup`-*shaped* reverse failures are **unaffected**: they map to `EXTERNAL_GATEWAY_ERROR`
  via SF-1 mapper Row 3 regardless of `viaGateway`; only the timeout-shaped gateway failure loses the
  distinction. This is accepted SF-5 scope (forward-only observation), not a defect — reverse offchain
  observation would require threading a per-call observing client through `resolveAddress`, deferred
  as out of scope. The code comment at the `resolveAddress` catch site records the same.

## Dev Notes

- **Docs boundary honored.** No source, tests, invariants, design, or specify *content* was
  modified. The only edits outside `docs/` are the Build Status Matrix cell flip in `00-specify.md`
  (⏸️ → ⏳ on entry; ⏳ → ✅ at close) and the matrix `Last update` line — both owned by the Docs stage.
- **Extend, don't fork.** SF-5 is additive over SF-2/SF-3, so the docs were extended in place (the
  reader gets one coherent name-resolution doc set across v1 forward, reverse, and v2) rather than a
  parallel v2 doc tree. Every SF-2/SF-3 statement that SF-5 made stale (label-is-`'ENS'`,
  mainnet-bound-no-fallback, external-always-false-on-v1) was corrected at its source, not left to
  contradict the new sections.
- **Selection-before-shape documented as delivered (Code drift #1 / amended INV-22).** The API
  reference precedence table and integration-guide Pattern 6 both state the delivered ordering
  (client/network selection before name-shape), matching SF-2's own precedence — a both-invalid
  input returns `UNSUPPORTED_NETWORK`. This is the amended INV-22 (Invariants artifact already
  reworded 2026-07-04), so no doc-vs-invariant conflict remains to carry.
- **Verified against built types.** Rather than trust the design snippets, the five v2 export
  signatures were read from `dist/index.d.mts` and matched to the API-reference blocks. `tsc`/vitest
  were not re-run from Docs (no source touched); the delivered SF-5 Code + Tests stages already
  recorded green (tsc clean; 346 name-resolution / 1079 core / 149 adapter-evm). Per the directive,
  any verification uses `./node_modules/.bin/tsc` + vitest directly (overlay-revert hazard) — not
  needed here since Docs changed no compiled source.
- **Example runnability.** `ens-v2-resolve/resolve.ts` mirrors the proven `forward-resolve` example
  (same `as never` hand-built config, same `pnpm tsx` entry) so it is genuinely runnable given an
  RPC URL, with the L1 cross-chain path shown as a wiring block (a live Base resolve needs a
  name actually scoped to Base — integration tier).

## Open Questions

1. **Changeset authoring at commit/release (carried, non-blocking).** The SF-1..SF-5 ENS work is an
   uncommitted working tree; the `adapter-evm-core` minor-bump changeset (additive `ensL1Client`
   option + `EnsProvenance`/`isEnsProvenance`/builder exports + the forward-success provenance shape
   change) is best authored at the joint commit point by the dev, per SF-2/3/4 precedent. Flagged so
   it is not lost.
2. **Integration-tier example for the live CCIP-Read seam (carried from SF-5 Tests Open Q2).** A
   small integration example/probe on a live `test.offchaindemo.eth` (and a real chain-scoped Base
   resolve) would guard viem's internal `ccipRead.request` hook contract on a viem major bump. Out
   of scope for these unit-level docs; the home is whoever owns the adapter's integration tier.

## Step-Back Suggestion (Optional)

None. SF-5 was documented as delivered with no structural doc-vs-code conflict: the base
`ResolutionProvenance` contract is unchanged, the amended INV-22 (selection-before-shape) already
matches the delivered behavior, and the only SF-2 Docs statements SF-5 superseded were corrected
in place (label literal, mainnet-bound/no-fallback, external-always-false). No earlier-stage
artifact needs revision on account of the docs.
