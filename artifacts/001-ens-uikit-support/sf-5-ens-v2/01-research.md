---
stage: research
project: ens-uikit-support
sub_feature: sf-5-ens-v2
repo: openzeppelin-adapters
mode: extension
extends: packages/adapter-evm-core/src
status: draft
timestamp: 2026-07-04
author: aleksandr.pasevin
previous_stage: artifacts/001-ens-uikit-support/00-specify.md
tags: [ens, ensv2, name-resolution, ccip-read, namechain, cross-chain, coinType, ensip-11, ensip-19, ensip-23, viem, EnsProvenance, isEnsProvenance, capability, evm, adapter, service]
---

# SF-5 · ENS v2 (CCIP-Read / Namechain / cross-chain) + EnsProvenance + isEnsProvenance — Research Report

## Summary

`viem@2.44.4` (the repo-wide pin) is **already ENSv2-ready**: it is ≥ v2.35.0 (ENS's stated ENSv2-readiness floor for viem) and its bundled `mainnet` chain ships the new DAO-owned Universal Resolver proxy `0xeeeeeeee14d718c2b47d9923deab1335e144eeee` — the canonical ENSv2 entry point. The same `getEnsAddress` SF-2 already builds on covers CCIP-Read / offchain-gateway resolution (via `resolveWithGateways` + the client's built-in `ccipRead` machinery) and cross-chain / chain-specific addresses (via the `coinType` parameter + the top-level `toCoinType(chainId)` util, ENSIP-9/11/19). **Verdict: GO on CCIP-Read/offchain-gateway (reuse SF-2's pipeline, no new dep); GO-reframed on cross-chain (coinType, but with a load-bearing architectural wrinkle — see below); N/A on Namechain.**

**The headline finding is a spec drift: Namechain L2 was cancelled by ENS Labs in Feb–Mar 2026.** ENSv2 now deploys directly on Ethereum L1 mainnet — there is no Namechain L2 registry to resolve against, so the spec's SF-5 "Namechain L2 registry" scope item has no implementation target. The `via: '…' | 'namechain'` arm of the UIKit's illustrative `EnsProvenance` sketch is dead. What remains real for SF-5: (a) the ENSv2 Universal Resolver (transparent — viem picks it up from chain config), (b) CCIP-Read offchain/L2 resolution (unchanged ERC-3668 mechanism, already exercised incidentally by SF-2), and (c) chain-scoped addresses via `coinType`.

The enumerated gaps `viem` does **not** close, and which SF-5 Design must: **(G1)** no offchain-traversal signal on the return — deriving a truthful `EnsProvenance.external` requires intercepting the client's `ccipRead.request` hook; **(G2)** cross-chain resolution must run on an **L1 mainnet client** (ENS resolution "always starts on Ethereum Mainnet"), which is in tension with SF-2's D-A single-client-per-bound-network injection; **(G3)** `scopedToNetworkId` and the coinType↔`networkId` mapping are SF-5's to construct — viem emits neither; **(G4)** `version: 'v1' | 'v2'` and the resolution mechanism are largely **not observable** from viem's `Address | null` return; **(G5)** Namechain scope is obsolete. Open Q2 (`ResolverError` offchain reclassification) is resolved below against the ENSIP-23 error semantics: **do not reclassify** — keep `ResolverError → ADAPTER_ERROR`; the gateway-failure signal is `HttpError`, already mapped. Open Q3 (`provenance.external` → v2-mechanism boundary) is left OPEN for the UIKit dev's SF-6 Design, per the spec directive.

---

## Existing TypeScript Implementations

### `viem@2.44.4` — the incumbent, already a dependency, already ENSv2-ready

- **Root:** [`wevm/viem@2.44.4`](https://github.com/wevm/viem/tree/viem@2.44.4). ENS actions `src/actions/ens/`, ENS utils `src/utils/ens/`, CCIP machinery `src/utils/ccip.ts`. Import surface: `viem` (top-level) + `viem/ens`.
- **ENSv2 readiness confirmed two ways** (both verified against the installed package, not docs alone):
  1. **Version floor.** ENS's readiness matrix states **viem `>= v2.35.0`** is ENSv2-ready. The repo pins `2.44.4` — clears it. (Other libraries for cross-reference: ensjs `>= 4.2.3`, ethers `>= 6.17.0`, web3.py `>= 7.16.0`.)
  2. **The new Universal Resolver is baked into the chain config.** `viem@2.44.4`'s `chains/definitions/mainnet.js` sets `contracts.ensUniversalResolver.address = '0xeeeeeeee14d718c2b47d9923deab1335e144eeee'` (blockCreated `23085558`) — the canonical DAO-owned ENSv2 UR upgradable proxy. So on mainnet SF-5 needs **no `universalResolverAddress` override**; SF-2's injected client already targets the ENSv2 UR.
- **Forward action — `getEnsAddress`** ([`src/actions/ens/getEnsAddress.ts`](https://github.com/wevm/viem/blob/viem@2.44.4/src/actions/ens/getEnsAddress.ts)), verified from installed `_esm/actions/ens/getEnsAddress.js`. The v2-relevant parameters beyond SF-2's usage:

  ```ts
  getEnsAddress(client, {
    name: string,                         // caller-normalized (ENSIP-15 / UTS-46)
    coinType?: number,                    // ENSIP-9/11 chain-specific address (see toCoinType)
    gatewayUrls?: string[],               // CCIP-Read batch-gateway override; default [localBatchGatewayUrl]
    strict?: boolean,                     // SF-2 mandates strict:true (INV-7)
    universalResolverAddress?: Address,   // default: chain.contracts.ensUniversalResolver.address
  }): Promise<Address | null>
  ```

  The v2 path is **the same code path SF-2 uses** — `readContract('resolveWithGateways', [dnsEncodedName, addrCalldata, gatewayUrls])` on the UR, with `readContract`'s EIP-3668 offchain-lookup machinery following any `OffchainLookup` revert to the gateway. When `coinType != null`, the calldata becomes `addr(namehash, coinType)` (ENSIP-9/11 chain-specific `addr`); otherwise `addr(namehash)` (ETH, coinType 60). **No v2-specific branch exists or is needed** — ENSv2 resolution is the same UR + CCIP-Read shape, only pointed at the new UR proxy.

- **`toCoinType`** — **top-level export** (`export { toCoinType } from './utils/ens/toCoinType.js'`, verified in `_esm/index.js`). ENSIP-9/11 EVM coinType derivation:

  ```ts
  const SLIP44_MSB = 0x80000000;
  export function toCoinType(chainId: number): bigint {
    if (chainId === 1) return 60n;                              // mainnet → ETH
    if (chainId >= SLIP44_MSB || chainId < 0) throw new EnsInvalidChainIdError({ chainId });
    return BigInt((0x80000000 | chainId) >>> 0);               // e.g. Base 8453 → 2147492101n
  }
  ```

  This is the forward chainId→coinType map. Note there is **no** exported `coinType → chainId` inverse in `viem@2.44.4`; SF-5 needs the inverse (coinType → repo `networkId`) itself for `scopedToNetworkId` — it's a trivial `coinType & ~0x80000000` for the EVM range, plus the `60n → 1` special case (G3).

- **`ccipRead` client hook** — verified in `_esm/utils/ccip.js`: `const { ccipRead } = client; const ccipRequest_ = ccipRead && typeof ccipRead?.request === 'function' ? ccipRead.request : ccipRequest`. The client's `ccipRead.request` is invoked **only when an `OffchainLookup` is actually followed**. This is the one seam that lets SF-5 observe "did resolution go offchain?" — inject a wrapping `ccipRead.request` that records a per-call flag then delegates to viem's default `ccipRequest`. This is how `EnsProvenance.external` becomes truthful (G1). Set `ccipRead: false` to disable offchain entirely (not wanted here).

- **`isNullUniversalResolverError`** ([`utils/ens/errors.ts`](https://github.com/wevm/viem/blob/viem@2.44.4/src/utils/ens/errors.ts)) — the 6 UR `errorName`s (`HttpError`, `ResolverError`, `ResolverNotContract`, `ResolverNotFound`, `ReverseAddressMismatch`, `UnsupportedResolverProfile`); under `strict:true` these throw and SF-2/SF-5 classify them. **These are the ENSv2 UR errors** (ENSIP-23) — SF-2 already validated the surface; SF-5 inherits it unchanged and adds the offchain-context (`viaGateway`) discipline.

- **Limitations / gaps** (Gap Analysis): `Address | null` return carries no offchain/mechanism/version/scope signal (G1, G3, G4); cross-chain needs an L1 client, not the bound-network client (G2).

### `@ensdomains/ensjs` v4 (`>= 4.2.3` is the ENSv2-ready line)

- **Root:** [`ensdomains/ensjs`](https://github.com/ensdomains/ensjs). ENS-team-maintained, itself `viem`-based. Its v2 story is the same UR + CCIP-Read; the readiness floor is `4.2.3`. Adds records/text/batch machinery SF-5 does not need. **Same conclusion as SF-2: not recommended** — a second ENS dependency + its own `viem` peer for coverage SF-5 gets from the `viem` already pinned. Retain as the documented fallback if `viem`'s ENS actions ever regress.

### `ox` (`ox/Ens`)

- Lower-level primitives `viem` delegates to (`normalize`, `namehash`, coinType encoding). Transitively present. No reason to reach past `viem/ens` for SF-5.

### Hand-rolled v2 / Namechain client

- **Moot.** There is no Namechain to build a client for (cancelled — see Ecosystem Needs). A hand-rolled CCIP-Read/EIP-3668 client or direct UR ABI calls remain **rejected** per the spec's "prefer `viem`" directive — `viem` covers the entire read path. Any hand-rolled part needs explicit justification; none exists.

---

## Cross-Ecosystem Implementations

### Resolution-Engine Decision Matrix (SF-5 axes)

SF-2's matrix already picked `viem` for the forward engine; SF-5 re-scores on the axes that matter for v2 (cross-chain coverage, offchain-signal fidelity, ENSv2-readiness). Axes 1–5 (5 = best).

| Engine | New dep? | v2 read coverage (CCIP-Read + coinType + new UR) | Offchain/mechanism-signal fidelity | ENSv2-ready in pinned ver | Runtime footprint | Score |
|---|---|---|---|---|---|---|
| **`viem` `getEnsAddress` + `toCoinType` + `ccipRead` hook** (recommended) | **No** (`2.44.4`) | 5 — new UR baked in, `coinType` + CCIP-Read built in | 3 — nothing on the return; `ccipRead.request` interception recovers `external` (G1) | 5 — `2.44.4 ≥ 2.35.0`, UR proxy in chain config | 5 | **21** |
| `@ensdomains/ensjs` v4 (`≥4.2.3`) | Yes (+ own `viem`) | 5 — same UR + richer records | 4 — richer decoded results, still no first-class "was offchain" flag | 5 | 3 | 17 |
| `ox/Ens` + hand-rolled UR reads | No (transitive) | 2 — re-build CCIP-Read/coinType wiring | 5 — you own every signal, at full cost/risk | 3 | 4 | 14 |
| Hand-rolled Namechain L2 client | — | **N/A — no Namechain** | — | — | — | — |

**Winner: `viem`, unchanged from SF-2.** It dominates on zero-new-dep + complete v2 read coverage + ENSv2-readiness in the exact pinned version, and the one axis it loses (no mechanism signal on the return) is closable via the `ccipRead.request` seam (G1). **Fallback:** `@ensdomains/ensjs@≥4.2.3` (same UR semantics, ENS-team-maintained), then `ox/Ens` primitives.

### Distribution & Adoption Story

Unchanged from SF-2: SF-5 is an **additive library capability**, not a deployed service — it ships inside `@openzeppelin/adapter-evm-core` (npm, workspace-linked in dev). SF-5 adds the `EnsProvenance` type + `isEnsProvenance` guard exports and (per the provenance/coinType work) possibly a v2-aware client-builder in the `adapter-evm` registration layer. Purely additive ⇒ **minor** bump of `adapter-evm-core` and `adapter-evm`. The one version-coupling discipline carries and sharpens: the class→code table and the UR-proxy address are pinned to `viem@2.44.4`; a `viem` major bump re-validates both the error table and ENSv2 UR wiring.

*(Operational Cost Sketch omitted — in-process library, no team-run infra. The only "gateway" cost is the end user's CCIP-Read gateway, configured by the consumer on the `viem` client, not this repo.)*

---

## Ecosystem Needs

### ENSv2 in 2026 — the actual landscape (this is the load-bearing context)

- **Namechain L2 was cancelled (Feb–Mar 2026).** ENS Labs scrapped the planned Namechain L2 and moved ENSv2 **fully to Ethereum L1 mainnet**, citing a ~99% reduction in L1 registration gas (Fusaka + gas-limit increases) that made a cost-saving L2 unnecessary. ENSv2 core features — a new registry (every `.eth` name gets its own registry) and multi-chain resolution — remain, now anchored on L1. (Sources below.) **Consequence for SF-5:** the spec's "Namechain L2 registry" resolution target does not exist; there is nothing to implement for it. This is the primary drift note (see Dev Notes / Open Questions).
- **Resolution still starts on L1.** Per ENS's own readiness guide: *"Even though ENSv2 is designed for multi-chain, all resolution still starts on Ethereum Mainnet. There is a new Universal Resolver that acts as the canonical entry point… an upgradable proxy contract, owned by the ENS DAO, so its address won't change."* Being ENSv2-ready = pointing at the new UR, which *"updating to the latest version of your supported web3 library handles automatically."* `viem@2.44.4` already does (verified above).
- **CCIP-Read is the offchain/L2 mechanism, unchanged (ERC-3668).** *"ENSv1 already supports delegating resolution… to an L2 or completely offchain using CCIP Read (ERC-3668). All the libraries… implement CCIP Read."* SF-2 already traverses it incidentally; SF-5 makes it first-class (explicit `viaGateway`, observed `external`).
- **Multichain requires an L1 client + coinType.** *"Even if your application only operates on an L2 like Base, ENS resolution always starts on Ethereum Mainnet. This means you need to configure an L1 client alongside your L2 chain."* The canonical pattern (from ENS docs):

  ```ts
  import { createPublicClient, http, toCoinType } from 'viem'
  import { base, mainnet } from 'viem/chains'
  const mainnetClient = createPublicClient({ chain: mainnet, transport: http() })
  const baseAddress = await mainnetClient.getEnsAddress({
    name: 'test.ses.eth',
    coinType: toCoinType(base.id),          // request the Base-scoped address
  })
  ```

  A name can carry a **different address per chain** (`test.ses.eth` → one addr on mainnet, another on Base). The app *"must always request the address for the correct chain."* This is the substance of the spec's "chain-scoped v2 address" edge case — and it drives G2/G3.

### What the consumer (UIKit SF-6) needs from SF-5

- The same `resolveName(name) → ResolutionResult<ResolvedAddress>` surface, but on a v2/CCIP-Read name the `provenance` narrows to `EnsProvenance` under the **exported `isEnsProvenance` guard** (SC-005), carries the v2 discriminators, and a chain-scoped result carries `scopedToNetworkId` (spec SF-5 scenario 1, edge case "chain-scoped v2 addresses").
- A v2 gateway failure surfaces as **`EXTERNAL_GATEWAY_ERROR`, distinct from `NAME_NOT_FOUND`, never a silent fallback** (SF-5 scenario 2, spec Edge Cases). The mapping already exists in SF-1/SF-2 (`HttpError`/`OffchainLookup*` → `EXTERNAL_GATEWAY_ERROR` unconditional); SF-5 adds `viaGateway:true` context so an ambiguous `TimeoutError`/`HttpRequestError` on the offchain path also dominates to gateway (SF-1 INV-10).
- **Narrowing via the guard, never by string-matching `label`.** The base `ResolutionProvenance.label` is explicitly a display string, "MUST NOT branch on its value" (UIKit SF-1 types). `isEnsProvenance` is the sole sanctioned narrowing path (SC-005).

### Common headless pattern this matches

SF-5 slots into the exact shape SF-2 established: the `src/name-resolution/` domain dir, the thin `capabilities/name-resolution.ts` factory, SF-1's mapper/constructors, and `baseEnsProvenance()` as the single provenance construction site — SF-2 explicitly left `provenance.ts` as "the seam SF-5's `EnsProvenance` extension slots into." SF-5 is additive-on-a-seam, not a rewrite.

---

## Gap Analysis

`viem` covers the v2 **read mechanism** completely; the gaps are all about **signals viem doesn't surface** and **which client resolves cross-chain**. G1 and G2 are the load-bearing ones.

| # | Gap | Severity | What SF-5 Design must do |
|---|-----|----------|--------------------------|
| **G1** | **No offchain-traversal signal on the return.** `getEnsAddress` returns `Address \| null` — it never says whether an `OffchainLookup` (CCIP-Read) was followed. `EnsProvenance.external` (and any `via: 'ccip-read'` discriminator) cannot be read from the result. | **High** — `external` is a core provenance field and the v2 UX marker. | Derive it by wrapping the client's **`ccipRead.request`** hook to set a per-resolution flag when invoked, then delegate to viem's default `ccipRequest`. Requires per-call correlation (the client is shared/borrowed — SF-2 INV-15); a fresh short-lived client per resolve, or a call-scoped flag keyed by an `AbortController`/closure, are the candidate designs. **Do NOT infer `external` from the name/TLD** — only the actual lookup is truthful. |
| **G2** | **Cross-chain resolution must run on an L1 mainnet client, not the bound-network client.** ENS resolution "always starts on Ethereum Mainnet"; SF-2's D-A injects one client built from the *bound* network's `config.viemChain`. On an L2-bound runtime that client has no UR (SF-2's D-B → `UNSUPPORTED_NETWORK`), so a Base-scoped name would be reported unsupported even though it resolves fine via L1 + `coinType`. | **High** — determines whether cross-chain resolution works at all, and interacts with SF-2's `UNSUPPORTED_NETWORK` gate. | Decide the client model: (a) always resolve via an **L1 mainnet client** (injected alongside/instead of the bound client) and use `coinType = toCoinType(targetChainId)` to select the chain-scoped address; or (b) keep per-network clients and only offer chain-scoping when the bound network *is* L1. Recommendation leans (a) — it matches ENS's canonical pattern and is the only way an L2-bound consumer resolves at all. This is the deepest SF-5 design decision; flag its interaction with SF-2 D-A/D-B explicitly. |
| **G3** | **`scopedToNetworkId` + coinType↔networkId mapping is SF-5's to build.** viem gives `toCoinType(chainId)` (forward) but no inverse and no `scopedToNetworkId`. The result address for a `coinType` request is chain-scoped, but viem doesn't label it. | **Medium** | When a resolution is made for a non-default `coinType`, construct `scopedToNetworkId` from the target network's repo `networkId` (spec assumption: `NetworkConfig.networkId` namespace; CAIP-2 only if forced → drift note). Inverse of `toCoinType`: `coinType === 60n → chainId 1`, else `Number(coinType & 0x7fffffff)`; then map chainId → repo `networkId`. Set `scopedToNetworkId` **only** for chain-scoped requests (base ETH/mainnet result stays unscoped, per SF-2 INV-5). |
| **G4** | **`version: 'v1' \| 'v2'` and resolution mechanism are largely not observable.** The new UR is the single canonical entry point for **both** v1 and v2 names, with an identical resolution flow. viem's `Address \| null` cannot tell you whether a name is "v1" or "v2", nor (beyond G1's offchain flag) the precise mechanism. The UIKit sketch's `version: 'v1'\|'v2'` + `via: 'registry'\|'ccip-read'\|'namechain'` is **not fully derivable**. | **Medium** — shapes what `EnsProvenance` can honestly carry. | Design `EnsProvenance` around **observable** facts only: `external` (from G1), `scopedToNetworkId` (from G3), and a `via` restricted to what's distinguishable (`'onchain'` vs `'ccip-read'` — i.e. the offchain flag). **Drop `'namechain'`** (dead). Treat `version` cautiously — if not reliably observable, either omit it or set a conservative default; do **not** fabricate a v1/v2 claim the resolution can't back. The exact enum is a Design call; the research constraint is "only encode what's observable." |
| **G5** | **The spec's "Namechain L2 registry" scope is obsolete.** Namechain was cancelled; there is no L2 registry to read. | **High (scope)** | Reframe SF-5's scope to "ENSv2 (new UR, on L1) + CCIP-Read offchain/L2 resolution + chain-scoped addresses." Namechain becomes a documented non-target. Surface as a spec drift note to the Orchestrator (the spec post-dates the cancellation yet still lists Namechain — reconcile). |

### What exists but is incomplete
`viem` resolves v2/CCIP-Read/chain-scoped names correctly and is ENSv2-ready, but returns a bare `Address | null` with **no provenance metadata** — every SF-5 provenance field (`external`, `scopedToNetworkId`, `via`, `version`) must be synthesized by the adapter from what it *requested* and what it *observed* (the `ccipRead.request` flag), not read from the result.

### What's missing entirely
An "was this resolved offchain?" signal on the public return (G1) and a coinType-inverse / `scopedToNetworkId` builder (G3) — both small, both owned by this repo. And an L1-client resolution model for cross-chain (G2) — an architectural decision, not a viem gap.

### Pitfalls
- **Silent fallback (the spec's named hazard).** Under `strict:true` a gateway failure is `HttpError` → `EXTERNAL_GATEWAY_ERROR` (already mapped); the pitfall is any code path that catches a v2 failure and retries a v1/on-chain lookup, presenting a stale success. SF-5 must never fall back silently (SF-5 scenario 2). The `strict:true` + `viaGateway:true` discipline prevents it.
- **Resolving cross-chain on the wrong client.** Using the bound L2 client instead of L1 (G2) yields spurious `UNSUPPORTED_NETWORK` or wrong results — the exact "bind to the wrong chain" fund hazard the spec's stakes rating names.
- **Inferring `external` from the name.** Tempting (e.g. "`.cb.id` ⇒ offchain") and wrong — only the actual `ccipRead.request` invocation is truthful (G1).
- **Trusting the UIKit sketch's enum.** `version`/`via`/`'namechain'` predate the cancellation and the observability constraint; treat as illustrative, not a contract (spec Dev Note: the sketch is not delivered by UIKit SF-1).

---

## Existing Codebase Analysis (Extension Mode)

- **Seam is already staked out by SF-2.** `src/name-resolution/provenance.ts` exists with `baseEnsProvenance()` — SF-2 built it as "a single, obvious slot for SF-5's `EnsProvenance` extension to grow into … one construction site for the provenance object across v1 and v2." SF-5 adds `EnsProvenance` + `isEnsProvenance` (new `src/name-resolution/ens-provenance.ts` or extend `provenance.ts`) and a v2-aware provenance builder; exports both from the domain barrel + `src/index.ts` (SF-2's barrel already anticipates "SF-5 appends `EnsProvenance` / `isEnsProvenance`", per SF-1 Code Draft Modules table).
- **`resolveName` extension points (SF-2 service.ts).** SF-2's `resolveName` classifies via a fixed precedence and constructs `provenance: baseEnsProvenance()` on success, with `viaGateway:false` hardcoded on the `default` mapper ctx and a comment "SF-5 sets true." SF-5 threads: (i) an optional `coinType` (for chain-scoped resolution), (ii) the observed offchain flag into a v2 `EnsProvenance` builder, (iii) `viaGateway:true` into the mapper ctx on the offchain path. SF-2 INV-5/INV-10 explicitly reserved this.
- **Error mapping is done — SF-5 changes nothing in SF-1.** `HttpError` + `OffchainLookup*` → `EXTERNAL_GATEWAY_ERROR` (unconditional); `TimeoutError`/`HttpRequestError` with `viaGateway:true` → `EXTERNAL_GATEWAY_ERROR` (SF-1 INV-10). SF-5 supplies `viaGateway:true`; it adds **no mapper row** and resolves `ResolverError` by *not* changing its mapping (Open Q2 below).
- **Client injection (D-A) is the pressure point.** SF-2's registration in `adapter-evm/profiles/shared.ts` builds one client per bound network (`createEvmPublicClient(resolveRpcUrl(config), config.viemChain)`). SF-2 foresaw this: *"If SF-5 requires custom gateway/`ccipRead` config, it introduces a dedicated ENS client builder here — SF-2 does not."* G1 (ccipRead interception) and G2 (L1 client) both cash in that reservation — SF-5 likely introduces a v2-aware ENS client builder (L1 mainnet + wrapped `ccipRead.request`) in the registration layer.
- **Helpers to reuse:** `shared/revert-info.ts` (`extractRevertInfo`, `BaseError`), `isValidEvmAddress`, `asTypedEvmNetworkConfig`, `guardRuntimeCapability` — all as SF-2 uses them.
- **Invariants not to break:** additive/optional at the runtime-map level (SC-006); borrowed-client no-dispose (SF-2 INV-15) — note the ccipRead-interception design must not violate this (a wrapped client SF-5 *builds* it may own, distinct from the borrowed one — a Design call); statelessness / determinism (SF-2 INV-13) for SF-4's harness; user-safe `label` (SF-2 INV-5, SF-4 allowlist) — `EnsProvenance.label` stays a curated literal (e.g. `'ENS'` / `'ENS via external gateway'`), never a gateway URL.

---

## Recommendation

- **Verdict: BUILD on `viem` (GO), reusing SF-2's pipeline.** The spec's binding "prefer `viem`" go/no-go resolves **GO** for CCIP-Read/offchain-gateway (the ENSv2 UR + `resolveWithGateways` + built-in `ccipRead`, ENSv2-ready in the pinned `2.44.4`) and **GO** for cross-chain/chain-scoped (`coinType` + `toCoinType`, ENSIP-9/11/19) — with the caveat that cross-chain requires an L1 client (G2). **Namechain is N/A** — cancelled; nothing to build. Hand-rolling any v2 read path is unjustified.

- **viem v2 go/no-go verdict (required output):**
  - **CCIP-Read / offchain-gateway: GO.** Fully covered, no new dep, ENSv2-ready. Gaps: G1 (no `external` signal on return — recover via `ccipRead.request` interception).
  - **Cross-chain / chain-scoped: GO (reframed).** Covered via `coinType`, but resolution must run on an **L1 mainnet client** (G2) and SF-5 must synthesize `scopedToNetworkId` (G3).
  - **Namechain: N/A.** Cancelled Feb–Mar 2026; no L2 registry target. (G5 — spec drift.)

- **Recommended approach.** Extend SF-2's `resolveName` (do not fork it): accept an optional target-chain input; for chain-scoped requests, resolve via an **L1 mainnet `PublicClient`** with `coinType: toCoinType(targetChainId)`; wrap that client's `ccipRead.request` to observe offchain traversal; build an `EnsProvenance` from observable facts only — `external` (observed), `scopedToNetworkId` (synthesized from the requested coinType, G3), and a conservative `via`/`version` (G4, drop `'namechain'`); pass `viaGateway:true` to the mapper on the offchain path. Export `EnsProvenance` + `isEnsProvenance` from `@openzeppelin/adapter-evm-core`. Keep `ResolverError → ADAPTER_ERROR` unchanged (Open Q2).

- **Key design considerations (for the Design stage):**
  1. **Which client resolves cross-chain (G2).** The single most consequential decision — L1-always vs bound-network. Recommend L1-always (matches ENS canonical pattern; the only model under which an L2-bound consumer resolves at all). Reconcile with SF-2 D-A/D-B and INV-15 (client ownership).
  2. **How `external` is observed (G1).** The `ccipRead.request` interception + per-call correlation. Decide the client-lifecycle model (fresh per-resolve vs shared-with-call-scoped-flag) without breaking SF-2 INV-15.
  3. **What `EnsProvenance` can honestly carry (G4).** Encode only observable facts. Drop `'namechain'`. Be conservative on `version`. `isEnsProvenance` is the guard (check a discriminant field's presence — the sketch checks `typeof p.version === 'string'`; pick a field SF-5 actually always sets).
  4. **`scopedToNetworkId` construction (G3).** coinType-inverse → repo `networkId`; scope only chain-scoped results; CAIP-2 only as a drift note.
  5. **Never silent-fallback (spec).** `strict:true` + `viaGateway:true`; a v2 gateway failure is `EXTERNAL_GATEWAY_ERROR`, full stop.

- **Risks.**
  - *Spec/reality mismatch (Namechain).* Building to the letter of the spec would waste effort on a dead L2. Mitigation: the G5 drift note; Design reframes scope. **Confirm with the Orchestrator before Design.**
  - *G2 architectural churn.* An L1-always client model touches SF-2's registration/injection (D-A) and its `UNSUPPORTED_NETWORK` gate (D-B). If it turns out to require re-signing SF-2's factory options, that is a candidate step-back to SF-2 Design — flag early. (Likely additive: a second, ENS-dedicated client, leaving SF-2's bound client intact.)
  - *`ccipRead` interception fragility.* Wrapping an internal client hook couples SF-5 to viem's `ccipRead.request` contract; pin to `viem@2.44.4` and add a test that fails if the hook stops firing on a known offchain name (`test.offchaindemo.eth`).
  - *viem coupling.* The ENSv2 UR proxy address + error surface are `viem@2.44.4`; a major bump re-validates both. Mitigation: version-tying comment (as SF-2 does).

---

## Out of Scope

- **Namechain L2 resolution** — cancelled by ENS Labs (Feb–Mar 2026); no implementation target exists. Documented as a non-target, not built. (G5.)
- **The `provenance.external` → v2-mechanism (registry / ccip-read) semantic boundary** — deliberately LEFT OPEN for the UIKit dev's SF-6 Design (spec Open Q1 / carried Open Q3). SF-5 must not pin it; if a concrete SF-5 implementation forces a provisional choice, surface it as a drift note to the UIKit initiative rather than committing unilaterally.
- **Reverse resolution / `resolveAddress` / `forwardVerified` / avatar** — SF-3. (ENSIP-19 `reverse()` and chain-specific primary names are SF-3 territory; SF-5 touches only forward + chain-scoped `addr`.)
- **The conformance harness** — SF-4.
- **The `NameResolutionError` union + base value types (incl. `ResolutionProvenance`)** — owned by UIKit SF-1 (`@openzeppelin/ui-types`); SF-5 *extends* `ResolutionProvenance` via `EnsProvenance` and imports the union; it modifies neither.
- **The SF-1 error-mapper internals** — SF-5 supplies `viaGateway:true` context and changes no mapper row (Open Q2 resolves to "no change").
- **`@ensdomains/ensjs` records/batch, `ox` primitives** — not needed; documented fallbacks only.
- **Non-EVM name systems** (SNS, Unstoppable, `.sui`, Aptos) — follow-up initiative; non-EVM adapters omit the capability (SC-006).
- **Text records / avatars / content-hash for v2** — not part of forward chain-scoped address resolution.

## Dev Notes

- **PRIMARY DRIFT — Namechain cancelled; spec SF-5 scope is partly obsolete.** ENS Labs scrapped Namechain L2 in Feb–Mar 2026; ENSv2 deploys on Ethereum L1 with a new DAO-owned Universal Resolver proxy (`0xeeee…eeee`, in `viem@2.44.4`). The spec (dated 2026-07-03, *after* the cancellation) still lists "Namechain L2 registry" as an SF-5 target and the DAG/US-4 reference it. **Route to the Orchestrator:** SF-5's real scope is ENSv2-UR + CCIP-Read + chain-scoped (coinType) resolution; Namechain is a non-target. Recommend a spec Plan-Revision entry and reconciling US-4 / SF-5 wording. This does not block SF-5 Design (the v2 read path is unchanged), but the `EnsProvenance` enum and any "Namechain" language must be updated.

- **viem v2 evidence (verified against installed `2.44.4`, not just docs):** mainnet `ensUniversalResolver = 0xeeeeeeee14d718c2b47d9923deab1335e144eeee` (ENSv2 UR proxy); `toCoinType` is a top-level export; `getEnsAddress` accepts `coinType`/`gatewayUrls`/`strict`/`universalResolverAddress`; `ccipRead.request` is invoked only on an actual OffchainLookup (`utils/ccip.js`). ENS readiness floor for viem is `>= 2.35.0` — the pin clears it.

- **ENSIP-23 UR error semantics (authoritative — from the ENS docs, interface selector `0xcd191b34`):**
  - *Resolution errors:* no resolver → `ResolverNotFound (0x77209fe8)`; resolver not a contract → `ResolverNotContract (0x1e9535f2)`; CCIP-Read required but not handled by client → `OffchainLookup`; **CCIP-Read handled but the OffchainLookup FAILED → `HttpError (0x01800152)`**.
  - *Resolver errors:* called function not implemented → `UnsupportedResolverProfile (0x7b1c461b)`; **called function reverted → `ResolverError (0x95c0c752)`**.
  - Under viem's smart-multicall path, resolver errors are returned per-call (decoded), not thrown — but SF-2/SF-5 use single-profile `addr` resolution, where they throw under `strict:true`.

- **Open Q2 RESOLVED — `ResolverError` is NOT reclassified to `EXTERNAL_GATEWAY_ERROR`.** Per ENSIP-23, the gateway/offchain *failure* is precisely `HttpError` (the OffchainLookup failed) — already mapped to `EXTERNAL_GATEWAY_ERROR` unconditionally (SF-2 Part B / SF-1). `ResolverError` means "the resolver's called function reverted" — a resolver-application-level revert that occurs *after* a successful gateway round-trip (or purely on-chain), and is **origin-ambiguous** (viem exposes only `errorName === 'ResolverError'` with opaque inner `errorData: bytes`). Reclassifying it to gateway would (a) mis-signal a deterministic resolver revert as a transient gateway outage → pointless consumer retry, and (b) blur the "gateway unreachable vs X" boundary the spec's Edge Cases and SF-5 scenario 2 demand kept sharp. **Decision:** keep `ResolverError → ADAPTER_ERROR` (cause preserved); the offchain-context `viaGateway:true` affects only the ambiguous `TimeoutError`/`HttpRequestError` disambiguation (SF-1 INV-10), never `ResolverError`. *Optional future refinement (NOT committed):* decode `ResolverError.errorData` and, if its inner selector is itself an HTTP/offchain error, reclassify — but viem does not decode it and this is speculative; leave as a noted possibility for a later slice, not an SF-5 commitment.

- **Open Q3 LEFT OPEN (per spec directive).** The mapping of `provenance.external:boolean` onto the v2 mechanisms (registry / ccip-read) is the UIKit dev's SF-6 Design decision. SF-5 records the *observable* facts (G1: `external` is truthful only via `ccipRead.request` observation) and stops there — it does not pin whether a given mechanism implies `external`. Carried below.

- **`EnsProvenance` sketch is stale** (UIKit SF-1 `02-design.md`): `via: 'registry' | 'ccip-read' | 'namechain'` + `version: 'v1' | 'v2'` + `isEnsProvenance` checking `typeof p.version === 'string'`. `'namechain'` is dead (G5); `version` is largely unobservable (G4). Treat as illustrative only (spec Dev Note: sketch not delivered by UIKit SF-1). The real `EnsProvenance` is SF-5 Design's, constrained to observable facts.

- **Verification test hooks for later stages** (from ENS's readiness guide): UR-support probe — resolve `ur.integration-tests.eth` → `0x2222…2222` (a `0x1111…1111` means the old UR); CCIP-Read probe — resolve `test.offchaindemo.eth` → `0x779981590E7Ccc0CFAe8040Ce7151324747cDb97`; chain-scoped probe — `test.ses.eth` resolves to different addresses for mainnet vs Base via `coinType`. SF-5 Tests should use these against a fork/mainnet.

## Open Questions

1. **[CARRIED — LEFT OPEN for UIKit SF-6, per spec] `provenance.external` → v2-mechanism boundary.** Whether/how `external:boolean` maps onto registry vs ccip-read is the UIKit dev's SF-6 Design call; SF-5 must not pin it. SF-5 surfaces only the observable `external` signal (G1). If an SF-5 implementation is forced into a provisional choice, raise it as a drift note to the UIKit initiative, do not commit it.

2. **[FOR SF-5 DESIGN] Which client backs cross-chain resolution (G2)?** L1-mainnet-always (recommended; ENS canonical pattern) vs bound-network (chain-scoping only when bound to L1). Decide the client-lifecycle/ownership model so the `ccipRead.request` interception (G1) and cross-chain L1 client don't violate SF-2 INV-15 (borrowed-client no-dispose). May touch SF-2's D-A registration — assess step-back risk early (likely additive: an ENS-dedicated L1 client alongside the bound one).

3. **[FOR SF-5 DESIGN] What can `EnsProvenance` honestly carry (G4)?** Given the new UR is one entry point for v1+v2 and viem returns only `Address | null`, decide the observable field set (`external`, `scopedToNetworkId`, a distinguishable `via`; whether `version` is includable at all). Pick the `isEnsProvenance` discriminant to be a field SF-5 *always* sets. Do not encode a v1/v2 or mechanism claim the resolution cannot substantiate.

4. **[DRIFT — FOR ORCHESTRATOR] Reconcile the spec's Namechain scope (G5).** SF-5's spec scope, US-4, and the DAG name "Namechain L2 registry," which no longer exists. Recommend a Plan-Revision entry reframing SF-5 to ENSv2-UR + CCIP-Read + chain-scoped resolution.

## Sources

- ENS Labs scraps Namechain L2, ENSv2 to Ethereum L1: [The Block](https://www.theblock.co/post/388932/ens-labs-scraps-namechain-l2-shifts-ensv2-fully-ethereum-mainnet), [Cryptopolitan](https://www.cryptopolitan.com/ensv2-to-launch-exclusively-on-ethereum/), [BlockEden](https://blockeden.xyz/blog/2026/03/11/ensv2-alpha-launch-ethereum-name-service-l2-cross-chain-identity/)
- ENSv2 readiness (Universal Resolver, CCIP-Read, multichain/coinType, library version floors incl. viem ≥ 2.35.0): [ENS Docs — Preparing for ENSv2](https://docs.ens.domains/web/ensv2-readiness/)
- Universal Resolver error surface (ENSIP-23; `HttpError`/`ResolverError`/`UnsupportedResolverProfile` semantics + selectors): [ENS Docs — ENSIP-23](https://docs.ens.domains/ensip/23/)
- viem `getEnsAddress` (`coinType`/`gatewayUrls`/`strict`/`universalResolverAddress`, ENSIP-9): [viem docs](https://viem.sh/docs/ens/actions/getEnsAddress) · installed `viem@2.44.4` sources (`_esm/actions/ens/getEnsAddress.js`, `utils/ens/toCoinType.js`, `utils/ens/errors.js`, `utils/ccip.js`, `chains/definitions/mainnet.js`)
