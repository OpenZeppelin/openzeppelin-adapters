---
stage: invariants
project: ens-uikit-support
sub_feature: sf-5-ens-v2
repo: openzeppelin-adapters
mode: extension
extends: packages/adapter-evm-core/src
status: draft
timestamp: 2026-07-04
author: aleksandr.pasevin
previous_stage: artifacts/001-ens-uikit-support/sf-5-ens-v2/02-design.md
tags: [ens, ensv2, name-resolution, ccip-read, cross-chain, coinType, ensip-9, ensip-11, ensip-19, viem, EnsProvenance, isEnsProvenance, provenance, capability, evm, adapter, service, invariants]
---

# SF-5 · ENS v2 (L1-only: CCIP-Read + cross-chain via coinType) + EnsProvenance + isEnsProvenance — Invariants

> Reads the **revised D-V9** (Design v2, `02-design.md` revision 2). The central commitment this artifact formalizes: **truthful, observed `external` + an `EnsProvenance` ride EVERY forward-resolution success** — the mainnet-bound CCIP-Read case (the *primary* v2 case) **and** the L1 cross-chain path. This is stated as a **delivered** property (INV-3, INV-9), not an accepted gap. The SF-2 provenance-test re-baseline named in the Design's Step-Back Suggestion is an SF-5 **Code** concern (pending the dev's OK on touching delivered SF-2 assertions); it is **not** an invariants concern and is not re-litigated here.

## Summary

SF-5 is a **provenance-truthfulness extension** to the SF-2 forward path: the resolved *address* contract is inherited unchanged from SF-2 (fund-safety core — INV-1/INV-2 preserved), and the new correctness surface is entirely about **making provenance a set of facts the adapter can substantiate, never a claim it merely asserts.** The organizing principle is *observe, don't infer, and never silently fall back.* Three properties carry the weight: (1) **`external` is observed, not inferred** — it is `true` **iff** an `OffchainLookup` (CCIP-Read) was actually followed during *this* resolution, detected by wrapping the resolving client's `ccipRead.request` hook (INV-9, G1); (2) that observation is **race-free** — it rides a per-call ephemeral client over a call-local flag, so concurrent `resolveName` calls on a shared borrowed client never cross-contaminate `sawOffchain` (INV-18, D-V5); and (3) a v2 gateway failure surfaces `EXTERNAL_GATEWAY_ERROR`, **distinct from `NAME_NOT_FOUND` and never a silent v2→v1 fallback** (INV-14, spec SF-5 scenario 2), because `viaGateway` is now the *observed* `sawOffchain` on both paths (INV-13) feeding SF-1 INV-10's gateway-dominance. Around that sit the type-level contract of the new `EnsProvenance` extension — built on **every** forward success (INV-3), a strict **superset** of an **unchanged** base `ResolutionProvenance` (INV-4, no SF-1 contract change), discriminated by an always-present `system: 'ens'` (INV-5) that `isEnsProvenance` narrows on as the **sole** sanctioned path (INV-10, SC-005) — and the chain-scope contract: `scopedToNetworkId` is present **iff** the result is chain-scoped (`coinType !== 60`) so a Base-scoped address is never presented as a plain mainnet address (INV-7, edge case). The client-model change (D-V1) is additive and gated: an optional injected `ensL1Client` extends SF-2's borrowed-client no-dispose ownership (INV-21) and DI seam (INV-25) to a second client and a per-call ephemeral one, with client selection a deterministic sync precedence before any I/O (INV-17, INV-22). Auth is `n/a` — a public read primitive (recorded explicitly). Open Q1 (`external` → v2-mechanism boundary) stays **OPEN for UIKit SF-6**: SF-5 surfaces only the raw observable `external` and pins no mechanism contract.

## Bindings from prior stages (what this stage builds on)

Surfaced for traceability; each a fixed commitment here. Per the Orchestrator directive, these are treated as current (the directive is the stage-start drift confirmation).

- **Design v2 (D-V1…D-V9, revised):** D-V1 dedicated mainnet L1 client injected *alongside* the bound client, L1 path gated on optional `ensL1Client`; D-V2 target chain = bound network (UIKit SF-1 `resolveName(name)` locked); D-V3 `EnsProvenance` = observable facts only; D-V4 `isEnsProvenance` discriminant = `system: 'ens'`; D-V5 `external` observed via per-call `ccipRead.request` wrapper, call-local flag, race-free; D-V6 `scopedToNetworkId` = bound `networkId`, only when `coinType !== 60`, no coinType-inverse; D-V7 `viaGateway = observed sawOffchain`, single call, no v2→v1 fallback; D-V8 `ResolverError → ADAPTER_ERROR` unchanged; **D-V9 (revised)** `EnsProvenance` + observed `external` ride **every** forward success (mainnet-bound and L1 cross-chain).
- **Public API surface (Design v2):** new file `ens-provenance.ts` exporting `EnsProvenance` (type), `isEnsProvenance` (guard), `buildEnsProvenance(args)`, `deriveCoinType(chainId)`, `scopedNetworkId`; modified `service.ts` (`resolveName` client/coinType selection + shared `resolveVia` success routine + per-call `deriveObservingClient`); new optional `ensL1Client?` on `CreateNameResolutionOptions`; `shared.ts` `ensL1Client` builder.
- **Cross-SF (SF-2), preserved:** the forward-path fund-safety invariants — INV-1 return-shape closure, INV-2 no-coerced address, INV-6 never-throw (sole `RuntimeDisposedError`), INV-7 `strict:true`, INV-8/9 not-found sourcing, INV-10 closed seven-code classification, INV-12 precedence, INV-13 statelessness, INV-15 borrowed-client no-dispose, INV-16 pre-I/O gating, INV-18 bounded work + `elapsedMs`, INV-19 label/redaction discipline, INV-20 DI seam. SF-2 INV-5 (`baseEnsProvenance` `external:false`) becomes **reverse-only (SF-3)** — the forward path stops calling it (see Existing Invariants § Modified).
- **Cross-SF (SF-1), preserved:** `mapNameResolutionError` + typed constructors are imported, pure, **not modified** — SF-5 adds **no** mapper row and **no** error code. SF-1 INV-10 (`viaGateway` dominates timeout → `EXTERNAL_GATEWAY_ERROR`), INV-11 (mapper never emits not-found), INV-12 (`elapsedMs` caller obligation), INV-16 (credential redaction) are load-bearing for INV-13/INV-14/INV-23/INV-24 below.
- **Cross-repo (UIKit SF-1):** base `ResolutionProvenance`, `ResolvedAddress`, `ResolutionResult`, `NameResolutionError` imported from `@openzeppelin/ui-types`, **never modified**. `EnsProvenance` extends the base per its own doc-comment sanction.
- **Spec:** SC-005 (`isEnsProvenance` narrows v2 true / base+non-EVM false; no `label` string-match), SC-006 (non-EVM adapters unchanged), SF-5 scenario 1 (chain-scoped result carries `scopedToNetworkId`), scenario 2 (gateway failure → `EXTERNAL_GATEWAY_ERROR`, never silent v1 fallback), Namechain dropped (Plan Revision 1).

---

## Request/Response Contract

### INV-1: `resolveName` return-shape closure — preserved verbatim under the restructured (`resolveName` + `resolveVia`) shape

**Category:** Request/Response

**Statement:** For every input, `resolveName(name)` resolves to a member of `ResolutionResult<ResolvedAddress>` — `{ ok: true, value }` or `{ ok: false, error }` — never `undefined`/`null`/a discriminant-less object, and never rejects for an expected failure (INV-11). SF-5 restructures the body (client/coinType selection in `resolveName`; the shared success routine extracted to `resolveVia`), so this SF-2 property (SF-2 INV-1) is **re-verified against every new return path**: the three client-selection early-returns, the `deriveCoinType`-catch return, and both of `resolveVia`'s success/failure arms each return an explicit `{ ok }` literal.

**Applies to:** `resolveName`, `resolveVia`, the guarded capability surface.

**Enforcement mechanism:**
- Type system: both methods annotated `Promise<ResolutionResult<ResolvedAddress>>` (closed union from `@openzeppelin/ui-types`); the `default → mapNameResolutionError` arm is total (SF-1 INV-1) so the function is total at the type level.
- Runtime guard: every branch returns an `{ ok }` literal; the sole non-return exit remains the guard-proxy `RuntimeDisposedError` (INV-11).
- Test: sweep `resolveName` over — mainnet-bound success, L1-path success, `null`-return, each classified revert, unsupported network (no UR + no `ensL1Client`), non-EVM chainId (`deriveCoinType` throw), invalid name, raw transport throw — assert each resolves to an `{ ok }`-shaped value.

