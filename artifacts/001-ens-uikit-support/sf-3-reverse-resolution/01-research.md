---
stage: research
project: ens-uikit-support
sub_feature: sf-3-reverse-resolution
repo: openzeppelin-adapters
mode: extension
extends: packages/adapter-evm-core/src
status: draft
timestamp: 2026-07-04
author: aleksandr.pasevin
previous_stage: artifacts/001-ens-uikit-support/00-specify.md
tags: [ens, name-resolution, reverse-resolution, forward-verification, avatar, viem, getEnsName, getEnsAvatar, capability, evm, adapter, service]
---

# SF-3 · Reverse resolution + forward-verification + avatar — Research Report

## Summary

`viem@2.44.4` ships a production-grade reverse resolver (`getEnsName`) and an avatar reader (`getEnsAvatar`), both over the same Universal Resolver SF-2 already builds on — **zero new dependency**. **Verdict: GO for the RPC/UR plumbing and avatar; but a *conditional/partial* GO on forward-verification, because viem's reverse primitive forward-verifies *inside the contract* (`reverseWithGateways`) and — on a forward/reverse mismatch — reverts `ReverseAddressMismatch` and returns **no name at all**.** That means `getEnsName` can only ever hand back a name that has *already* passed forward-verification (so `forwardVerified` would be a constant `true`), and it structurally **cannot** produce the contract's SF-3 scenario-2 outcome: *return the mismatched name with `forwardVerified: false`*. Satisfying the contract as written (and matching the Orchestrator's binding scope note that "forward-verification reuses the SF-2 `resolveName` path") requires supplementing viem with a small, justified raw reverse-record read to recover the *unverified* claimed name, then forward-verifying it ourselves via SF-2's `resolveName` + a checksum-safe address compare. Avatar is a separate, name-keyed, best-effort lookup that must be latency- and failure-isolated from the reverse result. The enumerated gaps (R1–R7) below, the reverse class→code table, and three candidate designs (A/B/C) are the required output; R1/R2 are the load-bearing ones and carry a Design-stage decision (and a flagged step-back to reconcile SF-3 scenario 2 with viem's semantics).

---

## Existing TypeScript Implementations

### `viem` — the incumbent, already a dependency (v2.44.4)

Import surface: `viem/ens`. All findings verified against the installed `_esm` sources under the pnpm-pinned `viem@2.44.4`.

- **Reverse action — `getEnsName`** ([`src/actions/ens/getEnsName.ts`](https://github.com/wevm/viem/blob/viem@2.44.4/src/actions/ens/getEnsName.ts)). Signature (paraphrased):

  ```ts
  getEnsName(client, {
    address: Address,                     // the address to reverse-resolve
    coinType?: bigint,                    // ENSIP-9/11; DEFAULTS TO 60n (ETH mainnet)
    gatewayUrls?: string[],               // CCIP-Read batch-gateway override
    strict?: boolean,                     // default false → null-collapses UR reverts (same as getEnsAddress)
    universalResolverAddress?: Address,   // override; else read from chain.contracts.ensUniversalResolver
    blockNumber?, blockTag?,
  }): Promise<string | null>
  ```

  How it works (this is the crux for SF-3):
  1. Resolves the **Universal Resolver** from `chain.contracts.ensUniversalResolver` (same path as `getEnsAddress`; no chain → plain `Error('client chain not configured…')`; chain without the contract → `ChainDoesNotSupportContract`).
  2. Calls **`reverseWithGateways(reverseName, coinType, gateways)`** on the UR ([`universalResolverReverseAbi`](https://github.com/wevm/viem/blob/viem@2.44.4/src/constants/abis.ts)), whose outputs are `(string resolvedName, address resolver, address reverseResolver)`.
  3. Returns `name || null` — **it destructures only `resolvedName`; the forward-resolved address is *not* returned to the caller.**
  4. `catch`: `strict` → rethrow everything; else `isNullUniversalResolverError(err)` → `null`; else rethrow.

  **The load-bearing fact:** the UR's `reverse()` (per ENSIP-19 / UR v2) performs the *entire* reverse algorithm on-chain — it reads the reverse record, forward-resolves the claimed name, and **checks the forward address matches the queried address**, reverting **`ReverseAddressMismatch`** when they differ. `ReverseAddressMismatch` is one of the six names `isNullUniversalResolverError` treats as "null" ([`src/utils/ens/errors.ts`](https://github.com/wevm/viem/blob/viem@2.44.4/src/utils/ens/errors.ts), lines 20–21). So:
  - **Match** → `getEnsName` returns the name (forward-verification already succeeded on-chain).
  - **Mismatch** → `strict:false` returns `null`; `strict:true` throws `ReverseAddressMismatch`. **Either way the caller gets no name.**
  - This is *verify-or-nothing*: viem gives you a forward-verified name or nothing — never a name flagged unverified.

- **Avatar action — `getEnsAvatar`** ([`src/actions/ens/getEnsAvatar.ts`](https://github.com/wevm/viem/blob/viem@2.44.4/src/actions/ens/getEnsAvatar.ts)). Signature: `getEnsAvatar(client, { name, strict?, gatewayUrls?, assetGatewayUrls?, … }): Promise<string | null>`. It is **keyed by NAME, not address** — internally it calls `getEnsText({ key: 'avatar', name, strict })` ([`getEnsText.ts`](https://github.com/wevm/viem/blob/viem@2.44.4/src/actions/ens/getEnsText.ts), same `strict`/`isNullUniversalResolverError`/UR semantics as `getEnsAddress`), then `parseAvatarRecord`, which **may perform additional network I/O** (resolving NFT/IPFS/HTTP avatar URIs). It **swallows every `parseAvatarRecord` error and returns `null`** (`try { … } catch { return null }`). So avatar is: (a) a *second* round-trip after the reverse resolves the name, (b) potentially a *third* (asset fetch), and (c) best-effort — it never surfaces a typed error to us for a bad avatar record.

- **No independent forward-verification primitive.** viem exposes no "reverse-record-only" read and no `verify(name, address)` helper. `getEnsName` is the sole reverse entry point and it always uses the verifying `reverseWithGateways`.

- **Limitations / gaps** (detailed in Gap Analysis): verify-or-nothing reverse (R1); no exposed forward-resolved address / no way to get an unverified name (R2); the inherited `strict`/null-collapse failure model (R3); avatar is a separate best-effort name-keyed lookup (R4); checksum-normalization needed for a self-verify compare (R5); `coinType` defaults to ETH (R6); avatar URL is attacker-controllable content (R7).

### `@ensdomains/ensjs` (v4)

- [`ensdomains/ensjs`](https://github.com/ensdomains/ensjs) — the ENS-team library, itself `viem`-based. Its reverse action `getName` also routes through the Universal Resolver and **also forward-verifies**, exposing a `match: boolean` on its result in some shapes but still not a general "unverified name on mismatch" primitive for the batch UR path. Adds a second ENS dependency + its own `viem` peer for record/batch machinery SF-3 does not need. **Not recommended** — same reason as SF-2: a second ENS stack for one call. Its one *interesting* differentiator is that some ensjs code paths surface the reverse name and the forward-match flag separately; if Design chooses the "supplement viem" route, ensjs's `getName` internals are a useful *reference* for the raw-reverse-read shape (not a dependency).

### `ethers.js` `lookupAddress` (cross-check, not a candidate)

- ethers' `provider.lookupAddress(address)` performs reverse-then-forward-check and **returns `null` on mismatch** — identical *verify-or-nothing* behavior. Noted because it confirms this is the **ecosystem norm**: no mainstream JS resolver surfaces a forward-mismatched name. The SF-3 contract's `forwardVerified: false`-*with-name* is a deliberately richer anti-spoofing semantic that **no off-the-shelf primitive provides** — which is the core justification for the supplement in R1/R2.

### Hand-rolled reverse (registry `resolver()` + reverse-node `name()`)

- The pre-UR pattern: derive `<address>.addr.reverse`, look up its resolver, call `name(bytes32)` for the claimed name, then forward-resolve and compare. Re-implementing the *whole* reverse path from scratch is what the "prefer viem" directive forbids. **Rejected as a wholesale approach.** However, a *narrow* slice of it — reading only the reverse-node `name(node)` record to recover the **unverified** claimed name — is the one thing viem structurally cannot express, and is the justified supplement discussed under R1/R2 and Recommendation.

---

## Cross-Ecosystem Implementations

### Reverse-Resolution Engine Decision Matrix

The "tooling decision" is *how the reverse path acquires the (possibly unverified) name and establishes `forwardVerified`*. Axes scored 1–5 (5 = best for this repo).

| Engine / approach | New dep? | Reverse coverage (UR + offchain) | Can surface a **mismatched** name (scenario 2) | Typed-error fidelity | Reuses SF-2 `resolveName` | Runtime footprint | Fit | Score |
|---|---|---|---|---|---|---|---|---|
| **`getEnsName` alone** (strict:true) | **No** | 5 | **1 — impossible** (verify-or-nothing; mismatch → null/throw) | 3 (needs strict + mapper) | No (UR verifies) | 5 | 2 | **19** |
| **`getEnsName` + raw reverse-name read + SF-2 `resolveName` verify** (recommended) | **No** (viem primitives + 1 tiny ABI frag) | 5 | **5** | 4 | **Yes** | 5 | **5** | **29** |
| `@ensdomains/ensjs` v4 `getName` | Yes (+ its own viem) | 5 | 3 (partial, path-dependent) | 4 | No | 3 | 3 | 21 |
| Fully hand-rolled reverse (registry ABI) | No | 2 (re-build offchain/UR) | 5 | 5 (author it all) | Yes | 4 | 1 | 17 |

**Winner: `getEnsName` + a narrow raw reverse-name read + SF-2 `resolveName`-based verify.** It keeps viem for everything viem does well (UR resolution, CCIP-Read, offchain, avatar) and hand-rolls *only* the one primitive viem cannot express — the unverified reverse name — which is exactly what unlocks the contract's `forwardVerified` semantics and honors the scope's "reuses the SF-2 `resolveName` path." **Fallback if this became untenable:** `getEnsName`-alone (Approach A, folds mismatch into `ADDRESS_NOT_FOUND`, `forwardVerified` constant-true) — safe but scenario-2-non-compliant; then `@ensdomains/ensjs` `getName`.

### Operational Cost Sketch

*Omitted — SF-3, like SF-2, is an in-process library capability with no team-run infrastructure, vendor, or recurring cost. The only external cost is the consumer's RPC/CCIP-Read gateway (and, for avatars, the IPFS/HTTP asset host `parseAvatarRecord` fetches), all configured on the consumer's `viem` client, not this repo.*

### Distribution & Adoption Story

SF-3 ships as additive surface on `@openzeppelin/adapter-evm-core` — it fills in the already-optional `resolveAddress?` method on the `NameResolutionCapability` the EVM factory returns. No new package, no new registry surface. **Minor** semver bump (purely additive: a method that was absent becomes present). Same `viem>=2.x` UR/`strict`/`isNullUniversalResolverError` coupling as SF-2 — the reverse class→code table is pinned to `viem@2.44.4` and a `viem` major bump requires re-validating it (add the version-tying comment, as SF-2 did).

---

## Ecosystem Needs

- **UIKit SF-4 (the direct consumer — address *display*)** needs `resolveAddress(address) → { ok: true, value: { address, name, forwardVerified, avatarUrl?, provenance } } | { ok: false, error }`, never throwing for an expected miss. The **decisive** need is an honest `forwardVerified` **concrete boolean** (UIKit `ResolvedName.forwardVerified` is *"Always a concrete boolean — never `undefined`"*, and UIKit INV-6 anti-spoofing is Critical): the display layer renders a bare name only when `forwardVerified === true`, and renders a mismatched name greyed/flagged when `false`. **This flagged-name behavior requires the name to be *present* on mismatch** — precisely what `getEnsName` alone cannot deliver (R1).
- **The conformance harness (SF-4)** asserts `forwardVerified` is *always* a concrete boolean across compliant and non-compliant adapters (SC-003), that expected failures never throw (SC-002), and determinism-under-stable-state. SF-3 must therefore (a) never leave `forwardVerified` undefined, and (b) route every reverse/verify/avatar failure to `{ ok: false }` or to a `forwardVerified: false` (never a throw).
- **SF-1's mapper + constructors** already provide the reverse building block: **`addressNotFound(address)`** (the `ADDRESS_NOT_FOUND` constructor) exists in `error-mapping.ts` and is the reverse analog of SF-2's `nameNotFound`. SF-3 produces `ADDRESS_NOT_FOUND` on its **own control path** (empty reverse record / reverse-node resolver reverts), preserving SF-1 INV-11 (**the mapper must never fabricate a not-found — and `ADDRESS_NOT_FOUND` is a not-found too**).
- **Non-EVM adapters** need SF-3 to stay additive/optional (SC-006) — `resolveAddress?` is already optional on the interface; SF-3 supplies only the EVM implementation.
- **Common headless pattern this matches:** SF-3 slots into the exact SF-2 shape — the `EvmNameResolutionService` gains a `resolveAddress` method (and reuses its own `resolveName` for verification), the thin `capabilities/name-resolution.ts` factory is unchanged in wiring, and the injected `PublicClient` (D-A) is the same borrowed client.

---

## Gap Analysis

`viem` covers the reverse *mechanism* and avatars; these are the gaps SF-3's Design must close. **R1 and R2 are load-bearing (fund-safety / anti-spoofing).**

| # | Gap | Severity | What SF-3 must do |
|---|-----|----------|-------------------|
| **R1** | **`getEnsName` forward-verifies inside the UR and yields no name on mismatch.** `reverseWithGateways` reverts `ReverseAddressMismatch` on a forward/reverse mismatch → `null` (non-strict) / throw (strict). So viem's reverse primitive is *verify-or-nothing*: it can return a verified name or nothing, but **never a mismatched name**. This directly conflicts with **SF-3 acceptance scenario 2** ("still returns the name but with `forwardVerified: false`") and the UIKit SF-4 flagged-name display need. | **High** | Decide the design branch (A/B/C below). To satisfy scenario 2 literally, **do not rely on the UR's built-in verification for the name**: acquire the *unverified* claimed reverse name (R2) and forward-verify it yourself via SF-2 `resolveName`. If the dev/Orchestrator instead re-scopes scenario 2, Approach A (fold mismatch into `ADDRESS_NOT_FOUND`) suffices — flag as a **step-back to the spec** either way. |
| **R2** | **No viem primitive returns the unverified reverse name, and the forward-resolved address is not exposed.** `reverseWithGateways` outputs `(resolvedName, resolver, reverseResolver)` but reverts before returning on mismatch, and `getEnsName` discards `resolver`/`reverseResolver` and never surfaces the forward address. There is no `getEnsReverseName` / raw-record primitive. | **High** | Supplement viem with a **narrow** raw reverse-record read: derive `<address-lowercased>.addr.reverse`, get its resolver (viem `getEnsResolver`, or the UR `findResolver`), then `readContract` the reverse-node **`name(bytes32) → string`** record (a 1-entry ABI fragment SF-3 supplies — viem's exposed abis carry only `addr`/`text`). This is the one justified hand-roll; record the justification per the "prefer viem" directive: *viem structurally cannot express "give me the unverified reverse name."* |
| **R3** | **Inherited `strict`/null-collapse failure model (SF-2 G1/G2).** `getEnsName` (and `getEnsText` under avatar) default `strict:false`, collapsing gateway/resolver-absent/no-record into `null`; the real "no ENS on this chain" signal is `ChainDoesNotSupportContract`. | **Medium** | Run `getEnsName` with **`strict:true`** and classify throws via SF-1's `mapNameResolutionError`, reusing SF-2's D-B sync UR support-gate (→ `UNSUPPORTED_NETWORK` before I/O) and the reverse class→code table (Dev Notes). A `null` return → **`ADDRESS_NOT_FOUND`** via `addressNotFound(address)`. |
| **R4** | **Avatar is a separate, name-keyed, best-effort lookup with hidden extra I/O.** `getEnsAvatar(name)` runs *after* the reverse yields a name, is a second UR round-trip (+ possible asset fetch in `parseAvatarRecord`), and swallows all record/asset errors → `null`. | **Medium** | Fetch avatar **only after** a successful reverse+verify, in an **isolated `try`** whose failure yields `avatarUrl: undefined` (the field is optional) and **never** fails the reverse result. Consider skipping/deferring it when latency matters (contract permits `avatarUrl?` absent). Do not let avatar I/O widen the reverse call's never-throw surface. |
| **R5** | **Address checksum normalization for the self-verify compare.** SF-2 `resolveName` returns an EIP-55-checksummed address; the queried `address` may be any case. A naive `resolved === queried` compare would report a false mismatch. | **Low–Medium** | Compare via a checksum-safe normalization (viem `getAddress`/`isAddressEqual`, or `.toLowerCase()` on validated hex) before setting `forwardVerified`. A false mismatch is the *safe* direction (`forwardVerified:false`), but it is still a correctness bug worth an invariant. |
| **R6** | **`coinType` defaults to `60n` (ETH mainnet).** Reverse for other coin types / L2-scoped primary names (ENSIP-19 chain-scoped reverse) is not covered by the SF-3 v1 path. | **Low** | SF-3 v1 reverse targets the default ETH `coinType`. Chain-scoped reverse / `scopedToNetworkId` / non-60 coinTypes are **SF-5**. Leave `coinType` at the default; do not model scoping here. |
| **R7** | **Avatar URL is attacker-controllable content.** `avatarUrl` is set by the *name owner*; it is not a resolver secret (so no SF-1 redaction concern) but it is untrusted (SSRF/mixed-content/tracking-pixel risk at render time). | **Low** | Pass `avatarUrl` through as opaque text; do **not** fetch/expand it in the adapter beyond what `getEnsAvatar` already does. Flag to UIKit SF-4 that `avatarUrl` is untrusted content to be rendered defensively (out of scope here, but note it). |

### What exists but is incomplete
viem gives a correct, audited reverse *mechanism* and avatar reader, but its reverse primitive is deliberately *verify-or-nothing* — optimized for the common "show me the primary name if it's legit" case, not for the anti-spoofing "show me the claimed name AND whether it's legit" case the SF-3 contract mandates.

### What's missing entirely
An unverified-reverse-name primitive (R2) and a mismatched-name path (R1) — both small, both owned by this repo if scenario 2 stands.

### Pitfalls found
- **Constant-true `forwardVerified` masquerading as compliance** — if SF-3 naively wraps `getEnsName`, `forwardVerified` is *always* `true` (viem only returns verified names). It passes the SF-4 "concrete boolean" check yet silently makes the anti-spoofing flag inert and fails scenario 2. This is the exact trap R1 exists to name.
- **Avatar failure sinking a good reverse result** — if the avatar lookup shares the reverse call's `try` or isn't isolated, a flaky IPFS gateway turns a perfectly good `{ ok: true, forwardVerified: true }` into an error (or a throw). R4.
- **Re-verifying an already-verified name is pointless** — if the claimed name is obtained from `getEnsName` (which only returns verified names), re-running `resolveName` always matches → `forwardVerified` is trivially `true`. Meaningful verification requires the *unverified* name (R2). This is why Approaches B/C read the raw reverse record rather than trusting `getEnsName`'s output.

---

## Existing Codebase Analysis (Extension Mode)

- **Home already staked out (SF-1 + SF-2).** `packages/adapter-evm-core/src/name-resolution/` holds SF-1's `error-mapping.ts` (+ barrel `index.ts`, which currently re-exports only `error-mapping` — SF-2's service/validation/provenance exports land when SF-2 Code Draft merges). SF-3 adds `resolveAddress` to **SF-2's `EvmNameResolutionService`** (`src/name-resolution/service.ts`) and, if the supplement is chosen, a small `reverse-record.ts` (raw reverse-name read + the `name(bytes32)` ABI fragment). No new capability, no new factory — `resolveAddress?` fills an already-optional method.
- **Reuses, verbatim:**
  - **SF-1 `addressNotFound(address)`** — the `ADDRESS_NOT_FOUND` constructor already exists (`error-mapping.ts` L192–197); SF-3's control-path not-found production uses it, preserving SF-1 INV-11 (mapper never emits a not-found — `ADDRESS_NOT_FOUND` included).
  - **SF-1 `mapNameResolutionError` + `NameResolutionErrorContext`** — the reverse `default` catch delegates to the same total mapper; `elapsedMs`/`viaGateway` context is supplied at the reverse catch site exactly as SF-2 does (SF-1 INV-12 caller obligation).
  - **SF-2's own `resolveName`** — the forward-verify sub-call. The scope explicitly says "forward-verification reuses the SF-2 `resolveName` path"; the service can call `this.resolveName(claimedName)` internally and compare the resolved address.
  - **SF-2 D-B sync UR support-gate + injected `PublicClient` (D-A)** — the same borrowed client and the same "unsupported network before any I/O" gate apply to `resolveAddress`.
  - **`shared/revert-info.ts`** (`extractRevertInfo`, `BaseError`) — reverse UR reverts (`ResolverNotFound`, `ReverseAddressMismatch`, …) are reachable via the same `errorName` idiom SF-2 uses.
- **Existing invariants not to break:** the capability stays additive/optional at the runtime-map level (SC-006); `viem` stays a same-version dependency; the service stays **stateless** (SF-2 INV-13) — SF-3's `resolveAddress` must add no cache/mutable field so SF-4's determinism check still holds; the borrowed client is **never disposed** by the capability (SF-2 INV-15); `isValidName` stays a pure forward-only helper (reverse takes an address — validate it with `isValidEvmAddress`, not `isValidName`).
- **Fund-safety parallel to SF-2:** SF-2's core invariant is "never coerce/placehold an address." SF-3's core is "**never report `forwardVerified: true` for an unverified or mismatched name**" (UIKit INV-6, Critical) — the reverse analog, and the reason R1/R2 are High.

---

## Recommendation

- **Verdict: BUILD on `viem` (GO) for the reverse mechanism and avatar; CONDITIONAL GO on forward-verification.** `getEnsName` + `getEnsAvatar` cover UR reverse resolution, CCIP-Read/offchain, and avatars with zero new dependency — hand-rolling those is unjustified. But viem's reverse primitive is *verify-or-nothing* (R1/R2), so the **forward-verification semantics the SF-3 contract mandates cannot be met by `getEnsName` alone**. This needs a Design decision, presented as three candidates:

  - **Approach A — `getEnsName`-only (viem-native, simplest, *not* scenario-2-compliant).** `getEnsName(address, { strict:true })`; a returned name ⇒ UR already verified ⇒ `forwardVerified: true`. `null` return and `ReverseAddressMismatch` throw both → `ADDRESS_NOT_FOUND`. Safe (never renders a spoofed name — renders nothing) and trivial, but `forwardVerified` is **constant `true`** and the mismatched name is never surfaced. Fails SF-3 scenario 2 as written.
  - **Approach B — raw reverse-name read + own forward-verify (contract-literal).** Read the *unverified* claimed name via a narrow raw reverse-record read (R2), then `resolveName(claimedName)` (SF-2) + checksum-safe compare (R5) → set `forwardVerified` honestly. Surfaces the mismatched name with `forwardVerified: false`. Reuses SF-2 `resolveName` as the scope directs. Cost: one justified hand-rolled primitive + an extra forward round-trip on every reverse.
  - **Approach C — hybrid (recommended if scenario 2 is firm).** Fast path `getEnsName(strict:true)` → name ⇒ `forwardVerified: true` (one round-trip, no extra verify). On the specific `ReverseAddressMismatch` throw, fall back to Approach B's raw read to recover the claimed name + set `forwardVerified: false`. `null`/other → `ADDRESS_NOT_FOUND`. Gets viem's happy path *and* scenario-2 compliance, confining the hand-rolled code to the mismatch branch.

- **Recommended approach.** **Approach C** if SF-3 scenario 2 (and UIKit INV-6's flagged-name display) is a hard requirement — which the spec text, the UIKit `ResolvedName` doc, and the Orchestrator's "reuses the SF-2 `resolveName` path" scope note all indicate it is. It preserves viem for the common case, satisfies the contract on mismatch, and reuses `resolveName`. If the Orchestrator/dev instead **re-scopes scenario 2** to accept folding mismatch into `ADDRESS_NOT_FOUND`, drop to **Approach A** (materially simpler, still safe). Either way the choice is a Design decision and should be recorded with a **step-back note** to the spec, because it changes the observable meaning of `forwardVerified`. Avatar in all approaches: `getEnsAvatar(name, { strict:true })` after a successful reverse+verify, in an isolated `try` → `avatarUrl` on success, `undefined` on any failure, never failing the reverse result.

- **Key design considerations (for Design):**
  1. **Resolve R1/R2 first — pick A/B/C and get it ratified.** Everything else hangs off whether the mismatched name must be surfaced. Recommend C; flag the step-back to reconcile SF-3 scenario 2 with viem's verify-or-nothing reality.
  2. **`forwardVerified` must be a *concrete* boolean on every `{ ok: true }` (UIKit INV-6, SC-003).** Define exactly when it is `true` vs `false`, and decide the **forward-verify-failure** case (the verify sub-call times out / gateway-errors): recommend `forwardVerified: false` (couldn't confirm — the contract explicitly permits skipping verify for latency provided the flag is `false`), *not* an error, since the reverse record itself did resolve.
  3. **Reverse class→code table + `ADDRESS_NOT_FOUND` on the control path.** Reuse SF-1's `addressNotFound` (never the mapper) for empty reverse record and reverse-node resolver-absent reverts (preserves SF-1 INV-11). Reuse SF-2's D-B support-gate and the SF-1 mapper for transport/gateway/timeout. Pin the table to `viem@2.44.4`.
  4. **Avatar isolation (R4).** Best-effort, name-keyed, post-verify, latency- and failure-isolated; optional field. Do not let it widen the never-throw surface or the determinism contract.
  5. **Checksum-safe address compare (R5)** for the self-verify; and keep the service **stateless** (no verify cache) so SF-4 determinism holds.

- **Risks.**
  - *Scenario-2 tension unresolved* → if Design ships Approach A silently, `forwardVerified` is inert and the anti-spoofing guarantee is hollow. Mitigation: force the A/B/C decision + step-back note now (this report).
  - *Extra round-trip cost* (Approaches B/C) → every mismatch (B: every reverse) adds a forward `resolveName` call. Mitigation: Approach C confines the extra call to the mismatch branch; document the latency.
  - *Raw reverse read drift from ENS spec* → hand-rolling the reverse-node `name()` read reintroduces a slice of the logic the UR encapsulates (reverse-node derivation, resolver lookup). Mitigation: keep it minimal, cover with a mainnet-fork test (a known forward-mismatched address), and cite ensjs `getName` as the reference shape.
  - *`viem` version coupling* (same as SF-2) → UR reverse ABI / `isNullUniversalResolverError` set is `viem>=2.x`; re-validate on a major bump. Mitigation: version-tying comment.
  - *Avatar asset I/O* → `parseAvatarRecord` may hit IPFS/HTTP; a slow asset host could stall if not isolated. Mitigation: isolated try + optional field + consider a short deadline / skip.

---

## Out of Scope

- **Forward resolution / `resolveName` / `isValidName` / capability scaffold** — SF-2 (delivered/designed). SF-3 *calls* `resolveName` for verification; it does not redesign it.
- **ENS v2 first-class (CCIP-Read as a designed path) / Namechain / cross-chain / chain-scoped reverse / non-60 `coinType` / `scopedToNetworkId` / `EnsProvenance` / `isEnsProvenance` / `viaGateway: true`** — SF-5. SF-3 uses the UR's built-in CCIP-Read only incidentally (offchain primary names resolve through it) and emits `baseEnsProvenance()`-style base provenance (`external:false`, no scope), same seam SF-2 established.
- **The `NameResolutionError` union / `ResolvedName` value type** — owned by UIKit SF-1 (`@openzeppelin/ui-types`); imported, never modified. SF-3 maps into `ADDRESS_NOT_FOUND` / `UNSUPPORTED_NETWORK` / `RESOLUTION_TIMEOUT` / `EXTERNAL_GATEWAY_ERROR` / `ADAPTER_ERROR`.
- **The error-mapper internals** — SF-1; SF-3 consumes `mapNameResolutionError` + `addressNotFound` and (if it adds a reverse-specific row) feeds SF-1 a drift note, but does not redesign the mapper.
- **The conformance harness** — SF-4; SF-3 defines the `forwardVerified` concrete-boolean / never-throw properties, SF-4 enforces them.
- **Avatar image fetching / caching / rendering / SSRF hardening** — UIKit (consumer). SF-3 returns the `avatarUrl` string `getEnsAvatar` produces; it does not fetch or sanitize the asset beyond viem's own `parseAvatarRecord`.
- **`@ensdomains/ensjs` as a dependency** — not adopted; referenced only as a shape reference for the raw reverse read.
- **Non-EVM name systems** (SNS, Unstoppable, `.sui`, Aptos) — follow-up initiative; non-EVM adapters omit the capability.

## Dev Notes

- **Reverse-path native-error → code table (SF-3's required output), against `viem@2.44.4`, `getEnsName` with `strict:true`.** Mirrors SF-2's D-E split: **Part A** = SF-3 control-path constructors; **Part B** = SF-1 mapper delegation. `ADDRESS_NOT_FOUND` is a not-found → **must** be Part A (SF-1 INV-11: the mapper never fabricates a not-found).

  | Signal | Code / outcome | Site | Note |
  |---|---|---|---|
  | `getEnsName` returns `null` (empty reverse record) | `ADDRESS_NOT_FOUND` | `addressNotFound(address)` (Part A) | non-throw no-record path |
  | `!isValidEvmAddress(address)` (malformed input) | `ADDRESS_NOT_FOUND` *(Design call — see Open Q)* | control path | never-throw; no "invalid address" code in the union |
  | `supportsEns()` false (no UR on chain) | `UNSUPPORTED_NETWORK` | `unsupportedNetwork(networkId)` (Part A) | reuse SF-2 D-B sync gate, before I/O |
  | revert `ResolverNotFound` / `ResolverNotContract` (reverse node has no usable resolver) | `ADDRESS_NOT_FOUND` | `addressNotFound(address)` (Part A) | address-scoped no-record; **not** the mapper |
  | revert `ReverseAddressMismatch` | **Approach C:** recover claimed name + `forwardVerified:false` (success, not an error). **Approach A:** `ADDRESS_NOT_FOUND` | control path | the mismatch signal — the crux of R1 |
  | revert `UnsupportedResolverProfile` (reverse resolver lacks `name()`) | `ADDRESS_NOT_FOUND` *(lean)* or `ADAPTER_ERROR` | control path | Design call; leaning no-usable-reverse-record |
  | revert `HttpError` / `OffchainLookup*` | `EXTERNAL_GATEWAY_ERROR` | `mapNameResolutionError` (Part B) | reverse can be offchain (ENSIP-19); unconditional in mapper |
  | `TimeoutError` (no gateway ctx) | `RESOLUTION_TIMEOUT` | mapper (Part B) | `elapsedMs` from ctx (SF-1 INV-12) |
  | `ChainDoesNotSupportContract` | `UNSUPPORTED_NETWORK` | mapper (Part B) | backstop — D-B pre-empts normally |
  | revert `ResolverError`, plain `Error('client chain…')`, anything else | `ADAPTER_ERROR` (cause preserved) | mapper (Part B) | closed-union guarantee |
  | **forward-verify sub-call fails** (verify `resolveName` returns timeout/gateway/error) | `forwardVerified: false` on an otherwise-`{ ok: true }` result *(recommended)* | control path | reverse record resolved; couldn't *confirm* forward — contract permits `false`-for-latency |

- **`addressNotFound` already exists** (`error-mapping.ts` L192) — SF-3 needs **no new SF-1 constructor** for the not-found path. If Approach C treats `ReverseAddressMismatch` as a success-with-`false` (not a mapper row), SF-1's mapper needs **no reverse-specific change at all** — same Part-A/Part-B discipline SF-2 landed. Confirm and, if any reverse row *is* needed in the mapper, route a drift note to SF-1 (as SF-2 did), not a step-back.
- **Verified against installed sources** (`viem@2.44.4`, pnpm store): `actions/ens/getEnsName.js` (`reverseWithGateways`, `name || null`, `strict` rethrow), `actions/ens/getEnsAvatar.js` (name-keyed, `parseAvatarRecord`, error-swallow → `null`), `actions/ens/getEnsText.js` (avatar substrate; same `strict`/`isNullUniversalResolverError`), `utils/ens/errors.js` (`ReverseAddressMismatch` ∈ null-error set), `constants/abis.js` (`universalResolverReverseAbi` outputs `(resolvedName, resolver, reverseResolver)` — **no forward address returned**).
- **`performance.now()`** is the `elapsedMs` clock at the reverse catch site (SF-1 INV-12 caller obligation), identical to SF-2 INV-18. If Approach B/C, the forward-verify sub-call's own timing is internal to `resolveName` (already handled by SF-2).
- **Cross-repo HOLD (same as SF-1/SF-2):** the local `@openzeppelin/ui-types` checkout already carries `ResolvedName` / `resolveAddress?` / `NameResolutionError` (verified: `packages/types/src/common/name-resolution.ts`, `.../capabilities/name-resolution.ts`), but the published `3.1.0` does not — typecheck stays red until the types land via local-linking. Do not locally redefine any UIKit-owned type.
- **Class→code table pinned to `viem@2.44.4`** — a `viem` major bump re-validates the reverse UR error surface (add the version-tying comment SF-2 uses).

## Open Questions

1. **A/B/C decision on forward-verification + SF-3 scenario 2 (the load-bearing one).** Does the capability MUST surface a forward-mismatched name with `forwardVerified: false` (scenario 2 literal → Approach B/C, recommended C), or is folding mismatch into `ADDRESS_NOT_FOUND` acceptable (Approach A, `forwardVerified` constant-true)? This changes the observable meaning of `forwardVerified` and the presence of a raw reverse read, so it wants explicit ratification — and, if scenario 2 is re-scoped, a **step-back note to the spec** (Design owns the call; flagged here). Recommended: **C**.
2. **Forward-verify-failure outcome.** When the verify sub-call (`resolveName` on the claimed name) itself times out / gateway-errors, is the result `{ ok: true, forwardVerified: false }` (recommended — reverse resolved, forward unconfirmed; contract permits `false`-for-latency) or a propagated `{ ok: false, error }`? Invariants should pin this so SF-4 can test it.
3. **Malformed-address input.** `resolveAddress` takes an `address`; the union has no "invalid address" code. On `!isValidEvmAddress(address)`, return `{ ok: false, ADDRESS_NOT_FOUND }` (echoing the bad input) — recommended, never-throw — or a construction-time guard? Confirm at Design; a fork/unit test should pin it.
4. **`UnsupportedResolverProfile` on the reverse path** → `ADDRESS_NOT_FOUND` (no usable reverse record — lean) vs `ADAPTER_ERROR` (resolver-capability gap). Mirror SF-2's D-C reasoning; Design call + an SF-4 case.
