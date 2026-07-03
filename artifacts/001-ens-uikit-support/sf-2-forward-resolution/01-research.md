---
stage: research
project: ens-uikit-support
sub_feature: sf-2-forward-resolution
repo: openzeppelin-adapters
mode: extension
extends: packages/adapter-evm-core/src
status: draft
timestamp: 2026-07-03
author: aleksandr.pasevin
previous_stage: artifacts/001-ens-uikit-support/00-specify.md
tags: [ens, name-resolution, forward-resolution, viem, isValidName, capability, evm, adapter, service]
---

# SF-2 · Forward resolution + capability scaffold + isValidName — Research Report

## Summary

`viem@2.44.4` (the version pinned repo-wide via the `pnpm-workspace.yaml` override) already ships a complete, production-grade ENS **forward** resolver — `getEnsAddress`, backed by the on-chain **Universal Resolver** (`resolveWithGateways`), with ENSIP-10 wildcard resolution and CCIP-Read gateway handling built in. **Verdict: GO — build SF-2 on `viem`, do not hand-roll registry/resolver ABI calls.** The catch is that `viem`'s default (`strict: false`) failure model *collapses* several structurally distinct failure classes — gateway HTTP failure, resolver-not-found, malformed name, and genuine no-record — into a single `null` return, which is fundamentally at odds with this initiative's requirement for a **distinct typed error per failure code**. Getting the seven-code taxonomy out of `viem` therefore requires SF-2 to drive `getEnsAddress` in **`strict: true`** mode and route the thrown errors through SF-1's `mapNameResolutionError`, which shifts a chunk of the classification burden onto the mapper and corrects two rows of SF-1's provisional class→code table. That, plus a small `isValidName` helper `viem` does *not* provide, an `external`-provenance signal `viem` does *not* expose, and caller-owned timeout timing, are the enumerated gaps below.

---

## Existing TypeScript Implementations

### `viem` — the incumbent, already a dependency (v2.44.4)