**Violation scenario:** The new `deriveCoinType`-catch forgets to `return`, falls through to `resolveVia` with an undefined `coinType`, and a raw viem throw surfaces as a rejection on a chain that should have been a clean `UNSUPPORTED_NETWORK`.

**Severity:** Critical

### INV-2: Success-value fidelity — verbatim non-null address, `null` → `NAME_NOT_FOUND`, `value.name` echoes original input; only `provenance` changes

**Category:** Request/Response

**Statement:** On `{ ok: true }`, `value.address` is exactly the non-`null` hex returned by `getEnsAddress` for the normalized name on the selected client — never the zero address, a truncated/re-checksummed/placeholder value, or a substituted default; a `null` return is **never** success (it is `NAME_NOT_FOUND`, preserving SF-2 INV-2/INV-8). `value.name` echoes the **caller's original** `name` (not the normalized form). The **only** change SF-5 makes to the success value is `value.provenance`: it is now `buildEnsProvenance(...)` (an `EnsProvenance`, INV-3) instead of SF-2's `baseEnsProvenance()`. Applies identically on both client-selection branches.

**Applies to:** `resolveVia` (success arm), `resolveName`.

**Enforcement mechanism:**
- Type system: `ResolvedAddress.address: string` (UIKit SF-1); the success literal is built only inside the `address !== null` branch.
- Runtime guard: `if (address === null) return nameNotFound(name)` precedes success construction on both branches; `address` and `name` (original) pass through untransformed.
- Test: mainnet-bound and L1-path resolves against a mock returning a fixed hex → `value.address` byte-identical, `value.name === <original input>` for a mixed-case/foldable input; a `null` return on either branch → `NAME_NOT_FOUND`, never `{ ok: true, address: '0x00…0' }`.

**Violation scenario:** The L1-path branch, "to signal cross-chain," rewrites `value.address` into a CAIP-10 string; a consumer reading `value.address` as a plain hex funds a malformed recipient. (Chain scope belongs on `scopedToNetworkId`, INV-7 — never on `address`.)

**Severity:** Critical

### INV-3: An `EnsProvenance` is built on EVERY forward-resolution success — fresh per call, `system` always present

**Category:** Request/Response

**Statement:** On **every** `{ ok: true }` from `resolveName` — the mainnet-bound path **and** the L1 cross-chain path — `value.provenance` is the return of `buildEnsProvenance({ external, coinType, networkId })` and is an `EnsProvenance` with the `system` discriminant always present (INV-5). This is the delivered core of revised D-V9: v2 provenance is **not** invisible on its most common case (a mainnet-bound CCIP-Read name). Each provenance object is **freshly allocated** per success — never a shared/frozen singleton aliased across results (preserves SF-2 INV-5's freshness discipline for the new builder). There is no forward-success path that returns base `baseEnsProvenance()` or omits provenance.

**Applies to:** `resolveVia` (success arm, both branches); `buildEnsProvenance`.

**Enforcement mechanism:**
- Type system: `resolveVia`'s success literal types `provenance: EnsProvenance`; `buildEnsProvenance` returns `EnsProvenance` (a superset of `ResolutionProvenance`, INV-4), so `value` still satisfies `ResolvedAddress`.
- Runtime guard: a single `buildEnsProvenance(...)` call site inside `resolveVia`'s success arm, reached by both client selections; no `baseEnsProvenance()` import remains in `service.ts`'s forward path.
- Test: mainnet-bound success → `isEnsProvenance(value.provenance) === true` and `value.provenance.system === 'ens'`; L1-path success → same; two successes return provenance objects with distinct identity (`!==`); grep the forward path asserts no `baseEnsProvenance` call.

**Violation scenario:** A refactor restores `baseEnsProvenance()` on the mainnet-bound branch "to minimize the diff"; the primary v2 case ships without `system`/`coinType`, `isEnsProvenance` returns `false` on `alice.eth`, and UIKit SF-6 silently loses v2 detection for the majority of real names — the exact regression revised D-V9 exists to prevent (undercuts SC-005 / UIKit SC-007).

**Severity:** Critical

### INV-4: `EnsProvenance` is a strict superset of an UNCHANGED base `ResolutionProvenance` — no SF-1 contract change

**Category:** Request/Response

**Statement:** `EnsProvenance extends ResolutionProvenance` and adds exactly two required fields, `system: 'ens'` and `coinType: number`, on top of the base's `label: string`, `external: boolean`, and optional `scopedToNetworkId?: string`. The base type is **imported** from `@openzeppelin/ui-types` and **never redefined, widened, narrowed, or modified** — every base field remains present on every `EnsProvenance`, so the change is a *superset*, not a break. There is **no** SF-1 capability-contract change. A consumer typed only against `ResolutionProvenance` keeps compiling and keeps reading `label`/`external`/`scopedToNetworkId`.

**Applies to:** `EnsProvenance` (type), `buildEnsProvenance`, the `@openzeppelin/adapter-evm-core` re-exports.

**Enforcement mechanism:**
- Type system: `interface EnsProvenance extends ResolutionProvenance { readonly system: 'ens'; readonly coinType: number }` — `extends` guarantees the superset; the base is `import type`, never a local re-declaration.
- Runtime guard: n/a (type-level); `buildEnsProvenance` populates all base fields plus the two extensions.
- Test: `expectTypeOf<EnsProvenance>().toMatchTypeOf<ResolutionProvenance>()`; assert a built `EnsProvenance` has `label`, `external`, `system`, `coinType` present; assert `@openzeppelin/ui-types`'s `ResolutionProvenance` source is unmodified (no local shadow definition).

**Violation scenario:** Someone "tidies up" by re-declaring `ResolutionProvenance` locally with an extra field or by making `external` optional; the UIKit-owned type diverges, SF-1's contract is silently forked, and a base-typed consumer in another repo type-breaks on upgrade.

**Severity:** High

### INV-5: `system` discriminant is always the literal `'ens'` on a forward result — the sole sanctioned narrowing key

**Category:** Request/Response

**Statement:** Every `EnsProvenance` SF-5 builds carries `system === 'ens'` — the value is the constant literal, always set, never conditional, never derived from an unobservable v1/v2 distinction. `system` (not the stale sketch's `version: 'v1'|'v2'`, which is not observable from viem's `Address | null` — G4) is the field `isEnsProvenance` narrows on (INV-10). It is the one field guaranteed present on every forward result, which is what makes the guard total over SF-5 output.

**Applies to:** `buildEnsProvenance`; `EnsProvenance`; `isEnsProvenance`.

**Enforcement mechanism:**
- Type system: `readonly system: 'ens'` (literal type) — the compiler forbids any other value.
- Runtime guard: `buildEnsProvenance` sets `system: 'ens'` unconditionally.
- Test: assert every built `EnsProvenance.system === 'ens'`; assert no `version` field exists on the type (`expectTypeOf` / key assertion).

**Violation scenario:** A future author adds `version: 'v2'` by sniffing the name suffix and points `isEnsProvenance` at it; the guard now returns `false` for a v1 name resolved through the shared v2 UR (a false negative) and fabricates a v1/v2 claim the resolution can't substantiate (G4 violation).

**Severity:** High

### INV-6: `coinType` is a `number` under 2^53, always set — `60` mainnet-bound, chain-specific otherwise

**Category:** Request/Response

**Statement:** Every `EnsProvenance.coinType` is a JavaScript `number` (never `bigint`, never `undefined`), always set, and within safe-integer range by construction (ENSIP-11 EVM coinTypes are `< 2^32`, well under 2^53). It is `60` for a mainnet-bound resolution (ETH, unscoped) and the ENSIP-9/11 chain-specific value (e.g. Base → `2147492101`) for a chain-scoped resolution. It records the coinType SF-5 **chose from the bound network** and actually **requested** on `getEnsAddress` — an observable fact, not a claim about the returned address's semantics beyond what was asked.

**Applies to:** `buildEnsProvenance` (`coinType` arg is `bigint`, stored as `number` via `Number()`); `deriveCoinType`; `EnsProvenance`.

**Enforcement mechanism:**
- Type system: `readonly coinType: number`; `buildEnsProvenance({ coinType: bigint })` narrows to `number` at the single construction site.
- Runtime guard: `Number(coinType)` at build; the value passed matches the `coinType` handed to `getEnsAddress` in the same call (INV-3 links them).
- Test: mainnet-bound success → `coinType === 60`; a Base-bound L1-path success → `coinType === toCoinType(base.id)` as a `number` and `Number.isSafeInteger(coinType)`.

**Violation scenario:** `coinType` is stored as the raw `bigint`; a consumer's `JSON.stringify(provenance)` throws (`bigint` is not JSON-serializable) and a component that serializes provenance for logging crashes on every v2 result.

**Severity:** High

### INV-7: `scopedToNetworkId` present IFF chain-scoped (`coinType !== 60`), equal to the bound network's `networkId`; absent when mainnet-bound

**Category:** Request/Response

**Statement:** `EnsProvenance.scopedToNetworkId` is set **if and only if** the resolution is chain-scoped (`coinType !== 60`, i.e. the L1 cross-chain path), and when set it equals the **bound network's own repo `networkId`** (D-V6 — no coinType-inverse is needed because the target chain *is* the bound network, D-V2). On a mainnet-bound resolution (`coinType === 60`) the key is **absent** (`'scopedToNetworkId' in provenance === false`, not `undefined`), matching the base-type convention (SF-2 INV-5). This is the signal that lets a consumer bind a chain-scoped address to the correct chain; a chain-scoped address is thereby never presentable as a plain L1-mainnet address (spec SF-5 scenario 1 / edge case).

**Applies to:** `buildEnsProvenance`; `scopedNetworkId` helper; `EnsProvenance`.

**Enforcement mechanism:**
- Type system: `scopedToNetworkId?: string` (inherited, optional) — key-absent, not `undefined`, is the intended shape.
- Runtime guard: `buildEnsProvenance` conditionally spreads the key: `...(coinType !== 60n ? { scopedToNetworkId: networkId } : {})`; on the mainnet-bound branch the key is never added.
- Test: mainnet-bound → `'scopedToNetworkId' in provenance === false`; Base L1-path → `provenance.scopedToNetworkId === <bound networkId>`; assert it is the bound network's id, not mainnet's, and not a CAIP-2 string (unless a drift note forces it).

**Violation scenario:** `scopedToNetworkId` is set to `'1'` (mainnet) on the L1 cross-chain path because the resolving *client* is mainnet; a consumer binds a Base-scoped address to Ethereum L1 and directs a transfer to an address that is only valid on Base — a chain-mismatch fund-loss the scope field exists to prevent.

**Severity:** Critical

### INV-8: `label` is a curated user-safe literal chosen from observed `external` — `'ENS'` or `'ENS via external gateway'`, never a URL

**Category:** Request/Response

**Statement:** `EnsProvenance.label` is one of exactly two curated literals — `'ENS'` when `external === false`, `'ENS via external gateway'` when `external === true` — chosen from the *observed* `external` (INV-9). It is **never** a gateway URL, RPC host, keyed endpoint, resolver address, or any internal identifier. Both literals are display-only strings a downstream MUST NOT branch on (branching is `isEnsProvenance` + `external`, INV-10); both satisfy SF-4's user-safe `label` allowlist `/^[A-Za-z][A-Za-z0-9 ]{0,63}$/` (space-separated, **hyphen-free** — chosen deliberately so it passes the allowlist without widening the char-class; see Open Questions). This extends SF-2 INV-5/INV-19's single `'ENS'` literal to a two-literal set.

**Applies to:** `buildEnsProvenance` (`label` selection); consumed by SF-4's `label`-allowlist check and UIKit INV-16.

**Enforcement mechanism:**
- Type system: `label: string` (base); the value is chosen from a two-element literal set at the single build site.
- Runtime guard: `const label = external ? 'ENS via external gateway' : 'ENS'` — no interpolation, no concatenation of any native/transport string.
- Test: `external:false` → `label === 'ENS'`; `external:true` → `label === 'ENS via external gateway'`; both match the SF-4 allowlist and contain no `://`, `@`, hex-address substring, or control char.

**Violation scenario:** `label` is enriched to `` `ENS via ${gatewayUrl}` `` "for debugging"; the keyed gateway URL renders in the UIKit as the provenance label (a credential leak, INV-24) and SF-4's allowlist fails the adapter.

**Severity:** High

### INV-9: `external` is truthful — `true` IFF an `OffchainLookup` was actually followed during THIS resolution (observed, never inferred)

**Category:** Request/Response

**Statement:** `EnsProvenance.external === true` **if and only if** an `OffchainLookup` (ERC-3668 CCIP-Read) was actually traversed during *this* `resolveName` call, as **observed** by the per-call `ccipRead.request` hook firing (G1, D-V5); it is `false` otherwise. `external` is **never inferred** from the name, TLD, resolver identity, or any heuristic — only the actual lookup is truthful. This holds on **every** forward path: the mainnet-bound CCIP-Read case (the primary v2 case) and the L1 cross-chain path. `external` is the raw observable; SF-5 does **not** map it onto a v2 mechanism (Open Q1, UIKit SF-6).

**Applies to:** `resolveVia` (the `deriveObservingClient` mechanism + the `sawOffchain` flag threaded into `buildEnsProvenance`).

**Enforcement mechanism:**
- Type system: `external: boolean` (base) — total, no `undefined`.
- Runtime guard: `resolveVia` mints a per-call client via `deriveObservingClient(client, () => { sawOffchain = true })` whose `ccipRead.request` wraps viem's default `ccipRequest` — calls `onOffchain()` then delegates; `buildEnsProvenance({ external: sawOffchain, … })` reads the flag after the call.
- Test: resolve `test.offchaindemo.eth` (known CCIP-Read) → `external === true`; resolve a purely on-chain name → `external === false`; a **probe test** that fails if the `ccipRead.request` hook stops firing (guards the fragile viem-internal seam, Dev Notes); assert `external` is never set from the name string (grep: no TLD/name-based branch feeds `external`).

**Violation scenario:** A "fast path" infers `external` from `.cb.id`-style suffixes instead of observing the hook; a v2 name that resolves fully on-chain is reported `external: true`, and a UIKit that shows a "resolved via off-chain gateway" trust indicator lies to the user — the inference hazard G1/Research explicitly forbids.

**Severity:** Critical

### INV-10: `isEnsProvenance` is a total, pure, sound type guard narrowing on `system` — the sole sanctioned narrowing path (SC-005)

**Category:** Request/Response

**Statement:** `isEnsProvenance(p: ResolutionProvenance): p is EnsProvenance` is total (a `boolean` for every input), pure (no I/O, no throw, no mutation), and **sound**: it returns `true` for **every** SF-5 forward result (INV-3 guarantees `system` present) and `false` for SF-3's reverse `baseEnsProvenance()` (no `system`) and any non-EVM adapter's base provenance. It narrows on the always-present `system` discriminant (`p.system === 'ens'`), **never** on `label` string-matching. It is the **only** supported way for a consumer to detect a v2/EVM-ENS result (SC-005); after a `true`, `p.external`, `p.coinType`, `p.scopedToNetworkId` are safely accessible.

**Applies to:** `isEnsProvenance` (exported from `@openzeppelin/adapter-evm-core`).

**Enforcement mechanism:**
- Type system: type-predicate signature `p is EnsProvenance`; body `return (p as Partial<EnsProvenance>).system === 'ens'`.
- Runtime guard: a single discriminant check; no `label` read; total over any `ResolutionProvenance`.
- Test: `isEnsProvenance(buildEnsProvenance(...)) === true` (both branches); `isEnsProvenance(baseEnsProvenance()) === false` (SF-3 reverse); `isEnsProvenance({ label:'ENS', external:false }) === false` (a base provenance that merely *displays* 'ENS' is not narrowed — proves label-matching is not used); feed a non-EVM adapter's provenance → `false`; assert it never throws on a malformed/partial input.

**Violation scenario:** The guard is implemented as `p.label === 'ENS' || p.label === 'ENS via external gateway'`; a non-EVM adapter that happens to use the display label `'ENS'` is wrongly narrowed to `EnsProvenance`, a consumer reads `p.coinType` → `undefined`, and SC-005's "no `label` string-matching" contract is broken at the guard itself.

**Severity:** Critical

## Error Semantics

### INV-11: Never-throw for expected failures — preserved across the new branches; sole sanctioned throw is `RuntimeDisposedError`

**Category:** Error Semantics

**Statement:** `resolveName` **never throws for an expected failure** — this SF-2 property (SF-2 INV-6) is re-verified against every SF-5-added path: the `deriveCoinType` call is wrapped in `try/catch` that returns `UNSUPPORTED_NETWORK` (INV-16), the client-selection early-returns are pure, and `resolveVia`'s single network call sits in the same ordered catch as SF-2 (Part-A constructors or `default → mapNameResolutionError`, total per SF-1 INV-6). The observing-client construction (`deriveObservingClient`) and the `ccipRead.request` wrapper introduce no new throw channel that escapes the call. The one sanctioned throw remains `RuntimeDisposedError`, raised by the factory guard proxy **before** the body.

**Applies to:** `resolveName`, `resolveVia`, `deriveObservingClient`, `deriveCoinType` (via its caller's catch).

**Enforcement mechanism:**
- Type system: closed-union return; `@throws {RuntimeDisposedError}` the sole documented throw.
- Runtime guard: `deriveCoinType` throw caught synchronously; `resolveVia`'s network call in `try` with a total catch; no `throw`/re-`throw` in either body.
- Test: fault-inject every expected class (`deriveCoinType` throwing `EnsInvalidChainIdError`; `TimeoutError`/`HttpError`/`ResolverNotFound`/non-`Error` primitive from `getEnsAddress`) → assert `resolveName` **resolves** (never rejects); a disposed capability **rejects** with `RuntimeDisposedError`.

**Violation scenario:** The `deriveCoinType` try/catch is dropped when the branch is "simplified"; an L2-bound resolve on a non-ENSIP-11 chainId throws `EnsInvalidChainIdError` as a rejection, and the UIKit — told expected failures never throw — has no `try/catch` there and crashes the address field.

**Severity:** Critical

### INV-12: `strict: true` is mandatory on `getEnsAddress` — on both client-selection branches

**Category:** Error Semantics

**Statement:** The single `getEnsAddress` call in `resolveVia` is **always** invoked with `strict: true`, on the mainnet-bound path **and** the L1 cross-chain path (preserves SF-2 INV-7 for the unified routine). Under `strict: true`, distinct failure classes (gateway HTTP failure, resolver-absent, unsupported profile, malformed offchain response) surface as typed reverts SF-5 classifies (INV-15) instead of collapsing into an indistinguishable `null`. `strict: false` is forbidden here: it would mask a v2 gateway outage as `NAME_NOT_FOUND`, defeating the never-silent-fallback contract (INV-14).

**Applies to:** `resolveVia` (the network call).

**Enforcement mechanism:**
- Type system: n/a (argument value).
- Runtime guard: the single call site passes `{ name: normalized, coinType, strict: true }`.
- Test: spy the mock client's `getEnsAddress` options on both branches → assert `strict === true`; a regression flipping it to `false` fails a dedicated assertion.

**Violation scenario:** `strict: true` is dropped on the L1 path "because cross-chain gateways are flaky"; a Base-scoped CCIP-Read gateway 500 returns `null`, SF-5 reports `NAME_NOT_FOUND`, and a name that resolves to a funded Base recipient is silently unreachable with no error signal — a fund-directing correctness failure.

**Severity:** Critical

### INV-13: `viaGateway = observed sawOffchain` on both paths — truthful gateway classification, no hardcoded `false`

**Category:** Error Semantics

**Statement:** On `resolveVia`'s catch path, the `viaGateway` field of the `mapNameResolutionError` context is the **observed** `sawOffchain` flag (INV-9), on **both** client-selection branches. SF-2 hardcoded `viaGateway: false`; SF-5 passes the real observation. This feeds SF-1 INV-10 (gateway-dominance): an ambiguous `TimeoutError`/`HttpRequestError` caught **after** an `OffchainLookup` was traversed dominates to `EXTERNAL_GATEWAY_ERROR` rather than `RESOLUTION_TIMEOUT` — including on the mainnet-bound CCIP-Read case, which SF-2 could not classify as gateway-dominant.

**Applies to:** `resolveVia` (catch → `default` arm ctx); consumes SF-1 INV-10.

**Enforcement mechanism:**
- Type system: `NameResolutionErrorContext.viaGateway?: boolean` (SF-1).
- Runtime guard: `mapNameResolutionError(error, { networkId, elapsedMs, viaGateway: sawOffchain })` — the same call-local flag INV-9 sets; no literal `false`.
- Test: with the observing hook fired, inject a `TimeoutError` → `EXTERNAL_GATEWAY_ERROR` (not `RESOLUTION_TIMEOUT`); with the hook not fired, the same `TimeoutError` → `RESOLUTION_TIMEOUT` (SF-1 INV-10 discriminates on the truthful flag).

**Violation scenario:** `viaGateway: false` is left hardcoded from SF-2; a v2 gateway that times out mid-CCIP-Read is reported `RESOLUTION_TIMEOUT`, the UIKit treats it as a generic transient timeout and retries against a stale path — the silent-fallback shape the spec forbids (SF-1 INV-10 violation scenario, realized on the v2 path).

**Severity:** Critical

### INV-14: Never a silent fallback — a single `strict` call; gateway failure → `EXTERNAL_GATEWAY_ERROR`, distinct from `NAME_NOT_FOUND`, no v2→v1 retry

**Category:** Error Semantics

**Statement:** Each `resolveName` performs **exactly one** `getEnsAddress` call (per selected client, INV-23) under `strict: true`; on a gateway/offchain failure it returns `EXTERNAL_GATEWAY_ERROR` (via SF-1's mapper, INV-13 driving gateway-dominance) — a code **distinct from `NAME_NOT_FOUND`** — and it **never** retries an on-chain/v1 lookup, never falls back to a stale result, never substitutes a different resolution mechanism. The "L1 path" is a *client-selection* choice made **before** the call (INV-17), not a v2→v1 resolution fallback: there is no second attempt anywhere in the control flow. This is the SF-5 realization of spec SF-5 scenario 2 and the "gateway-unreachable vs name-not-found" edge case.

**Applies to:** `resolveName`, `resolveVia`.

**Enforcement mechanism:**
- Type system: n/a (control flow).
- Runtime guard: one `await callClient.getEnsAddress(...)` in `resolveVia`; no retry loop, no second `getEnsAddress`/`readContract` on failure; the catch classifies and returns.
- Test: inject an `HttpError`/`OffchainLookupError` after the hook fires → `EXTERNAL_GATEWAY_ERROR` (never `NAME_NOT_FOUND`); assert `getEnsAddress` is called **exactly once** even on gateway failure (spy call-count); assert no on-chain re-read follows a gateway throw.

**Violation scenario:** A "resilience" wrapper catches the gateway `HttpError` and retries with `coinType: 60n` on the bound client; a v2 name whose gateway is merely down silently resolves to a stale/absent v1 record, the user sees a wrong-or-empty address with no error, and the spec's central v2 hazard is realized.

**Severity:** Critical

### INV-15: Forward-path classification stays total and closed over the seven-code union — SF-5 adds no code and no mapper row

**Category:** Error Semantics

**Statement:** Every terminal outcome of `resolveName` is a `ResolvedAddress` (success) or a member of the closed seven-code `NameResolutionError` union (failure); SF-5 introduces **no** new `code` and **no** new SF-1 mapper row (D-V8 preserved). `resolveVia`'s catch uses the **same ordered switch** as SF-2 (`ResolverNotFound`/`ResolverNotContract` → `NAME_NOT_FOUND`, `UnsupportedResolverProfile` → `UNSUPPORTED_NAME`, `default → mapNameResolutionError`, total per SF-1 INV-1/6), preserving SF-2 INV-10 and SF-1 INV-11 (not-found only on the control path). The only SF-5 additions to the failure surface are *which* control-path code fires for client-selection (`UNSUPPORTED_NETWORK`, INV-16/INV-17) — both already in the union.

**Applies to:** `resolveVia` (catch), `resolveName` (client-selection returns).

**Enforcement mechanism:**
- Type system: union return; the `default` arm's `mapNameResolutionError` return is `NameResolutionError`.
- Runtime guard: the ordered `switch` is unchanged from SF-2; no new `case` invents a code; no new mapper row is added in `error-mapping.ts` (SF-1, unmodified).
- Test: enumerate the forward class→code table (unchanged Part A + Part B) on both branches → each maps to its expected code; assert `error-mapping.ts` is byte-unchanged; feed an unclassifiable throw → `ADAPTER_ERROR` with `cause` preserved.

**Violation scenario:** SF-5 adds a `V2_GATEWAY_UNAVAILABLE` code for "clarity"; the UIKit's exhaustive seven-arm switch has no case, renders nothing, and SF-4's closed-union check fails the adapter.

**Severity:** Critical

### INV-16: `deriveCoinType` throw is contained → `UNSUPPORTED_NETWORK`, synchronously, before any I/O — never escapes

**Category:** Error Semantics

**Statement:** On the L1 cross-chain branch, `deriveCoinType(chainId)` (a thin wrapper over viem `toCoinType`) throws viem's `EnsInvalidChainIdError` for a non-EVM / out-of-range chainId. That throw is caught **synchronously in `resolveName`, before any network I/O**, and returns `{ ok: false, error: unsupportedNetwork(networkId) }`. It never escapes as a rejection (INV-11) and never reaches `resolveVia` or the mapper. A chainId that is EVM-addressable yields a `bigint` coinType and proceeds. This is the D-B `UNSUPPORTED_NETWORK` fallback extended to "bound network has an `ensL1Client` but its chainId is not ENSIP-11-addressable."

**Applies to:** `resolveName` (L1-branch `try/catch` around `deriveCoinType`); `deriveCoinType`.

**Enforcement mechanism:**
- Type system: `deriveCoinType(chainId: number): bigint` — documented `@throws EnsInvalidChainIdError`.
- Runtime guard: `try { coinType = deriveCoinType(id) } catch { return { ok:false, error: unsupportedNetwork(networkId) } }` — synchronous, before `resolveVia`.
- Test: an `ensL1Client`-wired capability on a non-ENSIP-11 chainId → `UNSUPPORTED_NETWORK` with **zero** `getEnsAddress` calls (spy); a valid EVM chainId → proceeds to exactly one call.

**Violation scenario:** The `deriveCoinType` throw is left uncaught; a config with an exotic bound chainId turns every resolve into a rejected promise, breaking never-throw (INV-11) for a case that should be a clean `UNSUPPORTED_NETWORK`.

**Severity:** High

### INV-17: Client-selection is a deterministic, gated sync precedence — bound → `ensL1Client` → `UNSUPPORTED_NETWORK` (D-B preserved)

**Category:** Error Semantics

**Statement:** Before any I/O, `resolveName` selects `(client, coinType)` by a fixed total precedence: **(1)** `supportsEns()` (bound network carries a Universal Resolver) → `client = publicClient`, `coinType = 60n` (mainnet-bound, unscoped); else **(2)** `ensL1Client` is present → `coinType = deriveCoinType(boundChainId)` (INV-16), `client = ensL1Client` (L1 cross-chain, chain-scoped); else **(3)** `UNSUPPORTED_NETWORK` (D-B preserved: an L2-bound resolve with **no** `ensL1Client` wired returns exactly what SF-2 returns today). First match wins; the whole ladder is synchronous and runs after the SF-2 shape/normalize gates but before the single network call. This extends SF-2 INV-12's precedence with the client-selection step.

**Applies to:** `resolveName` (client-selection ladder); `supportsEns()`.

**Enforcement mechanism:**
- Type system: n/a (control flow); `ensL1Client?` optional.
- Runtime guard: sequential `if/else if/else` early-returns; no unordered branch that could double-select.
- Test: bound-with-UR → mainnet-bound path, `coinType 60`; L2-bound **with** `ensL1Client` → L1 path, derived coinType; L2-bound **without** `ensL1Client` → `UNSUPPORTED_NETWORK` (D-B preserved, SF-2 parity); a mainnet-bound config with `ensL1Client` also present → still takes branch (1) (bound wins, no redundant L1 hop).

**Violation scenario:** The precedence is reordered so `ensL1Client` is checked first; a mainnet-bound resolve is needlessly routed to the (possibly rate-limited default) L1 client instead of the bound client, changing mainnet-bound wiring semantics D-V1 committed to keeping intact.

**Severity:** High

## Idempotency & Retry

### INV-18: Race-freedom of the `sawOffchain` observation — call-scoped ephemeral client + call-local flag; concurrent calls never cross-contaminate

**Category:** Idempotency & Retry

**Statement:** The offchain observation is **call-scoped**: each `resolveVia` invocation declares a fresh `let sawOffchain = false` and mints a **per-call** observing client via `deriveObservingClient(client, () => { sawOffchain = true })` whose `ccipRead.request` closes over *that* call's flag. No `sawOffchain` state is shared across calls, and the borrowed client's own `ccipRead.request` is never mutated. Therefore concurrent/interleaved `resolveName` calls over the **same** borrowed `publicClient`/`ensL1Client` **never cross-contaminate** each other's `external` observation: a CCIP-Read traversal in call A can never flip call B's flag. (AsyncLocalStorage was rejected — Node-only, adapter is browser-consumed; a shared client + shared flag was rejected — it races to a false `external`. D-V5.)

**Applies to:** `resolveVia`, `deriveObservingClient`.

**Enforcement mechanism:**
- Type system: n/a (concurrency property).
- Runtime guard: `sawOffchain` is a `resolveVia`-local `let`, captured only by the per-call client's hook; the source borrowed client is never assigned a new `ccipRead.request`.
- Test: launch N interleaved `resolveName` calls where a subset traverse CCIP-Read and the rest resolve on-chain, against one shared client → assert each result's `external` matches its **own** path (no A→B bleed); assert the borrowed client's `ccipRead` is unchanged after the calls; assert no module/instance-level `sawOffchain` field exists (grep).

**Violation scenario:** For "efficiency," the observing hook is installed **once** on the shared borrowed client writing a shared `this.sawOffchain`; under two concurrent resolves, an on-chain name's result reads `external: true` because a *different* concurrent name went offchain — a false provenance claim (INV-9 broken) and a determinism failure for SF-4.

**Severity:** Critical

### INV-19: Statelessness & determinism preserved — the only mutable state is call-scoped; structurally-equal `EnsProvenance` under stable state

**Category:** Idempotency & Retry

**Statement:** `EvmNameResolutionService` holds no resolution state (SF-2 INV-13 preserved): it caches/memoizes nothing and mutates no field across calls (it holds only the two read-only injected clients + the read-only bound config). The **only** mutable state SF-5 adds is the call-local `sawOffchain` (INV-18), which never escapes the call. Therefore, under stable chain/registry state, repeated `resolveName(name)` calls return **structurally-equal** results — including a structurally-equal (though distinct-identity, INV-3) `EnsProvenance` — and concurrent calls are independent (INV-18). This is what lets SF-4's deep-equal-under-cache-TTL determinism check apply to the v2 forward path (identity not required; structural equality is).

**Applies to:** `resolveName`, `resolveVia`, `buildEnsProvenance`, `deriveCoinType`, `scopedNetworkId`.

**Enforcement mechanism:**
- Type system: service fields `readonly` (both clients + config); no mutable cache field declared.
- Runtime guard: no module/instance mutable state beyond the call-local flag; each call builds a fresh result; no clock/RNG in the *success* output (`elapsedMs` is error-path only, INV-23).
- Test: two `resolveName` calls with equal input against a stable mock → `dequal`-equal results with distinct `provenance` identity; grep the service for instance-level mutable/cache state → none beyond the documented call-local flag.

**Violation scenario:** A per-name `external` cache is added keyed by name only; after a network switch (new capability instance), a stale `external:true` is served for a now-on-chain name, and SF-4's determinism check — or a real consumer's trust indicator — is wrong.

**Severity:** High

### INV-20: Read-only & retry-safe — both clients perform reads only; a retry re-reads and submits nothing

**Category:** Idempotency & Retry

**Statement:** `resolveName` performs a **read-only** RPC on the selected client (`getEnsAddress`) and **no** state-changing operation — no transaction submission, no KV/disk write, no external mutation — on either branch (SF-2 INV-14 preserved and extended to `ensL1Client`). A retry (at 1s, 1h, after a crash, from another process) submits nothing and simply re-reads; the operation is inherently idempotent with no idempotency key. Adding the L1 client and the per-call observing client introduces no write side effect.

**Applies to:** `resolveName`, `resolveVia`.

**Enforcement mechanism:**
- Type system: n/a.
- Runtime guard: the only external call is `callClient.getEnsAddress` (a read); no `writeContract`/`sendTransaction`/KV/fs API is imported or invoked.
- Test: spy both injected clients → assert only read methods called; assert no write/submit/persist API is reachable from `resolveName`/`resolveVia`/`deriveObservingClient`.

**Severity:** Medium

## Auth Boundary

**Not applicable — recorded explicitly.** SF-5 remains a **public read primitive**, exactly as SF-2: ENS v2 forward resolution (mainnet-bound or L1 cross-chain) reads publicly-readable on-chain/gateway state, carries no caller identity, gates no privileged operation, and holds no credential of its own. The new `ensL1Client` is a dependency-injected read client, not an authorization surface; its transport/RPC keys are the composing runtime's concern (INV-24 governs their non-leakage). There is nothing to authorize. The one lifecycle boundary — use-after-dispose — is unchanged from SF-2 (guard-proxy `RuntimeDisposedError`, INV-11), not an auth check. Network-scope admission (may this network resolve at all?) is a request-contract gate (INV-17), not an auth gate. Recorded rather than omitted, per coverage discipline.

## Side-Effect Ordering & Observability

### INV-21: Borrowed-client no-dispose ownership extends to `ensL1Client` and to the per-call observing client

**Category:** Side-Effect Ordering & Observability

**Statement:** Both injected clients — `publicClient` (D-A) and the new `ensL1Client` (D-V1) — are **owned by the composing runtime** (`shared.ts`) and **borrowed** by the capability: `dispose()` is a no-op with respect to both (never a transport close, never a nulled handle), and `cleanupStage` stays `'general'` (SF-2 INV-15 preserved, extended to the second client). The **per-call observing client** minted by `deriveObservingClient` is **SF-5-owned ephemeral** — it reuses the selected borrowed client's transport (**no new RPC connection**), is discarded when the call returns, and is **never disposed against the borrowed client** (disposing it must not tear down the shared transport). After a capability `dispose()`, both injected clients remain fully usable by the runtime and any other capability sharing them.

**Applies to:** `EvmNameResolutionService.dispose`, `createNameResolution` (cleanup registration), `deriveObservingClient`.

**Enforcement mechanism:**
- Type system: n/a (lifecycle/ownership).
- Runtime guard: `dispose()` touches no client method for either client; no `registerRuntimeCapabilityCleanup` for either; `deriveObservingClient` reuses transport (viem `custom(client)` / transport-config reuse) and calls no teardown on the borrowed source.
- Test: build a service over spy `publicClient` + spy `ensL1Client`, run resolves (exercising the observing client), then `dispose()` → assert **no** teardown/close called on either borrowed client and both remain callable; assert `cleanupStage === 'general'`; assert the observing client opens no second transport connection (spy transport constructor call-count).

**Violation scenario:** `deriveObservingClient` builds a brand-new client with its own transport and `dispose()` closes it against the shared handle; a second capability sharing `ensL1Client` suddenly fails all RPC after this capability disposes — an ownership violation manifesting as spurious `ADAPTER_ERROR`s elsewhere in the runtime.

**Severity:** High

### INV-22: Pre-I/O gating preserved and extended — client selection + `deriveCoinType` + shape/normalize all run before any `getEnsAddress` I/O

**Category:** Side-Effect Ordering & Observability

**Statement:** `resolveName` performs **no network I/O** until after all synchronous gates pass, evaluated in this order: (a) the SF-5 client-selection / network-support ladder (INV-17) — including the synchronous `deriveCoinType` (INV-16) — runs **first**, then (b) the SF-2 shape gate + normalize. Because network/client selection precedence is evaluated **before** name-shape validation, an input that is **both** an invalid/unnormalizable name **and** on an unsupported network returns `UNSUPPORTED_NETWORK` (not `UNSUPPORTED_NAME`), matching SF-2's own precedence and preserving zero regression. An unsupported network (no UR + no `ensL1Client`, or a non-addressable chainId) and an invalid/unnormalizable name still each return their typed code with **zero** `getEnsAddress` calls (SF-2 INV-16 preserved, extended over the new client-selection step). At most **one** network round-trip follows, on the selected client. This selection-before-shape ordering is the delivered behavior; it differs from the original shape-first wording only for the both-invalid input class.

**Applies to:** `resolveName` (gate + selection ordering).

**Enforcement mechanism:**
- Type system: n/a (ordering).
- Runtime guard: shape/normalize gates and the client-selection ladder are early-returns positioned before the single `getEnsAddress` in `resolveVia`.
- Test: with spy clients, call on unsupported-network, non-addressable-chainId, and invalid-name inputs → assert `getEnsAddress` **never** invoked on either client; a valid name + supported network → invoked **exactly once** on the correct client.

**Severity:** Medium

**Amendment (2026-07-04):** INV-22 Statement reworded from the original *shape-first* ordering to **selection-before-shape**, to match the delivered SF-5 behavior (Code drift #1) and SF-2's own precedence — client/network selection is evaluated before name-shape validation, so a *both* invalid-name-**and**-unsupported-network input returns `UNSUPPORTED_NETWORK` rather than `UNSUPPORTED_NAME`. Fix-forward doc sync: the delivered behavior is correct and zero-regression; the change affects only that both-invalid input class.

## Resource Limits & Rate

### INV-23: Bounded work per call — at most one UR round-trip on the selected client; no retry loop; `elapsedMs` measured; observing client reuses transport

**Category:** Resource Limits & Rate

**Statement:** A single `resolveName` performs **at most one** Universal-Resolver round-trip on the selected client (viem's own CCIP-Read traversal within that call is viem's bounded concern), runs **no** retry/backoff loop of its own (reinforcing INV-14), and allocates no unbounded structure — work is O(1) plus one bounded network call plus one cheap per-call client that **reuses the borrowed transport** (INV-21, no new connection). SF-5 owns no resolution-scoped timeout budget; it relies on the injected client's transport timeout and **measures** wall-clock via `performance.now()` around the call, supplying a finite `ctx.elapsedMs` to `mapNameResolutionError` on the timeout/transport path (SF-1 INV-12 caller obligation, SF-2 INV-18 preserved) alongside `viaGateway: sawOffchain` (INV-13).

**Applies to:** `resolveVia` (the single-call bound + catch-site `elapsedMs`/`viaGateway`); `deriveObservingClient` (transport reuse).

**Enforcement mechanism:**
- Type system: `NameResolutionErrorContext.elapsedMs?: number` (SF-1).
- Runtime guard: `const started = performance.now()` before the call; `elapsedMs: performance.now() - started` in the ctx; no loop around the call; observing client reuses transport.
- Test: assert exactly one `getEnsAddress` per `resolveName`; inject a `TimeoutError` → mapped `RESOLUTION_TIMEOUT.elapsedMs` finite `>= 0` (not `-1`); assert the observing client adds no second transport connection.

**Severity:** Medium

## Sensitive Data Handling

### INV-24: No new credential-leak channel — `ensL1Client`'s mainnet RPC key never surfaces; `system`/`coinType`/`scopedToNetworkId` are non-secret; redaction still routes only through SF-1

**Category:** Sensitive Data Handling

**Statement:** SF-5 introduces **no** channel that could leak credentials. The new `ensL1Client` is built (in `shared.ts`) from a mainnet RPC endpoint that **may carry an API key** (`resolveMainnetRpcUrl`); that URL/key **never** appears in `EnsProvenance` (`label` is a curated literal — INV-8; `system`/`coinType`/`scopedToNetworkId` are non-secret internal facts — the `networkId` is a namespace identifier, not a secret) and **never** in an SF-5-constructed error field. Every native (viem/RPC/gateway) message-derived string still reaches a returned error **only** through SF-1's `mapNameResolutionError`, which applies credential redaction (SF-1 INV-16) and keeps the unredacted original only on the opaque `ADAPTER_ERROR.cause`. SF-5 constructs no free-text error field from a raw native message (preserves SF-2 INV-19).

**Applies to:** `buildEnsProvenance` (`label`/fields), `resolveVia` (control-path error construction + `default` delegation), `shared.ts` (`ensL1Client` construction stays in the registration layer, its RPC URL never threaded into provenance/errors).

**Enforcement mechanism:**
- Type system: n/a (value-level content).
- Runtime guard: no `error.message`/`String(error)`/RPC-URL placed on any SF-5-returned field; `label` constant; provenance fields are enums/ids.
- Test: build `ensL1Client` with an RPC URL embedding `…/v2/SECRETKEY`; fault-inject a viem error whose message also embeds it → assert the SF-5-returned `EXTERNAL_GATEWAY_ERROR`/`ADAPTER_ERROR` renderable fields (produced via the mapper) do not contain `SECRETKEY`, while `cause` may; assert `EnsProvenance.label`/`system`/`scopedToNetworkId` contain no `://` or key-shaped substring on both branches.

**Violation scenario:** A debug field is added to `EnsProvenance` carrying the resolving client's endpoint; the keyed mainnet RPC URL renders in the UIKit wherever provenance is shown — a credential leak that also fails SF-4's `label`/user-safe checks if it lands in `label`.

**Severity:** High

## Performance, Scalability & Re-usability

### INV-25: Dependency-injection seam preserved and extended — `ensL1Client` injected, never constructed in the service; re-usable via config only

**Category:** Performance, Scalability & Re-usability

**Statement:** The capability takes **all** host dependencies by injection (SF-2 INV-20 preserved): the bound `publicClient` and now the optional `ensL1Client` via `CreateNameResolutionOptions`, plus the network config. The service **constructs no client internally** — the mainnet L1 client is built in the registration layer (`shared.ts`), injected, not `new`-ed in `service.ts` (D-A philosophy, D-V1). It imports no concrete singleton and hardcodes no host/RPC reference. A different host (another app, RI, or a unit test) embeds the v2-capable capability by passing a different `publicClient` + `ensL1Client` + config and changing **no source**. `EnsProvenance`/`isEnsProvenance` are exported for downstream narrowing without pulling in the service.

**Applies to:** `createNameResolution`, `createEvmNameResolutionService`, `EvmNameResolutionService`, `CreateNameResolutionOptions`.

**Enforcement mechanism:**
- Type system: factory/ctor params are the sole dependency inlets; `ensL1Client?` optional; UIKit-type imports are `import type`.
- Runtime guard: no `createEvmPublicClient`/`ensL1Client()` builder call inside the service (that lives in `shared.ts`); no module-level singleton.
- Test: instantiate the service in a bare test with a hand-rolled mock `ensL1Client` and no host wiring → assert the L1 path resolves; assert the service source contains no client-builder call for `ensL1Client`.

**Severity:** Medium

### INV-26: Additive, optional API-compat — new optional field + defaulted ctor param + new exports; base type unchanged; non-EVM unaffected (SC-006)

**Category:** Performance, Scalability & Re-usability

**Statement:** SF-5 is **additive at the type level**: a new **optional** `ensL1Client?` on `CreateNameResolutionOptions`, a new ctor param defaulted-absent, and new exported symbols (`EnsProvenance`, `isEnsProvenance`, `buildEnsProvenance`, `deriveCoinType`, `scopedNetworkId`); base `ResolutionProvenance` is unchanged (INV-4). The `resolveName(name)` signature is unchanged (UIKit SF-1 locked, D-V2). Non-EVM adapters (`adapter-solana`, `adapter-midnight`, `adapter-polkadot`, `adapter-stellar`) are untouched and keep type-checking/building/passing (SC-006 preserved) — the capability stays additive and optional at the runtime-map level. **Migration:** a runtime that does **not** wire `ensL1Client` still resolves mainnet-bound exactly as before, only its forward-success `provenance` is now an `EnsProvenance` **superset** of the base (all base fields still present) — a minor release, not a break. (The only *behavioral* change — SF-2's forward-success provenance shape — is the SF-2 re-baseline the Design flagged; that is an SF-5 **Code** concern, not an invariant.)

**Applies to:** `CreateNameResolutionOptions`, `createNameResolution`, the `@openzeppelin/adapter-evm-core` barrel + `src/index.ts` re-exports, `shared.ts` registration.

**Enforcement mechanism:**
- Type system: `ensL1Client?` optional; new exports are additive; base type imported unchanged.
- Runtime guard: `shared.ts` passes `ensL1Client` into both factory maps; the bound `ensClient` builder is unchanged.
- Test: a runtime built **without** `ensL1Client` resolves mainnet-bound and returns an `EnsProvenance` whose base fields (`label`,`external`) are present; a non-EVM adapter's suite runs unchanged (SC-006 regression check); `expectTypeOf` confirms `ensL1Client` is optional.

**Severity:** Medium

## Existing Invariants (Extension Mode)

SF-5 adds `src/name-resolution/ens-provenance.ts`; modifies `src/name-resolution/service.ts`, `src/name-resolution/index.ts`, `src/capabilities/name-resolution.ts`, `src/index.ts` (barrel/re-exports); and `packages/adapter-evm/src/profiles/shared.ts` (adds the `ensL1Client` builder). It changes **one** behavior: the forward-success `provenance` shape.

### Preserved (must not break — re-verified against the restructured `resolveName`/`resolveVia`)
- **SF-2 INV-1** return-shape closure → **INV-1** (re-verified over the new return paths).
- **SF-2 INV-2** no-coerced/placeholder address, `value.name` = original → **INV-2**.
- **SF-2 INV-6** never-throw (sole `RuntimeDisposedError`) → **INV-11**.
- **SF-2 INV-7** `strict:true` mandatory → **INV-12** (both branches).
- **SF-2 INV-8 / INV-9** not-found sourcing + not-found only on control path (preserves SF-1 INV-11) → carried inside **INV-15** (classification unchanged).
- **SF-2 INV-10** total+closed seven-code classification → **INV-15**.
- **SF-2 INV-12** deterministic precedence → **INV-17** (extended with client selection).
- **SF-2 INV-13** statelessness/determinism → **INV-19** (with the call-scoped `sawOffchain` carve-out, INV-18).
- **SF-2 INV-14** read-only/retry-safe → **INV-20**.
- **SF-2 INV-15** borrowed-client no-dispose → **INV-21** (extended to `ensL1Client` + observing client).
- **SF-2 INV-16** pre-I/O gating → **INV-22** (extended over client selection + `deriveCoinType`).
- **SF-2 INV-18** bounded work + `elapsedMs` → **INV-23**.
- **SF-2 INV-19** curated strings / redaction-only-via-SF-1 → **INV-8 + INV-24**.
- **SF-2 INV-20** DI seam → **INV-25** (extended to `ensL1Client`).
- **SF-2 INV-3 / INV-4 / INV-21** (`isValidName`/`normalizeName` shape gate, hot-path predicate) — **UNCHANGED and untouched** by SF-5; the SF-2 shape/normalize gate runs before client selection (INV-22). No SF-5 re-statement needed.
- **SF-2 INV-17** (`dispose()` idempotent & observably inert) — **UNCHANGED**; SF-5 does not modify `dispose()` beyond the ownership extension noted in INV-21. `dispose()` remains a debug-log-or-noop, idempotent via the guard.
- **SF-1** `error-mapping.ts` (`mapNameResolutionError` + constructors) — **imported, not modified**; SF-5 adds no row and no code (INV-15). SF-1 INV-10/INV-11/INV-12/INV-16 preserved and relied upon (INV-13/14/23/24).
- **UIKit `@openzeppelin/ui-types`** — base `ResolutionProvenance`/`ResolvedAddress`/`ResolutionResult`/`NameResolutionError` **never modified** (INV-4, INV-26).
- **Non-EVM adapters** — untouched, additive/optional (SC-006) → **INV-26**.

### Modified
- **SF-2 INV-5** (`baseEnsProvenance()` → `{ label:'ENS', external:false }`, no scope, on the forward success path): **the function is UNCHANGED** but the **forward path no longer calls it** — it now calls `buildEnsProvenance(...)` on every success (INV-3). `baseEnsProvenance()` becomes **reverse-only** (SF-3's `resolveAddress`), where its own SF-3 tests keep it green. The forward-success `provenance` output changes from `{ label:'ENS', external:false }` to `{ system:'ens', label:'ENS'|'ENS via external gateway', external:<observed>, coinType:60, scopedToNetworkId?:… }` — a **superset** (base fields still present, INV-4). *Note:* re-baselining SF-2's provenance **tests** to this output is an SF-5 **Code** concern (the Design's Step-Back Suggestion), not an invariants change.
- **SF-2 INV-19 label discipline** (single `'ENS'` literal): widened to the two-literal set `'ENS' | 'ENS via external gateway'` chosen from observed `external` (INV-8) — still user-safe, still allowlist-passing.

### New
- INV-3, INV-4, INV-5, INV-6, INV-7, INV-8, INV-9, INV-10 (EnsProvenance type/guard/build + truthful/scoped/observed contract), INV-13, INV-14, INV-16, INV-17 (viaGateway-truthful, no-silent-fallback, deriveCoinType containment, client selection), INV-18 (race-freedom), INV-21 (ownership extension), INV-24 (RPC-key non-leak), INV-25/INV-26 (DI + API-compat extensions).

## Invariant Coverage Matrix

| Function / surface | Invariants | Enforcement |
|--------------------|-----------|-------------|
| `resolveName()` (modified) | INV-1, INV-2, INV-11, INV-14, INV-15, INV-16, INV-17, INV-19, INV-20, INV-22 | Req/Res + Err + Idem + Order/Obs |
| `resolveVia()` (new success routine) | INV-1, INV-2, INV-3, INV-9, INV-11, INV-12, INV-13, INV-14, INV-15, INV-18, INV-20, INV-23 | Req/Res + Err + Idem + Rate |
| `buildEnsProvenance()` (new) | INV-3, INV-4, INV-5, INV-6, INV-7, INV-8, INV-9, INV-19, INV-24 | Req/Res + Idem + SensitiveData |
| `isEnsProvenance()` (new guard) | INV-4, INV-5, INV-10 | Req/Res (SC-005) |
| `deriveCoinType()` (new) | INV-6, INV-11, INV-16 | Req/Res + Err |
| `scopedNetworkId()` (new helper) | INV-7, INV-19 | Req/Res + Idem |
| `deriveObservingClient()` (new) | INV-9, INV-18, INV-21, INV-23 | Req/Res (observation) + Idem (race) + Order/Obs + Rate |
| `EnsProvenance` (type) | INV-4, INV-5, INV-6, INV-7 | Req/Res (superset + fields) |
| `dispose()` | INV-21 (+ preserved SF-2 INV-17) | Order/Obs (ownership + idempotent inert) |
| `CreateNameResolutionOptions` (type) | INV-21 (`ensL1Client` borrowed), INV-25 (DI), INV-26 (optional) | Ownership + Re-usability |
| `createNameResolution()` (factory) | INV-1, INV-11, INV-21, INV-25, INV-26 | Req/Res + Err + Order/Obs + Perf/Reuse |
| `ensL1Client` builder + registration (`adapter-evm/shared.ts`) | INV-17, INV-21, INV-24, INV-25, INV-26; SC-006 | Err (D-B) + Ownership + SensitiveData + Perf/Reuse + additive-optional |

## Out of Scope

- **The SF-2 provenance-test re-baseline** — the ~6 SF-2 provenance assertions + the `buildEnsProvenance` switch in the mainnet-bound branch are an SF-5 **Code** concern (Design Step-Back Suggestion), coordinated by the Orchestrator as a controlled SF-2 amendment. Not an invariants property; explicitly excluded per the Orchestrator directive.
- **`provenance.external` → v2-mechanism (registry / ccip-read) boundary** — **OPEN for UIKit SF-6** (Open Q1). SF-5 surfaces only the raw observable `external` (INV-9) and pins no mechanism contract.
- **Reverse resolution / `resolveAddress` / `forwardVerified` / avatar** — SF-3. `baseEnsProvenance()` stays reverse-only (`isEnsProvenance` returns `false` on it — INV-10). Unifying forward+reverse provenance is a future slice.
- **Namechain / L2-registry resolution** — cancelled (G5); `'namechain'` mechanism value dropped (never encoded).
- **`version: 'v1'|'v2'` provenance** — not observable from viem's `Address|null` (G4); deliberately not carried; `system` is the discriminant (INV-5).
- **Explicit target-chain parameter on `resolveName`** — breaking UIKit SF-1 change; target = bound network (D-V2).
- **The mapper's internal class→code table + redaction internals** — SF-1 (INV-1/6/16); SF-5 adds no row (INV-15) and relies on SF-1's redaction (INV-24).
- **The conformance harness enforcing several of these (concrete guard, never-throw, determinism, user-safe label, `isEnsProvenance` for SC-005)** — SF-4. SF-5 defines the properties; SF-4 builds the parameterized checks.
- **A resolution-scoped timeout budget / `AbortController`** — SF-5 relies on transport timeout and measures `elapsedMs` (INV-23); an owned budget is a possible future extension.
- **Rate limiting / admission control; `resolveMainnetRpcUrl` precedence + rate-limit caveat** — the mainnet RPC selection precedence is a `shared.ts` **wiring** detail for SF-5 Code (Design Open Q4); no rate surface exists at this stateless-read layer.
- **Auth** — no authorization surface (see Auth Boundary).

## Dev Notes

- **Discharges Design Open Q3 (for Invariants):** the `external`-truthfulness property is stated precisely as INV-9 (`external === true` **iff** an `OffchainLookup` was actually followed during *this* resolution, observed via the per-call `ccipRead.request`, on every forward path, never inferred) and the race-freedom property as INV-18 (concurrent `resolveName` calls never cross-contaminate `sawOffchain`). Both are **delivered** properties, not accepted gaps.
- **Carries Design Open Q1:** `external` → v2-mechanism boundary stays OPEN for UIKit SF-6. Do not let a Code-stage convenience pin it.
- **The one fragile seam is `deriveObservingClient` (viem-internal `ccipRead.request`).** INV-9's test **must** include a probe that fails if the hook stops firing on `test.offchaindemo.eth`, plus a chain-scoped probe (a name differing mainnet vs Base) for INV-7. A viem major bump re-validates INV-9 (hook contract), INV-12 (`strict`), INV-6 (`toCoinType` range), and INV-15 (revert surface) — pin to `viem@2.44.4` with a version-tying comment (Design Dev Notes).
- **`viaGateway` truthfulness (INV-13) is the load-bearing behavioral change** vs SF-2's hardcoded `false`. Its interaction with SF-1 INV-10 (gateway-dominance) is what makes INV-14 (no silent fallback) real on the mainnet-bound CCIP-Read case, not just the L1 path. Tests should pin the timeout-with-vs-without-hook discrimination on **both** branches.
- **Label allowlist coordination (INV-8):** the design chose `'ENS via external gateway'` (space-separated, **hyphen-free**) precisely so it passes SF-4's proposed allowlist `/^[A-Za-z][A-Za-z0-9 ]{0,63}$/` without SF-4 having to widen its char-class for a hyphen (SF-4 Research Open Q2). If SF-4 widens the allowlist to admit hyphens, the label wording is not constrained by it; if SF-4 keeps the char-class, this label already conforms. Either way, no cross-SF blocker.
- **Determinism scoping for SF-4 (INV-19):** deep-equal the forward **core** (`{ name, address, provenance }`) with structural (not identity) equality; `EnsProvenance` objects are distinct-identity per success (INV-3) but structurally equal under stable state. This mirrors SF-3's avatar-vs-determinism caveat.
- **`coinType` `bigint`→`number` (INV-6):** `getEnsAddress` takes the `bigint` from `toCoinType`; `EnsProvenance.coinType` is the `Number()` of it. Code stage confirms both the `getEnsAddress` `bigint` acceptance and the safe-integer store.

## Open Questions

*(Narrower follow-ups for Code Draft; Design Open Q1 is carried (UIKit SF-6), Q2 is resolved (D-V8), Q3 is discharged as INV-9/INV-18.)*

1. **`deriveObservingClient` transport-reuse mechanism (INV-21/INV-23).** Design leaves the exact viem mechanism to Code (`custom(client)` vs transport-config reuse). Confirm the chosen mechanism (a) reuses the borrowed client's transport with **no** new RPC connection and (b) does **not** mutate or dispose the borrowed client — the two properties INV-21/INV-23 rest on. If viem forces a fresh transport, INV-23's "no new connection" softens to "one cheap clone, disposed with the call, borrowed transport untouched" — surface the deviation.
2. **Mainnet-bound + `ensL1Client` both present (INV-17 branch 1).** Confirmed to take the bound branch (no redundant L1 hop). Worth a Code assertion/comment so a future reorder doesn't silently route mainnet through the (possibly rate-limited default) L1 client.
3. **`scopedNetworkId` helper vs inline (INV-7).** Design lists a `scopedNetworkId` export; since D-V6 collapses the coinType-inverse to "use the bound `networkId` directly," confirm whether the helper is a thin passthrough (bound `networkId` when `coinType !== 60`) or is dropped in favor of an inline conditional in `buildEnsProvenance`. Either satisfies INV-7; keep the coverage-matrix row pointed at wherever the logic lands.