- **Root:** [`wevm/viem@2.44.4`](https://github.com/wevm/viem/tree/viem@2.44.4) · ENS actions under [`src/actions/ens/`](https://github.com/wevm/viem/tree/viem@2.44.4/src/actions/ens), ENS utils under [`src/utils/ens/`](https://github.com/wevm/viem/tree/viem@2.44.4/src/utils/ens). Import surface: `viem/ens`.
- **Forward action — `getEnsAddress`** ([`src/actions/ens/getEnsAddress.ts`](https://github.com/wevm/viem/blob/viem@2.44.4/src/actions/ens/getEnsAddress.ts)). Verified from the installed `_esm/actions/ens/getEnsAddress.js`. Signature (paraphrased):

  ```ts
  getEnsAddress(client, {
    name: string,                         // MUST be pre-normalized by the caller
    coinType?: number,                    // ENSIP-9/11 multichain address; defaults to ETH (60)
    gatewayUrls?: string[],               // CCIP-Read batch-gateway override
    strict?: boolean,                     // default false → collapse null-result reverts to null
    universalResolverAddress?: Address,   // override; else read from chain.contracts.ensUniversalResolver
    blockNumber?, blockTag?,
  }): Promise<Address | null>
  ```

  How it works (the whole flow matters for SF-2's decisions):
  1. Resolves the **Universal Resolver** address from `chain.contracts.ensUniversalResolver` via `getChainContractAddress`. If the chain has no such contract → **throws `ChainDoesNotSupportContract`**. If the client has no `chain` at all → **throws a plain `Error('client chain not configured. universalResolverAddress is required.')`**.
  2. Optional `chain.ensTlds` short-circuit: if configured and `name` doesn't end with an allowed TLD → returns `null` (most chains don't set `ensTlds`).
  3. `namehash(name)` + `packetToBytes(name)`, then `readContract('resolveWithGateways', [dnsEncodedName, addrCalldata, gatewayUrls ?? [localBatchGatewayUrl]])`. **This is the ENSIP-10 wildcard + CCIP-Read path** — `readContract`'s built-in offchain-lookup machinery follows any `OffchainLookup` revert to the gateway automatically.
  4. Decodes; returns `null` for the empty-record encodings (`res[0] === '0x'`, decoded `addr === '0x'`, or trimmed `0x00`).
  5. `catch`: if `strict` → rethrow **everything**; else if `isNullUniversalResolverError(err)` → return `null`; else rethrow.

- **`isNullUniversalResolverError`** ([`src/utils/ens/errors.ts`](https://github.com/wevm/viem/blob/viem@2.44.4/src/utils/ens/errors.ts)) — the crux of the failure model. In non-strict mode it walks the error chain for a `ContractFunctionRevertedError` whose decoded `errorName` is one of: `HttpError`, `ResolverError`, `ResolverNotContract`, `ResolverNotFound`, `ReverseAddressMismatch`, `UnsupportedResolverProfile` — and if found, **returns `null`**. So in the default configuration, a **gateway HTTP failure (`HttpError`)** and a **missing resolver (`ResolverNotFound`)** are indistinguishable from a genuine **no-record** result. This is the single most important finding for SF-2/SF-5.

- **`normalize`** ([`src/utils/ens/normalize.ts`](https://github.com/wevm/viem/blob/viem@2.44.4/src/utils/ens/normalize.ts)) — thin wrapper over `ox/Ens.normalize`, ENSIP-15 / UTS-46 normalization. **Throws** on a structurally invalid name. `getEnsAddress` does **not** normalize internally — the docs and code both require the caller to normalize first. There is **no `isValidName`/`isValidEnsName` boolean** anywhere in `viem` — the closest primitive is "call `normalize` and see whether it throws."

- **Limitations / gaps** (detailed in Gap Analysis): the null-collapse failure model; no boolean name validator; no return signal telling the caller whether CCIP-Read/offchain was actually used (needed for `provenance.external`); timeout is transport-level only (no per-resolution budget or `elapsedMs`).

### `@ensdomains/ensjs` (v4)

- **Root:** [`ensdomains/ensjs`](https://github.com/ensdomains/ensjs). The ENS-team-maintained library; v4 is itself a **`viem`-based** set of actions (`getAddressRecord`, `getName`, batchable via `ensPublicActions`). It layers richer record fetching (text/content-hash/multi-coin batching) and a `batch()` primitive over the same Universal Resolver `viem` already targets.
- **Assessment:** adds a **second ENS dependency** and its own `viem` peer for capability (records, subgraph reads) SF-2 does not need — SF-2 needs exactly one call, `name → address`. Its batching value is real but belongs to a possible future `resolveNames` batch method (explicitly deferred by UIKit SF-1 Decision #7). **Not recommended for SF-2**; revisit only if a batch/records initiative lands.

### `ox` (`ox/Ens`)

- **Root:** [`wevm/ox`](https://github.com/wevm/ox). The lower-level primitives library `viem` itself delegates to for `normalize` (and namehash/packet encoding). Already transitively present. Useful as the authority for `normalize`/`namehash` if SF-2 ever wants them without importing through `viem/ens`, but there is no reason to reach past `viem` here.

### Hand-rolled registry/resolver ABI calls

- Directly calling the ENS `Registry.resolver(node)` then `Resolver.addr(node)` (the pre-Universal-Resolver pattern) is what the spec's "prefer `viem`" directive exists to prevent. It re-implements namehash, wildcard (ENSIP-10) traversal, and CCIP-Read from scratch — hundreds of lines of security-sensitive code `viem` already audits and ships. **Rejected outright**; any hand-rolled resolution needs explicit justification per the spec directive, and none exists for the forward path.

---

## Cross-Ecosystem Implementations

### Resolution-Engine Decision Matrix

The "tooling decision" for a headless resolution library is *which ENS engine backs the capability*. Axes scored 1–5 (5 = best for this repo).

| Engine | New dep? | Forward coverage (v1 + wildcard + CCIP) | Typed-error fidelity | API stability | Runtime footprint | Fit for SF-2 | Score |
|---|---|---|---|---|---|---|---|
| **`viem` `getEnsAddress`** (recommended) | **No** (already pinned `2.44.4`) | 5 — Universal Resolver, ENSIP-10, CCIP built in | 3 — reverts are typed but the default collapses them to `null` (needs `strict:true` + own mapping) | 4 — stable `2.x`, ENS actions mature | 5 — zero added weight | **5** | **21** |
| `@ensdomains/ensjs` v4 | Yes (+ its own `viem`) | 5 — same URs + records/batch | 4 — richer decoded errors, still `viem`-based | 3 — v4 API younger, records-focused churn | 3 — heavier, records machinery unused | 3 | 18 |
| `ox/Ens` + hand-rolled reads | No (transitive) | 2 — primitives only; you re-build wildcard/CCIP | 5 — you own every error, but you author it all | 4 | 4 | 2 | 17 |
| Fully hand-rolled registry ABI | No | 1 — you re-implement everything | 5 — but at enormous cost/risk | 5 | 4 | 1 | 16 |

**Winner: `viem`.** It dominates on the two axes that matter most here — zero new dependency (spec directive) and complete forward coverage — and the one axis it loses on (typed-error fidelity in default mode) is exactly the seam SF-1's mapper exists to close. **Fallback if `viem` ENS became unavailable:** `@ensdomains/ensjs` (same Universal Resolver semantics, ENS-team-maintained), then `ox/Ens` primitives as a last resort.

### Distribution & Adoption Story

SF-2 is a **library capability**, not a deployed service — the consumer (UIKit / a dapp) runs it in-process. It ships as part of `@openzeppelin/adapter-evm-core` (npm, workspace-linked during development per the spec's local-linking assumption). No new package, no new registry surface, no infra. The only distribution-relevant discipline is **semver on `@openzeppelin/adapter-evm-core`**: SF-2 is purely additive (a new `nameResolution` capability factory + exports), so a **minor** bump. The one external-facing constraint is the `viem` version: SF-2 relies on the Universal-Resolver/`strict`/`isNullUniversalResolverError` behavior of `viem >= 2.x`, which the workspace pins to `2.44.4`; a `viem` major bump is a cross-cutting event that would need SF-2 (and SF-1's mapper table) re-validated.

*(Operational Cost Sketch omitted — SF-2 is an in-process library with no team-run infrastructure, vendor, or recurring cost. The only "gateway" cost is the end user's RPC/CCIP-Read gateway, which the consumer configures on the `viem` client, not this repo.)*

---

## Ecosystem Needs

- **UIKit SF-3 (the direct consumer, their P1 MVP)** needs exactly one thing from SF-2's forward path: `resolveName(name) → { ok: true, value: { name, address, provenance } } | { ok: false, error }`, never throwing for an expected miss, plus the synchronous `isValidName` to distinguish "user typed a name" from "user typed hex" without an RPC round-trip. Confirmed against UIKit SF-1 design (`NameResolutionCapability`, `packages/types/src/adapters/capabilities/name-resolution.ts`).
- **SF-1's mapper (already designed)** needs SF-2 Research to pin the actual `viem` class → code mapping for the forward path. This report supplies it (see Gap Analysis + Dev Notes) and flags two corrections to SF-1's provisional table.
- **The conformance harness (SF-4)** needs the forward path to be deterministic-under-stable-state and to *never* throw for expected failures — which pins SF-2's obligation to run `strict: true` and funnel every throw through the mapper rather than letting a raw `viem` error escape.
- **Non-EVM adapters** need SF-2 to be additive at the runtime-map level (optional `nameResolution` slot) so they compile and run unchanged (SC-006). The UIKit SF-1 design already made both the `EcosystemRuntime.nameResolution?` and `CapabilityFactoryMap.nameResolution?` slots optional — SF-2 just supplies the EVM factory.
- **Common headless pattern this matches:** every chain-touching capability in this repo (`createERC4626`, `createERC3643`, `createIRS`) is a thin `capabilities/<domain>.ts` factory over a `src/<domain>/` service, wrapped by `guardRuntimeCapability`, with a co-located `error-mapping.ts` using the `extractRevertInfo`/`includesAny` needle idiom. SF-2 slots into that exact shape (SF-1 already established `src/name-resolution/`).

---

## Gap Analysis

`viem` covers forward resolution; these are the enumerated gaps SF-2's Design must close. **G1 is the load-bearing one.**

| # | Gap | Severity | What SF-2 must do |
|---|-----|----------|-------------------|
| **G1** | **Default `strict:false` collapses distinct failures into `null`.** `HttpError` (gateway), `ResolverNotFound`/`ResolverNotContract` (network/resolver absent), `UnsupportedResolverProfile`, `ReverseAddressMismatch`, and genuine no-record all become `null`. This violates the seven-code taxonomy (a gateway failure would masquerade as `NAME_NOT_FOUND`; edge case "gateway unreachable vs name-not-found" + SC-002). | **High** | Call `getEnsAddress` with **`strict: true`**, catch, and classify the thrown `ContractFunctionRevertedError.data.errorName` in the mapper: `ResolverNotFound`/`ResolverNotContract` → `UNSUPPORTED_NETWORK`; `HttpError` (+ `OffchainLookupError` family) → `EXTERNAL_GATEWAY_ERROR`; a genuine empty-record revert → `NAME_NOT_FOUND`. In strict mode, "no record" **throws** too, so `NAME_NOT_FOUND` can no longer be assumed to come only from a `null` return — SF-1's constructor-vs-mapper split (Decision #1) must account for both a `null` return *and* a mapped revert yielding `NAME_NOT_FOUND`. |
| **G2** | **SF-1's provisional class→code table (rows 4–5) is partly wrong for the forward path.** The real "chain has no ENS" signal is **`ChainDoesNotSupportContract`**, not `EnsInvalidChainIdError`/`ClientChainNotConfiguredError`. `EnsInvalidChainIdError` only fires for ENSIP-11 `coinType` validation (SF-5 territory). And a client with no `chain` throws a **plain `Error`** (not a `BaseError`), which SF-1's mapper currently drops to `ADAPTER_ERROR`. | **Medium** (local fix in SF-1 mapper table; drift note raised) | Add `ChainDoesNotSupportContract` → `UNSUPPORTED_NETWORK` to the mapper table. Decide whether the plain "client chain not configured" `Error` should be pre-empted at capability construction (validate the network has a Universal Resolver when the factory runs) rather than mapped — recommended, since it's a config/programmer error, not a per-call expected failure. |
| **G3** | **No `isValidName` primitive in `viem`.** Only `normalize` (throws). The UIKit design *requires* a synchronous boolean. | **Low** (trivial to build) | Implement `isValidName` as: reject obvious non-names early (must contain a dot, must not be a hex address via `isValidEvmAddress`), then `try { normalize(name); return true } catch { return false }`. Note `normalize` is ENSIP-15; a bare regex (as sketched in UIKit SF-1) is weaker — prefer `normalize`-based. Keep it allocation-light and side-effect-free (it's on the hot input path). |
| **G4** | **No `external`/offchain signal on the return.** `getEnsAddress` returns only `Address | null` — it does not tell the caller whether CCIP-Read/offchain was traversed, which the base `ResolutionProvenance.external` field needs. | **Medium** | For SF-2's v1 base path, default `provenance = { label: 'ENS', external: false }`. Accurately distinguishing offchain traversal is an SF-5 concern and even there `viem` doesn't expose it cleanly (would need `gatewayUrls` interception or a custom transport) — flag to SF-5. Do **not** block SF-2 on it. |
| **G5** | **Timeout is transport-level; no per-resolution budget or `elapsedMs`.** `viem`'s `TimeoutError` comes from the HTTP transport config, not a resolution-scoped budget. SF-1's `RESOLUTION_TIMEOUT.elapsedMs` is caller-supplied by design. | **Low** | Wrap the call with a caller-side timer (`performance.now()` deltas, as SF-1's integration sketch already shows) and, if a resolution-specific budget is wanted, an `AbortController`/`Promise.race`. Feeds `ctx.elapsedMs` into the mapper. |
| **G6** | **Caller must normalize; `getEnsAddress` won't.** Passing an unnormalized name silently namehashes the raw string → wrong node → wrong/empty result. | **Low** (but correctness-relevant) | `resolveName` must `normalize(name)` before the call (inside the same `try` so a `normalize` throw maps to `UNSUPPORTED_NAME`), consistent with SF-1 Decision and the mapper's UTS-46 row. |

### What exists but is incomplete
`viem` gives a correct, audited forward *mechanism* but an intentionally lossy *failure model* for the default use case (a dapp that only cares "did it resolve or not"). This initiative cares about *why* it didn't — hence the `strict:true` + mapper approach.

### What's missing entirely
A boolean name validator (G3) and an offchain-traversal signal (G4) — both small, both owned by this repo.

### Pitfalls found
- **Silent gateway→not-found downgrade** (G1) is the exact trap the spec's edge cases call out; it is invisible unless you deliberately opt out of `strict:false`.
- **`strict:true` inverts SF-1's stated assumption** ("viem returns `null` for a no-record lookup — it does not throw"). In strict mode no-record *does* throw. SF-1's design is not wrong — its constructors are still the right home for the `null`-return path — but SF-2 will produce `NAME_NOT_FOUND` from *both* a `null` return *and* a classified revert. Worth an explicit invariant.

---

## Existing Codebase Analysis (Extension Mode)

- **Home already staked out by SF-1.** `packages/adapter-evm-core/src/name-resolution/` exists (SF-1's `error-mapping.ts` + `index.ts` barrel). SF-2 adds the service (`src/name-resolution/service.ts` or similar) and the thin factory `src/capabilities/name-resolution.ts`, then registers it in `src/capabilities/index.ts`. This mirrors `erc4626/` (`service.ts`/`actions.ts`/`abi.ts`/`error-mapping.ts` + `capabilities/erc4626.ts`).
- **Capability seam to reuse** (`@openzeppelin/adapter-runtime-utils`, `src/runtime-capability.ts`): `withRuntimeCapability(networkConfig, 'nameResolution')` for a fresh runtime shell, or `guardRuntimeCapability(service, …)` to wrap a service object — both give the `RuntimeCapability` surface (`networkConfig`, idempotent `dispose()`, use-after-dispose → `RuntimeDisposedError`, and promise tracking that rejects in-flight calls on dispose). Name resolution is Tier-2 (async, network-scoped) so it extends `RuntimeCapability`, unlike Tier-1 `createAddressing` (sync, no runtime shell). The UIKit SF-1 sketch used `withRuntimeCapability` + `Object.assign`; `guardRuntimeCapability` over a service object is the closer match to `createERC4626` and gives promise-cancellation on dispose for free.
- **Helpers to reuse** (`capabilities/helpers.ts`): `asTypedEvmNetworkConfig(config)` to narrow the network config, `assertValidAddress` for fail-fast on malformed deployment input. `isValidEvmAddress` (`src/utils/validation.ts`) backs both `createAddressing` and SF-2's `isValidName` negative check (a valid hex address is *not* a name).
- **Error-mapping idiom to reuse** (`shared/revert-info.ts`): `extractRevertInfo` (walks the `viem` error chain to the decoded custom-error name / selector) and `includesAny` (needle matcher). SF-1's mapper already commits to `BaseError.walk` + `instanceof`-primary + needle-fallback; SF-2's `getEnsAddress` reverts (`ContractFunctionRevertedError` with ENS `errorName`s) are reachable via exactly this idiom — `extractRevertInfo` will surface `errorName` such as `ResolverNotFound`/`HttpError`.
- **Existing invariants not to break:** the capability must be *optional at the runtime-map level* (SC-006) — no non-EVM adapter may be forced to implement it; the factory is registered only in the EVM `CapabilityFactoryMap`. `viem` is already a direct dependency (`^2.33.3`, resolved to `2.44.4`), so no dependency change. Fully additive; minor release.
- **Client provenance:** SF-2 needs a `viem` `PublicClient` with a `chain` that carries `contracts.ensUniversalResolver` (mainnet and most L1/L2s viem ships do). The UIKit sketch injects `{ publicClient }` into the factory; confirm at Design whether the client comes from the existing EVM runtime's provider seam (`EvmProviderKeys` in `types.ts`) or is injected fresh — reuse the runtime's client if one is already threaded, to inherit its transport/timeout/`ccipRead` config.

---

## Recommendation

- **Verdict: BUILD on `viem` (GO).** The spec's binding "prefer `viem`" go/no-go resolves to **go** for the forward path: `getEnsAddress` covers v1 forward resolution, ENSIP-10 wildcard, and CCIP-Read via the Universal Resolver with zero new dependency. Hand-rolling any part of forward resolution is unjustified.

- **Recommended approach.** Implement `resolveName` as a thin wrapper over `client.getEnsAddress`, driven in **`strict: true`** so distinct failures surface as throwable, typed `viem` errors instead of a lossy `null`. `normalize` the name inside the `try`; a `null` return → `nameNotFound(name)` (SF-1 constructor); any throw → `mapNameResolutionError(err, { networkId, elapsedMs, viaGateway: <offchain?> })`. Pre-validate at the factory that the bound network exposes a Universal Resolver, so "unsupported network" is caught at construction/first-call as `UNSUPPORTED_NETWORK` rather than leaking a raw `viem` error. Build `isValidName` from `isValidEvmAddress` (negative) + `normalize`-throws (positive). Wire the capability as a `guardRuntimeCapability`-wrapped service behind a `capabilities/name-resolution.ts` factory registered only in the EVM `CapabilityFactoryMap`, mirroring `createERC4626`.

- **Key design considerations (for the Design stage):**
  1. **The `strict` decision is the whole ballgame (G1).** Choose `strict: true` + full mapper classification. Document that `NAME_NOT_FOUND` now arises from both the `null`-return path *and* a classified revert, and that `HttpError`/`ResolverNotFound` must **not** be allowed to degrade to `NAME_NOT_FOUND`. This is where SF-2's fund-safety stakes live.
  2. **Feed SF-1's mapper the corrected table (G2).** `ChainDoesNotSupportContract → UNSUPPORTED_NETWORK`; ENS revert `errorName`s → their codes; decide the plain-`Error` "no chain configured" case is a construction-time guard, not a per-call map. Raise as a drift note to SF-1 (its table rows 4–5 were provisional and self-flagged for SF-2 Research to finalize).
  3. **`isValidName` correctness + cost (G3/G6).** ENSIP-15 `normalize`-based, not a loose regex; synchronous, allocation-light, no I/O; reject hex addresses. Normalization also happens inside `resolveName` (a valid-looking name can still fail `normalize` at resolve time → `UNSUPPORTED_NAME`).
  4. **Provenance shape (G4).** Base path emits `{ label: 'ENS', external: false }`; defer accurate offchain-vs-canonical detection to SF-5 and note that `viem` doesn't expose it. Keep the provenance object construction in one place so SF-5's `EnsProvenance` extension slots in.
  5. **Client & timeout ownership (G5).** Reuse the EVM runtime's `viem` client if threaded (inherits `ccipRead`/transport/timeout); own the `elapsedMs` clock caller-side.

- **Risks.**
  - *`strict:true` behavioral surface is broader than the happy path* — every ENS revert `errorName` must have a deliberate code, or it falls to `ADAPTER_ERROR`. Mitigation: enumerate the six `isNullUniversalResolverError` names explicitly in the mapper + a conformance test per code (SF-4).
  - *`viem` version coupling* — the `strict`/`isNullUniversalResolverError`/Universal-Resolver behavior is `viem >= 2.x` and was refined across 2.x minors; the repo pins `2.44.4`. A `viem` major bump requires re-validating the class→code table. Mitigation: pin remains via workspace override; add a comment tying the mapper table to `viem@2.44.4`.
  - *Chain coverage* — `getEnsAddress` only works where `chain.contracts.ensUniversalResolver` is set. On chains without it, the correct behavior is `UNSUPPORTED_NETWORK`, not a crash. Mitigation: construction-time check (G2).

---

## Out of Scope

- **Reverse resolution / `getEnsName` / `forwardVerified` / avatar** — SF-3. `getEnsName` was inspected only enough to confirm it shares the same `strict`/`isNullUniversalResolverError`/plain-`Error` behavior (so SF-3 inherits G1/G2); its full analysis is SF-3's Research.
- **ENS v2 (CCIP-Read as a first-class path) / Namechain / cross-chain / `coinType` scoping / `EnsProvenance` / `isEnsProvenance`** — SF-5. SF-2 uses the Universal Resolver's *built-in* CCIP-Read incidentally (it can't be turned off), but does not design the v2 provenance surface or chain-scoping.
- **The conformance harness** — SF-4.
- **The `NameResolutionError` union & value types** — owned by UIKit SF-1 (`@openzeppelin/ui-types`); imported, not modified.
- **The error-mapper module itself** — SF-1 (this report *feeds* it a corrected class→code table but does not redesign it).
- **`@ensdomains/ensjs` batching / records** — deferred with any future `resolveNames` batch initiative (UIKit SF-1 Decision #7).
- **Non-EVM name systems** (SNS, Unstoppable, `.sui`, Aptos) — follow-up initiative.

## Dev Notes

- **Concrete forward-path class → code table (SF-2's required output; supersedes SF-1 provisional table rows 4–5 for the forward path), against `viem@2.44.4`:**

  | `viem` signal (via `strict:true` + `extractRevertInfo`/`walk`) | NameResolutionError code |
  |---|---|
  | `getEnsAddress` returns `null` (empty record) | `NAME_NOT_FOUND` (via `nameNotFound` constructor) |
  | `ContractFunctionRevertedError` `errorName` ∈ {`ResolverNotFound`, `ResolverNotContract`} | `UNSUPPORTED_NETWORK` |
  | `ChainDoesNotSupportContract` (no `ensUniversalResolver` on chain) | `UNSUPPORTED_NETWORK` |
  | `ContractFunctionRevertedError` `errorName` === `HttpError`; `OffchainLookupError` / `OffchainLookupResponseMalformedError` / `OffchainLookupSenderMismatchError`; `HttpRequestError` when `ctx.viaGateway` | `EXTERNAL_GATEWAY_ERROR` |
  | `TimeoutError` (plain RPC, no gateway) | `RESOLUTION_TIMEOUT` |
  | `normalize()` throw (malformed name) | `UNSUPPORTED_NAME` |
  | `ContractFunctionRevertedError` `errorName` ∈ {`UnsupportedResolverProfile`, `ReverseAddressMismatch`} | forward path: treat `UnsupportedResolverProfile` → `UNSUPPORTED_NAME`/`ADAPTER_ERROR` (Design call); `ReverseAddressMismatch` is reverse-only (SF-3) |
  | plain `Error('client chain not configured…')` | pre-empt at construction (recommended) else `ADAPTER_ERROR` |
  | anything else | `ADAPTER_ERROR` (cause preserved) |

- Verified against installed sources: `getEnsAddress.js`, `utils/ens/errors.js` (`isNullUniversalResolverError`), `utils/ens/normalize.js`, `errors/ccip.js`, `errors/chain.js` (`ChainDoesNotSupportContract`, `ClientChainNotConfiguredError`), `errors/request.js` (`TimeoutError`, `HttpRequestError`), `getChainContractAddress.js` — all under the pinned `viem@2.44.4` in the pnpm store.
- `guardRuntimeCapability` (over a service object) is preferred to the UIKit sketch's `withRuntimeCapability` + `Object.assign` — it matches `createERC4626` and gives in-flight-promise rejection on `dispose()` for free (relevant to the never-throw / lifecycle boundary).

## Open Questions

1. **`strict: true` confirmation (Design).** This report recommends `strict: true` as the only way to hit the seven-code taxonomy. Confirm at Design, and confirm the corollary that `NAME_NOT_FOUND` is produced from *both* the `null`-return path and classified reverts — Invariants should state this as an explicit property so SF-4 can test it.
2. **`UnsupportedResolverProfile` mapping (Design).** On the forward `addr(node)` path this generally means the resolver doesn't implement the addr profile — is that `UNSUPPORTED_NAME` (the name has no usable resolver profile) or `ADAPTER_ERROR`? Leaning `UNSUPPORTED_NAME`; needs a Design decision and an SF-4 case.
3. **Drift note to SF-1 (raised here).** SF-1's provisional mapper table rows 4–5 (`EnsInvalidChainIdError`/`ChainNotConfiguredError`/`ClientChainNotConfiguredError` → `UNSUPPORTED_NETWORK`; UTS-46 row) should be reconciled with the corrected forward-path table above — chiefly adding `ChainDoesNotSupportContract`. SF-1 self-flagged this table as refinable by SF-2/SF-5 Research without changing its exported signature, so this is an in-place SF-1 mapper update, not a step-back. Recommend the Orchestrator route this to whoever holds SF-1 Invariants/Code.
