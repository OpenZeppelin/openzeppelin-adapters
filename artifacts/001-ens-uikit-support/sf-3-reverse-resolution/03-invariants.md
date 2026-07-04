---
stage: invariants
project: ens-uikit-support
sub_feature: sf-3-reverse-resolution
repo: openzeppelin-adapters
mode: extension
extends: packages/adapter-evm-core/src
status: draft
timestamp: 2026-07-04
author: aleksandr.pasevin
previous_stage: artifacts/001-ens-uikit-support/sf-3-reverse-resolution/02-design.md
tags: [ens, name-resolution, reverse-resolution, forward-verification, avatar, viem, getEnsName, getEnsAvatar, invariants, capability, evm, adapter, service]
---

# SF-3 · Reverse resolution + forward-verification + avatar — Invariants

## Summary

SF-3 is a **display-layer identity-safety core**: the hazard it defends against is a *spoofed name* — a
reverse record pointing to a name whose forward record points elsewhere — being rendered as trusted. The
sharpest invariants therefore make it structurally impossible for the adapter to surface a name it has
not forward-verified: `forwardVerified` is a concrete boolean that is the **constant literal `true`** on
every returned name (INV-3), and a forward-mismatch is **suppressed** — never surfaced — folding to
`ADDRESS_NOT_FOUND` (INV-11). The organizing principle is the same as SF-2's forward core, one direction
over: *`strict: true` + a deterministic, total, closed classification*. `getEnsName` is driven with
`strict: true` (INV-7) so distinct failure classes surface instead of collapsing into `null`, and every
reverse outcome lands on exactly one member of the closed seven-code union (INV-10) under a fixed
precedence (INV-12). Every "no usable, forward-verified reverse record" outcome — a `null` return, the
`ReverseAddressMismatch` suppress, the address-scoped resolver reverts, and a malformed-address input —
folds to `ADDRESS_NOT_FOUND` on SF-3's own control path via SF-1's existing `addressNotFound` constructor
(INV-8/INV-9), so **SF-1's mapper is untouched and INV-11-of-SF-1 is preserved — SF-3 raises no drift**.
Around that core sit the never-throw contract (INV-6) and a dedicated **avatar-isolation** family: the
best-effort `getEnsAvatar` lookup runs strictly after a successful reverse and can only add or omit an
`avatarUrl` — it never fails, throws, delays classification, or participates in the error surface
(INV-17), and its output is untrusted, name-owner-controlled content passed through verbatim (INV-19).
Auth is `n/a` — reverse resolution is a public read primitive; the only lifecycle gate is use-after-dispose,
enforced by the factory's guard proxy. This artifact discharges Design Open Q3 (encode `forwardVerified ===
true` as an invariant) as INV-3, and carries Design Open Q1/Q2 (`UnsupportedResolverProfile` and
`ReverseAddressMismatch` fork coverage) forward to Tests as noted.

## Bindings from prior stages (what this stage builds on)

Surfaced for traceability; each is a fixed commitment here, confirmed by the Orchestrator at activation
and matched against `02-design.md` on disk.

- **Public API surface (Design):** `resolveAddress(address): Promise<ResolutionResult<ResolvedName>>` as a
  **new method** on SF-2's existing `EvmNameResolutionService` (no new file, no new factory); the private
  `tryGetAvatar(name): Promise<string | undefined>` helper. `isValidName` / `resolveName` / `dispose()` /
  `supportsEns()` / the constructor / the `createNameResolution` factory / the `nameResolution`
  registration slot are **unchanged** from SF-2.
- **Design decisions:** D-R2 (Approach A — SUPPRESS-on-mismatch; rely on the UR's built-in
  forward-verification), D-R3 (`forwardVerified` constant `true` on the success path), D-R1
  (malformed address → `ADDRESS_NOT_FOUND`, sync, before I/O), D-R4 (`UnsupportedResolverProfile` →
  `ADDRESS_NOT_FOUND`), D-R5 (avatar is separate, name-keyed, best-effort, failure-isolated), D-R6 (echo
  the caller's `address` verbatim; no adapter-side re-checksum), D-R7 (SF-3 owns the finalized reverse
  class→code table: Part A control-path constructors + Part B SF-1 mapper), `strict: true` mandatory on
  `getEnsName`, `coinType` stays `60n` (chain-scoped is SF-5). Reuses SF-2's D-A (inject the
  `PublicClient`) and D-B (sync UR support-gate → `UNSUPPORTED_NETWORK`).
- **Cross-SF (SF-1):** `mapNameResolutionError` + `addressNotFound` / `unsupportedNetwork` are imported,
  pure, and **not modified**. SF-1 INV-1/INV-6 (codomain closure + totality) make the Part-B delegation
  total; SF-1 INV-11 (mapper never emits not-found — `ADDRESS_NOT_FOUND` is a not-found) is preserved by
  keeping all `ADDRESS_NOT_FOUND` production on SF-3's control path (INV-9); SF-1 INV-12 (`elapsedMs`
  caller obligation) binds SF-3's reverse catch site (INV-18).
- **Cross-SF (SF-2):** the borrowed-client no-dispose ownership (SF-2 INV-15), the sync pre-I/O
  support-gate (SF-2 INV-16), the statelessness (SF-2 INV-13), the DI seam (SF-2 INV-20), and the fixed
  user-safe `baseEnsProvenance()` shape (SF-2 INV-5) are inherited and extended to the reverse path.
- **Cross-repo (UIKit SF-1):** the `NameResolutionCapability` interface, `ResolutionResult` /
  `ResolvedName` / `ResolutionProvenance` value types, and the `NameResolutionError` union are imported
  from `@openzeppelin/ui-types` and are **never modified** here. UIKit INV-6 (`forwardVerified` always a
  concrete boolean) and spec SC-003 are the cross-repo obligations INV-3 realizes on the adapter side.

---

## Request/Response Contract

### INV-1: `resolveAddress` return-shape closure — always a discriminated `ResolutionResult`, never a bare value

**Category:** Request/Response

**Statement:** For every input, `resolveAddress(address)` resolves to a value that is a member of the
`ResolutionResult<ResolvedName>` discriminated union: either `{ ok: true, value: ResolvedName }` or
`{ ok: false, error: NameResolutionError }`. It never resolves to `undefined`, `null`, a `{ ok: true }`
without `value`, a `{ ok: false }` without `error`, or an object missing the `ok` discriminant; and for an
*expected* failure it never rejects (see INV-6). Every consumer can branch on `result.ok` and reach a
defined arm.

**Applies to:** `EvmNameResolutionService.resolveAddress`, and the guarded capability surface returned by
`createNameResolution`.

**Enforcement mechanism:**
- Type system: return type annotated `Promise<ResolutionResult<ResolvedName>>` (the closed union imported
  from `@openzeppelin/ui-types`); every `return` path is checked against it, and the `default →
  mapNameResolutionError` branch (total per SF-1 INV-1) makes the function total at the type level.
- Runtime guard: every branch returns an explicit `{ ok }` literal; the sole non-return exit is the guard
  proxy's `RuntimeDisposedError` throw (INV-6).
- Test: sweep `resolveAddress` over success, `null`-return, each classified revert (`ReverseAddressMismatch`,
  `ResolverNotFound`, `ResolverNotContract`, `UnsupportedResolverProfile`), an unsupported network, a
  malformed address, and a raw transport throw — assert each resolves to a `{ ok }`-shaped value with the
  discriminant present.

**Violation scenario:** A new revert branch slips in as a `return undefined`; the UIKit SF-4 display hook
does `if (result.ok)` on `undefined`, takes the `else` arm, reads `result.error.code` → `TypeError`, and an
address that has a perfectly good primary name renders as a hard crash in the display path.

**Severity:** Critical

### INV-2: Success-value fidelity — the returned name is the verbatim non-null string; the address is echoed; nothing is coerced or placeheld

**Category:** Request/Response

**Statement:** On `{ ok: true }`, `value.name` is exactly the non-`null` string `getEnsName` returned for
the queried address — never a truncated / re-cased / placeholder / default-substituted value. A `null`
return (empty reverse record) is **never** presented as success (it is `ADDRESS_NOT_FOUND`, INV-8).
`value.address` echoes the **caller's original input** `address` verbatim (it already passed
`isValidEvmAddress`), with **no adapter-side re-checksum or normalization** (D-R6). `value.provenance` is a
freshly-built `baseEnsProvenance()` (INV-5). `value.forwardVerified` is `true` (INV-3); `value.avatarUrl`
is present only when the avatar lookup surfaced one (INV-4).

**Applies to:** `EvmNameResolutionService.resolveAddress` (success arm).

**Enforcement mechanism:**
- Type system: `ResolvedName.name: string`, `ResolvedName.address: string` (owned by UIKit SF-1); the
  success literal is constructed only inside the `name !== null` branch, past the `null` early-return.
- Runtime guard: the `if (name === null) return addressNotFound(address)` check precedes the success
  construction, so `null` can never flow into `value.name`; `address` is passed through with no transform.
- Test: reverse-resolve a known address against a mocked client returning a fixed name → assert `value.name`
  is byte-identical and `value.address` equals the exact input string (mixed-case/lowercase preserved);
  assert a `null` return yields `ADDRESS_NOT_FOUND`, never `{ ok: true, name: '' }` or a synthesized name.

**Violation scenario:** A "convenience" coercion maps a `null` return to the truncated-hex string as a
sentinel name; the UIKit renders that hex-shaped string as a *name* with `forwardVerified: true`, and a user
trusts a fabricated identity — the exact display-layer identity hazard the High stakes rating names.

**Severity:** Critical

### INV-3: `forwardVerified` is a concrete boolean and is the constant literal `true` on every returned name

**Category:** Request/Response

**Statement:** On every `{ ok: true }` result, `value.forwardVerified` is a **concrete boolean** — never
`undefined`, never absent — and under this adapter (Approach A) it is the **constant literal `true`**. The
adapter returns a name *only* when viem's Universal Resolver has already forward-verified that
`forward(name) === address` inside `reverseWithGateways` (D-R3); there is no code path that constructs a
success value with `forwardVerified: false` or with the field omitted. This is the SF-3 realization of
**UIKit INV-6** (*"always a concrete boolean, never `undefined`"*) and spec **SC-003**, and it gives the
SF-4 conformance harness a precise expected value (`=== true`) for this adapter while remaining compatible
with the general contract (which permits `false` for a *different* adapter that skips verify for latency).
(Discharges Design Open Q3.)

**Applies to:** `EvmNameResolutionService.resolveAddress` (success arm); the `forwardVerified` field of every
`ResolvedName` this adapter emits; SF-4's concrete-boolean check; UIKit SF-4 display.

**Enforcement mechanism:**
- Type system: `ResolvedName.forwardVerified: boolean` (required, non-optional — UIKit SF-1); the success
  literal sets it to the literal `true`, so the compiler rejects an omission or a non-boolean.
- Runtime guard: a single success-construction site; `forwardVerified: true` is a literal, not a variable
  that could ever hold `false`/`undefined`. No `forwardVerified: false` literal exists anywhere in SF-3.
- Test: on every success case assert `typeof value.forwardVerified === 'boolean'` **and** `value.forwardVerified
  === true`; grep the source to assert no `forwardVerified: false` and no `forwardVerified: undefined`
  construction exists; feed the SF-4 harness this adapter and assert its concrete-boolean invariant passes.

**Violation scenario:** A future "surface the name even on mismatch" tweak sets `forwardVerified: false` for
a mismatched name (reverting Approach A without the display layer's consent); the UIKit renders the name
because its portable code trusts the adapter to have suppressed spoofable names, and a spoofed identity is
shown — or, subtler, the field is left `undefined` by a refactor and UIKit INV-6 / SC-003 break, failing the
conformance harness.

**Severity:** Critical

### INV-4: `avatarUrl` optionality — present only for a real avatar, key-absent otherwise, never null / never a fabricated value

**Category:** Request/Response

**Statement:** `value.avatarUrl` is present **iff** `tryGetAvatar(name)` returned a non-`undefined` string;
otherwise the `avatarUrl` **key is absent** from the success value (the spread `...(avatarUrl !== undefined ?
{ avatarUrl } : {})` never emits `avatarUrl: undefined` or `avatarUrl: null`). When present, it is the exact
string viem's `getEnsAvatar` produced — the adapter neither fabricates, rewrites, nor validates it (see INV-19
for its untrusted nature). Absence of `avatarUrl` is **never** an error and never downgrades the result: a
name with no avatar (or a failed avatar lookup) is still a full `{ ok: true, forwardVerified: true }` success.

**Applies to:** `EvmNameResolutionService.resolveAddress` (success arm); `tryGetAvatar`.

**Enforcement mechanism:**
- Type system: `ResolvedName.avatarUrl?: string` (optional — UIKit SF-1); the conditional spread constructs
  the key only in the defined branch, so `exactOptionalPropertyTypes`-style narrowing holds.
- Runtime guard: `tryGetAvatar` returns `string | undefined` (never `null` — `avatar ?? undefined`
  normalizes it); the success literal spreads it conditionally.
- Test: mock `getEnsAvatar` → a URL string → assert `'avatarUrl' in value` and `value.avatarUrl === <url>`;
  mock it → `null` and → a throw → assert `'avatarUrl' in value === false` (key absent) and the result is
  still `{ ok: true }`; assert `value.avatarUrl` is never literally `null`.

**Violation scenario:** The success literal always sets `avatarUrl: avatar` (unconditional); a name with no
avatar now carries `avatarUrl: null`, and a UIKit `<img src={avatarUrl}>` renders a broken image (or worse,
`src="null"` triggers a spurious network fetch) for every name without an avatar.

**Severity:** Medium

### INV-5: Reverse success provenance — fixed user-safe `baseEnsProvenance()`, fresh per call, no v1 network-scoping

**Category:** Request/Response

**Statement:** The reverse success arm attaches `baseEnsProvenance()` — a newly-allocated
`ResolutionProvenance` equal to `{ label: 'ENS', external: false }` on every call (SF-2 INV-5, reused
unchanged): `label` is the fixed user-safe literal `'ENS'` (never a URL, gateway host, avatar host, or
internal identifier), `external` is `false` on the v1 reverse path, and `scopedToNetworkId` is **absent**
(network-scoping is SF-5's `EnsProvenance` extension). No two reverse results share a provenance object. The
reverse path adds **no** provenance field of its own and asserts no v2 provenance property.

**Applies to:** `baseEnsProvenance` (`provenance.ts`, SF-2 — reused); `resolveAddress`'s success arm; the
user-safe `label` obligation SF-4's `label`-allowlist check and UIKit INV-16 enforce.

**Enforcement mechanism:**
- Type system: return type `ResolutionProvenance` (UIKit SF-1); `label`/`external` required,
  `scopedToNetworkId` optional and omitted here.
- Runtime guard: `resolveAddress` calls the same single-construction-site `baseEnsProvenance()` SF-2 uses;
  no shared/frozen singleton aliased into results.
- Test: assert the reverse success `value.provenance` deep-equals `{ label: 'ENS', external: false }`;
  assert `'scopedToNetworkId' in value.provenance === false`; assert two reverse successes carry `!==`
  provenance objects; assert `label` matches the SF-4 user-safe allowlist (no `://`, no key-shaped substring).

**Violation scenario:** The reverse path derives `label` from the avatar host or the resolver address "for
debugging"; SF-4's `label`-allowlist check fails the adapter, and if it slipped through, the UIKit renders a
gateway/asset URL as the provenance label — a leak (INV-19) and a conformance failure.

**Severity:** High

## Error Semantics

### INV-6: Never-throw for expected failures — the only sanctioned throw is `RuntimeDisposedError`

**Category:** Error Semantics

**Statement:** `resolveAddress` **never throws for an expected failure** — every anticipated failure
(unsupported network, malformed address, no reverse record, forward-mismatch, address-scoped resolver
revert, gateway failure, timeout, transport/RPC error, unclassifiable native throw) resolves to
`{ ok: false, error }`. **Avatar failures likewise never throw** — they are absorbed to `avatarUrl:
undefined` (INV-17). The single sanctioned throw across the capability surface is `RuntimeDisposedError` on
use-after-dispose, raised by the factory's `guardRuntimeCapability` proxy **before** `resolveAddress`'s body
runs (so the mapper is never consulted for it, and per SF-1 INV-9 it would re-throw it anyway). No native
viem error, no avatar error, and no error from the mapper ever escapes `resolveAddress` as a rejection. This
is the SF-3 realization of UIKit INV-8 and spec SC-002 on the reverse path.

**Applies to:** `EvmNameResolutionService.resolveAddress`; `tryGetAvatar`; the guarded capability surface.

**Enforcement mechanism:**
- Type system: return is the closed union; `@throws {RuntimeDisposedError}` documented as the sole throw.
- Runtime guard: the one `getEnsName` call sits in `try`; the `catch` classifies every branch to a `{ ok:
  false }` (Part A `addressNotFound`) or delegates to `mapNameResolutionError` (total per SF-1 INV-6); the
  avatar call sits in its own `try/catch` returning `undefined`; there is no `throw`/re-`throw` in the body.
- Test: fault-inject each expected failure class (mock client throws `TimeoutError`, `HttpError`,
  `ReverseAddressMismatch`, `ResolverNotFound`, a non-`Error` primitive, etc.) and assert `resolveAddress`
  **resolves** (never rejects); fault-inject a `getEnsAvatar` throw and assert the reverse still resolves
  `{ ok: true }`; separately, call a disposed capability and assert it **rejects** with `RuntimeDisposedError`.

**Violation scenario:** A revert class not in the `switch` re-throws instead of hitting `default → mapper`;
the UIKit's display path — told expected failures never throw and therefore lacking a `try/catch` there —
leaks an untyped exception, and an address whose reverse gateway was merely down crashes the display column.

**Severity:** Critical

### INV-7: `strict: true` is mandatory on `getEnsName`

**Category:** Error Semantics

**Statement:** The single `getEnsName` call is **always** invoked with `strict: true`. Under `strict: true`,
distinct failure classes (gateway HTTP failure, forward-mismatch `ReverseAddressMismatch`, resolver-absent,
unsupported profile, malformed offchain response) surface as typed reverts that SF-3 classifies (INV-10),
and only a genuine empty-record decode returns `null`. `strict: false` (viem's default) is forbidden on this
path because it collapses gateway/resolver/mismatch/no-record failures into an indistinguishable `null` —
which SF-3 would then report as `ADDRESS_NOT_FOUND`, **hiding a gateway outage or resolver misconfiguration
behind "no name for this address."** (The forward-mismatch and the empty record both legitimately fold to
`ADDRESS_NOT_FOUND` under Approach A, but a *gateway/transport* failure must not — it is
`EXTERNAL_GATEWAY_ERROR` / `RESOLUTION_TIMEOUT` / `ADAPTER_ERROR`, INV-8/INV-10.)

**Applies to:** `EvmNameResolutionService.resolveAddress` (the network call).

**Enforcement mechanism:**
- Type system: n/a (an argument value, not a type).
- Runtime guard: the call site literally passes `{ address, strict: true }`; a code-review/lint check pins
  the literal (as SF-2 does for `getEnsAddress`).
- Test: assert the mocked client's `getEnsName` is invoked with `strict: true` (spy on the options arg); a
  regression test that flips it to `false` must fail a dedicated assertion.

**Violation scenario:** Someone drops `strict: true` to "avoid the throws"; a CCIP-Read reverse gateway 500
now returns `null`, SF-3 reports `ADDRESS_NOT_FOUND`, the UIKit shows truncated hex, and a name that *does*
reverse-resolve (to a verified identity) is silently unreachable — a legibility regression with no error
signal, and the gateway-vs-not-found distinction the spec's Edge Cases demand collapses.

**Severity:** Critical

### INV-8: `ADDRESS_NOT_FOUND` arises from the `null`-return path, the classified reverts, **and** malformed input

**Category:** Error Semantics

**Statement:** `resolveAddress` produces `ADDRESS_NOT_FOUND` (via the SF-1 `addressNotFound(address)`
constructor) in exactly these situations, all meaning **"no usable, forward-verified reverse record for this
address"**: (1) `getEnsName` returns `null` (structural success, empty reverse record — a non-throw path);
(2) the caught revert's `errorName` is `ReverseAddressMismatch` (Approach A suppress — INV-11),
`ResolverNotFound`, `ResolverNotContract`, or `UnsupportedResolverProfile` (D-R4); and (3) the input fails
`isValidEvmAddress` (malformed address — D-R1, a sync pre-I/O gate). Every one is address-scoped, not
network-scoped — the D-B support-gate (INV-16) has already pre-empted the genuine "no ENS on this network"
case, so a resolver-level revert reaching the catch is necessarily about *this address's* reverse record.

**Applies to:** `resolveAddress` (null-return branch + malformed-input gate + the four revert `switch` arms).

**Enforcement mechanism:**
- Type system: `addressNotFound(address)` returns the `ADDRESS_NOT_FOUND` variant (SF-1 constructor, `error-mapping.ts` L206).
- Runtime guard: the `!isValidEvmAddress` gate, the `name === null` branch, and the four revert `case`s all
  call `addressNotFound(address)`; no other code maps to `ADDRESS_NOT_FOUND`.
- Test: (1) mock `null` return → `ADDRESS_NOT_FOUND`; (2) mock each of `ReverseAddressMismatch` /
  `ResolverNotFound` / `ResolverNotContract` / `UnsupportedResolverProfile` reverts → each `ADDRESS_NOT_FOUND`;
  (3) call with `'0xnothex'` / `''` / a too-short hex → `ADDRESS_NOT_FOUND` with the input echoed on `.address`
  and **no** `getEnsName` call (INV-16).

**Violation scenario:** Only the `null` path is treated as not-found and `ReverseAddressMismatch` falls
through to the mapper → `ADAPTER_ERROR`; a spoof-attempt address (whose reverse record points to a
forward-mismatched name) surfaces as an internal adapter bug instead of a clean "no name," and the UIKit
shows a scary error where it should quietly render truncated hex.

**Severity:** High

### INV-9: `ADDRESS_NOT_FOUND` is produced **only** on SF-3's control path — the mapper never fabricates it (preserves SF-1 INV-11)

**Category:** Error Semantics

**Statement:** Every `ADDRESS_NOT_FOUND` value originates from SF-3 calling `addressNotFound(...)` on its own
control path (INV-8); `resolveAddress` never obtains an `ADDRESS_NOT_FOUND` from `mapNameResolutionError`, and
SF-3 does not ask (and must not cause) SF-1's mapper to emit one. This is the SF-3 side of the contract that
keeps **SF-1 INV-11** intact: the `ReverseAddressMismatch` / `ResolverNotFound` / `ResolverNotContract` /
`UnsupportedResolverProfile` reverts are classified **upstream in SF-3** (Part A), so SF-1's mapper needs no
`ADDRESS_NOT_FOUND` row and — because `addressNotFound` already existed in SF-1 (`error-mapping.ts` L206) —
**SF-3 raises no drift note to SF-1** (contrast SF-2's Part-B drift). `ReverseAddressMismatch`, which SF-2's
Part B routed to `ADAPTER_ERROR` as an *unexpected-on-forward* signal, is intercepted on SF-3's control path
*before* the mapper is reached, so the mapper never classifies it on the reverse path.

**Applies to:** `resolveAddress` (all `ADDRESS_NOT_FOUND` production); the SF-1 mapper (must remain
not-found-free).

**Enforcement mechanism:**
- Type system: n/a (a sourcing/ownership property).
- Runtime guard: the `switch` handles the four address-scoped reverts **before** the `default → mapper` arm;
  the mapper's classification table (SF-1) contains no `ADDRESS_NOT_FOUND` row.
- Test: assert `resolveAddress`'s `default`-arm result `code` is never `ADDRESS_NOT_FOUND`/`NAME_NOT_FOUND`;
  assert SF-1's imported mapper never returns `ADDRESS_NOT_FOUND` for any reverse gateway/resolver/mismatch
  input (cross-checked against SF-1's suite).

**Violation scenario:** A future refactor moves the `ReverseAddressMismatch` classification into SF-1's
mapper "to centralize reverse errors"; SF-1 INV-11 breaks, a reverse gateway 500 whose cause happens to
`.walk()` into a mismatch-shaped error is mis-mapped to `ADDRESS_NOT_FOUND`, and the gateway-vs-not-found
distinction collapses — a broken gateway now looks like "no name."

**Severity:** High

### INV-10: Reverse-path classification is total and closed over the seven-code union

**Category:** Error Semantics

**Statement:** Every terminal outcome of `resolveAddress` is a member of the closed seven-code
`NameResolutionError` union (on failure) or a `ResolvedName` (on success) — SF-3 never returns or constructs
a `code` outside `{ NAME_NOT_FOUND, ADDRESS_NOT_FOUND, UNSUPPORTED_NETWORK, UNSUPPORTED_NAME,
RESOLUTION_TIMEOUT, EXTERNAL_GATEWAY_ERROR, ADAPTER_ERROR }`, and never invents one. Totality is guaranteed
structurally: SF-3's Part-A constructors cover the control-path codes (`ADDRESS_NOT_FOUND`,
`UNSUPPORTED_NETWORK`), and the `default` arm delegates to `mapNameResolutionError`, which is itself total and
codomain-closed (SF-1 INV-1/INV-6). On the reverse path SF-3 emits **`ADDRESS_NOT_FOUND` and
`UNSUPPORTED_NETWORK`** on its control path, and reaches `EXTERNAL_GATEWAY_ERROR` / `RESOLUTION_TIMEOUT` /
`ADAPTER_ERROR` only through the mapper; `NAME_NOT_FOUND` and `UNSUPPORTED_NAME` are not reverse-path codes
(they are SF-2's), and the reverse path never constructs them.

**Applies to:** `resolveAddress` (every return path).

**Enforcement mechanism:**
- Type system: union return type; the `default` branch's `mapNameResolutionError` return is
  `NameResolutionError`, so the compiler sees every arm as union-typed.
- Runtime guard: the `switch` `default` is an unconditional delegate to the mapper; no arm returns a
  bare/unknown shape.
- Test: enumerate the reverse-path class→code table (Design D-R7 Part A + Part B) and assert each maps to its
  expected union code; feed an unclassifiable throw and assert `ADAPTER_ERROR` with `cause` preserved (via
  SF-1); assert no reverse outcome ever carries `NAME_NOT_FOUND`/`UNSUPPORTED_NAME`.

**Violation scenario:** A new reverse revert branch returns `{ ok:false, error: { code: 'REVERSE_MISMATCH' } }`
(an invented code); the UIKit's exhaustive `switch` over seven codes has no arm, renders nothing, and SF-4's
closed-union check fails the adapter.

**Severity:** Critical

### INV-11: Suppress-on-mismatch — a forward-mismatched name is NEVER surfaced (anti-spoofing crux)

**Category:** Error Semantics

**Statement:** When the Universal Resolver detects a forward/reverse mismatch — the reverse record names
`X` but `X`'s forward record points to an address other than the queried one — viem's `getEnsName`
(`strict: true`) reverts `ReverseAddressMismatch` and exposes **no name**. SF-3 **must** fold this to
`ADDRESS_NOT_FOUND` and **must never** surface the mismatched name in any form, with any `forwardVerified`
value, through any code path (Approach A / D-R2). There is no SF-3 code path that reads a name out of a
`ReverseAddressMismatch` revert, and no path that returns `{ ok: true }` for a mismatched address. This is
the anti-spoofing guarantee: a spoofer who sets a reverse record to a victim's name they don't control on
the forward side can never get this adapter to emit that name. (Anti-spoofing at render time is additionally
preserved at the UIKit SF-4 display layer, which renders truncated hex on `ADDRESS_NOT_FOUND`.)

**Applies to:** `resolveAddress` (the `ReverseAddressMismatch` `switch` arm); the entire success path (which
is only reachable for a UR-verified name).

**Enforcement mechanism:**
- Type system: n/a (a control-flow / information-flow property — the mismatched name never enters a typed value).
- Runtime guard: `getEnsName` returns *only* a UR-forward-verified name or `null`/throws; the
  `ReverseAddressMismatch` `case` returns `addressNotFound(address)` before any success construction; SF-3
  builds no raw reverse-record reader (no `name(bytes32)` ABI) that could recover an unverified name (Design
  § Out of Scope).
- Test: with a fork/fixture, reverse-resolve a known forward-mismatched address and assert the result is
  `{ ok: false, error: { code: 'ADDRESS_NOT_FOUND' } }` — **not** a thrown error, **not** `{ ok: true }`,
  and the mismatched name string appears **nowhere** in the returned value; grep the source to assert no code
  path extracts a name from a `ReverseAddressMismatch` revert.

**Violation scenario:** A well-meaning change surfaces the mismatched name with `forwardVerified: false` "to
give the consumer the choice" (the pre-Revision-2 scenario-2 behavior); a UIKit that mis-handles the `false`
flag (or a non-portable consumer) renders `vitalik.eth` for an attacker's address that merely *claims* it in
its reverse record — a spoofed identity that can misdirect trust and funds. This is the precise hazard the
High stakes rating and UIKit INV-6 (Critical) exist to prevent.

**Severity:** Critical

### INV-12: Deterministic classification precedence — a fixed total order from gates to `default`

**Category:** Error Semantics

**Statement:** `resolveAddress` evaluates a fixed, total precedence so any given (address, network state,
native-error shape) always classifies to the same code: **(0)** the guard proxy's use-after-dispose check
(throws `RuntimeDisposedError`) → **(1)** D-B sync support-gate (`UNSUPPORTED_NETWORK`) → **(2)**
malformed-address gate `!isValidEvmAddress` (`ADDRESS_NOT_FOUND`) → **(3)** the one `getEnsName` call: `null`
→ `ADDRESS_NOT_FOUND`, else a name → success → **(4)** catch: `ReverseAddressMismatch` / `ResolverNotFound` /
`ResolverNotContract` / `UnsupportedResolverProfile` → `ADDRESS_NOT_FOUND`, `default` → `mapNameResolutionError`
(whose own precedence is SF-1 INV-8/INV-10). First match wins; gates 1–2 run before any I/O (INV-16). Avatar
runs only after step 3 yields success and never affects classification (INV-17).

**Applies to:** `resolveAddress`.

**Enforcement mechanism:**
- Type system: n/a (control flow).
- Runtime guard: the gates are sequential early-returns; the catch is an ordered `switch` on `errorName` with
  a `default` delegate — no unordered set that could double-match.
- Test: construct inputs that could satisfy two levels (e.g. a malformed address on an unsupported network)
  and assert the higher-precedence code wins (`UNSUPPORTED_NETWORK` before `ADDRESS_NOT_FOUND`, because the
  support-gate runs first); snapshot the full level→code table.

**Violation scenario:** The malformed-address gate is moved before the support-gate; a malformed address typed
while pointed at a non-ENS network returns `ADDRESS_NOT_FOUND` instead of `UNSUPPORTED_NETWORK`, and the UIKit
tells the user "no name for this address" on a chain where reverse resolution is impossible in the first place
— a wrong, misleading diagnosis.

**Severity:** High

## Idempotency & Retry

### INV-13: Stateless & deterministic-under-stable-state — repeated calls converge; the avatar caveat is explicit

**Category:** Idempotency & Retry

**Statement:** `resolveAddress` and `tryGetAvatar` add **no** mutable field to `EvmNameResolutionService` —
no verify cache, no avatar cache, no memo (SF-2 INV-13, preserved). The service holds only the injected
client and read-only network config. Therefore, under **stable underlying state**, repeated
`resolveAddress(address)` calls return **structurally-equal** results, and concurrent/interleaved calls never
interfere or share mutable state. **Caveat (explicit):** the *reverse core* (`address`, `name`,
`forwardVerified`, `provenance`) is deterministic under stable *ENS/UR* state; `avatarUrl` is derived from a
**broader** state surface (the avatar text record **and** the possibly-off-chain avatar asset host), and
because avatar failures are swallowed to `undefined` (INV-17), `avatarUrl` is deterministic only when that
broader surface is *also* stable. Under a fully-stable surface (the SF-4 harness's controlled/mocked
environment) the full result — including `avatarUrl` — is structurally equal across calls; in production a
flapping avatar host can make `avatarUrl` present on one call and absent on the next **without** changing the
reverse core. This is not a violation — it is the deliberate cost of avatar failure-isolation, surfaced here
so SF-4's deep-equal-under-cache-TTL check scopes its determinism assertion to a stable surface (see Open
Questions).

**Applies to:** `EvmNameResolutionService.resolveAddress`, `tryGetAvatar`; the SF-4 determinism check.

**Enforcement mechanism:**
- Type system: service fields are `readonly`; no mutable cache field is declared (unchanged from SF-2).
- Runtime guard: no module-level or instance-level mutable state; each call builds fresh results (INV-5) and
  reads no clock/RNG into its output (`elapsedMs` is on the error path only, measured per-call — INV-18).
- Test: two `resolveAddress` calls with equal input against a **stable** mock (including a stable
  `getEnsAvatar`) return deep-equal results with distinct object identities; grep the service for mutable
  instance state / cache and assert none; run interleaved concurrent calls and assert no cross-talk; a
  dedicated test flaps the mocked `getEnsAvatar` (throw then succeed) and asserts the *reverse core* is
  identical across the two calls while `avatarUrl` legitimately differs — pinning the caveat.

**Violation scenario:** An LRU verify-cache keyed by address only (ignoring network/coinType) is added; after
a network switch (which should recreate the capability), a stale entry returns a name verified on the wrong
chain, and SF-4's determinism assertion fails — or worse, a real consumer trusts a name that was verified
against a different chain's forward records.

**Severity:** High

### INV-14: Read-only and retry-safe — no state mutation, no submission, safe to re-invoke at any time

**Category:** Idempotency & Retry

**Statement:** `resolveAddress` (and `tryGetAvatar`) perform **read-only** RPC (ENS reverse resolution +
avatar record/asset reads) and no state-changing operation — no transaction submission, no KV/disk write, no
external mutation. A retry (at 1s, 1h, after a crash, from another process) submits nothing, double-writes
nothing, and simply re-reads; the operation is inherently idempotent with no idempotency key or dedup record
required. There is no partial-effect window a retry could observe or duplicate.

**Applies to:** `resolveAddress`, `tryGetAvatar`.

**Enforcement mechanism:**
- Type system: n/a.
- Runtime guard: the only external calls are `publicClient.getEnsName` and `publicClient.getEnsAvatar` (both
  reads); no `writeContract`/`sendTransaction`/KV/fs API is imported or invoked.
- Test: spy the injected client and assert only read methods (`getEnsName`, `getEnsAvatar`) are called;
  assert no write/submit/persist API is reachable from `resolveAddress`.

**Violation scenario:** A telemetry "reverse-lookup log" is written to a shared KV inside `resolveAddress`; a
retried resolution double-writes, an analytics count is inflated, and (if the write can fail) an
expected-failure path gains a new throw channel that breaks INV-6.

**Severity:** Medium

## Auth Boundary

**Not applicable — recorded explicitly.** SF-3 is a **public read primitive**, exactly as SF-2: reverse ENS
resolution and avatar lookup read publicly-readable on-chain / gateway state, carry no caller identity, gate
no privileged operation, and hold no credential of their own (the injected client's transport/keys are the
runtime's concern — INV-19/INV-20). There is nothing to authorize. The one lifecycle boundary is
**use-after-dispose**, enforced by the factory's `guardRuntimeCapability` proxy (raising `RuntimeDisposedError`
before the body — INV-6), not an authorization check. Network-scope admission (may this network reverse-resolve
at all?) is a request-contract gate (INV-16), not an auth gate. There is **no cross-tenant / caller-scoped
data boundary**: `resolveAddress` echoes only the caller's *own* queried address on `ADDRESS_NOT_FOUND`
(INV-19), never another party's data, so the enumeration-attack concern the auth category flags does not
arise. Recorded rather than omitted, per coverage discipline.

## Side-Effect Ordering & Observability

### INV-15: Borrowed-client no-dispose ownership — the reverse path and avatar never tear down the injected `PublicClient`

**Category:** Side-Effect Ordering & Observability

**Statement:** The `PublicClient` is **owned by the composing runtime** (`adapter-evm/profiles/shared.ts`),
injected via `CreateNameResolutionOptions` (D-A, SF-2 INV-15 preserved). Both `getEnsName` and `getEnsAvatar`
**borrow** the same client: `dispose()` is a no-op with respect to the client — it never calls a client
teardown, never closes its transport, never nulls a shared handle — and the reverse path releases no RPC
resource of its own. After a capability `dispose()`, the same injected client remains fully usable by the
runtime and any other capability sharing it. `dispose()` is **unchanged** from SF-2.

**Applies to:** `EvmNameResolutionService.dispose`; `resolveAddress` / `tryGetAvatar` (client borrowing);
`createNameResolution` (cleanup registration, unchanged).

**Enforcement mechanism:**
- Type system: n/a (a lifecycle/ownership property).
- Runtime guard: `dispose()` body touches no client method (at most a debug log); no
  `registerRuntimeCapabilityCleanup` for the client; `cleanupStage: 'general'` (unchanged).
- Test: build a service over a spy client, run a `resolveAddress` (incl. avatar), call `dispose()`, assert
  **no** client teardown/close method was invoked and the client is still callable afterward.

**Violation scenario:** `dispose()` is "improved" to close the shared transport after adding reverse support;
a second capability (or the runtime) that shares that client suddenly fails all RPC after this capability is
disposed — an ownership violation manifesting as spurious `ADAPTER_ERROR`s elsewhere in the runtime.

**Severity:** High

### INV-16: Pre-I/O gating — zero network round-trips before the support-gate and the malformed-address gate pass

**Category:** Side-Effect Ordering & Observability

**Statement:** `resolveAddress` performs **no network I/O** until after (a) the sync D-B support-gate confirms
the bound chain carries `contracts.ensUniversalResolver`, and (b) the sync `isValidEvmAddress(address)` shape
gate passes. An unsupported network returns `UNSUPPORTED_NETWORK`, and a malformed address returns
`ADDRESS_NOT_FOUND`, **without a single `getEnsName` call** (and, a fortiori, without any avatar call).
Ordering: support-check → address-shape check → (at most) one `getEnsName` call → (only on success) the
avatar lookup. This makes cheap, deterministic pre-checks free of round-trips and guarantees the D-B decision
is made before viem could throw its own `ChainDoesNotSupportContract`.

**Applies to:** `resolveAddress` (gate ordering); `supportsEns()` (reused from SF-2).

**Enforcement mechanism:**
- Type system: n/a (ordering).
- Runtime guard: the support-gate and address-shape checks are early-returns positioned before the `try`
  containing the sole `getEnsName` call; the avatar call is after the success determination.
- Test: with a spy client, call `resolveAddress` on an unsupported-network config and on a malformed address
  → assert `getEnsName` and `getEnsAvatar` were **never** invoked and the correct typed code returned; on a
  valid address + supported network assert `getEnsName` is invoked **exactly once**.

**Violation scenario:** The support-gate is checked after the call; viem throws `ChainDoesNotSupportContract`,
the catch maps it (via the mapper backstop, INV-10) — functionally the same code, but every unsupported-network
probe now costs a wasted RPC round-trip, and the "sync, before I/O" guarantee D-B rests on is gone.

**Severity:** Medium

### INV-17: Avatar I/O is strictly post-success, failure-isolated, and latency-isolated — it never affects the reverse result or its error surface

**Category:** Side-Effect Ordering & Observability

**Statement:** `tryGetAvatar(name)` runs **only after** `resolveAddress` has already determined a successful
reverse (`ok: true` with a UR-verified name) — the reverse outcome is fixed before the avatar round-trip
begins. Its effect is **strictly additive and one-directional**: it can add an `avatarUrl` or leave it absent,
and nothing else. A slow, failing, or hostile avatar lookup (gateway error, unreachable asset host, malformed
avatar record, timeout) **can never** (a) turn a good `{ ok: true, forwardVerified: true }` into a `{ ok:
false }` or a throw, (b) change `name` / `forwardVerified` / `provenance` / `address`, or (c) contribute to
error classification (INV-8/INV-10) — avatar failures are **not** mapped to any `NameResolutionError` (D-R5).
Observability: avatar failures are intentionally silent (best-effort); a debug log inside the `tryGetAvatar`
catch is permissible but **must never carry the untrusted avatar record content** (INV-19).

**Applies to:** `EvmNameResolutionService.tryGetAvatar`; `resolveAddress` (success arm ordering).

**Enforcement mechanism:**
- Type system: `tryGetAvatar(): Promise<string | undefined>` — its return type cannot express a failure that
  the success arm must handle; the reverse `ResolutionResult` is already `ok: true` at the call site.
- Runtime guard: `tryGetAvatar` wraps both viem calls in a `try { … } catch { return undefined }`; the
  success literal spreads its result conditionally (INV-4); the avatar call is textually after the success
  determination and outside the reverse `try/catch`.
- Test: fault-inject `getEnsAvatar` → throw / reject / `null` / a slow (fake-timer) resolution and assert the
  reverse result is still `{ ok: true, forwardVerified: true }` with `avatarUrl` absent (or present on
  success); assert no avatar error ever appears as a `NameResolutionError`; assert the reverse `elapsedMs`
  timing window (INV-18) does not include the avatar hops.

**Violation scenario:** A refactor `await`s the avatar inside the reverse `try` (to "simplify"), so a
`getEnsAvatar` throw is caught by the reverse `catch` and mapped to `EXTERNAL_GATEWAY_ERROR`; now a verified
name with a broken avatar host returns a *failure* instead of a name, and the display silently loses a valid
identity because its avatar image was unreachable — the correctness bug D-R5 exists to prevent.

**Severity:** High

## Resource Limits & Rate

### INV-18: Bounded work per call — one reverse UR round-trip + bounded avatar hops, no internal retry loop, caller-measured `elapsedMs` around the reverse call only

**Category:** Resource Limits & Rate

**Statement:** A single `resolveAddress` performs **at most one** Universal-Resolver round-trip for
`getEnsName` (viem's own CCIP-Read traversal within it is viem's bounded concern), plus — **only on success**
— a bounded avatar sequence: `getEnsAvatar` (a second UR/text round-trip) and at most one further asset-resolution
hop inside viem's `parseAvatarRecord` (NFT/IPFS/HTTP). SF-3 runs **no** retry/backoff loop of its own on
either path and allocates no unbounded structure — work is O(1) plus a bounded number of bounded network
calls. `elapsedMs` is measured via `performance.now()` **around the `getEnsName` call only** and supplied to
`mapNameResolutionError` on the timeout/transport path so `RESOLUTION_TIMEOUT.elapsedMs` is a real number, not
SF-1's `-1` sentinel (SF-1 INV-12 caller obligation, SF-2 INV-18 parallel); the avatar hops are deliberately
**outside** this timing window. SF-3 owns **no** resolution-scoped timeout budget and relies on the injected
client's transport timeout; the avatar lookup uses viem defaults with **no custom deadline** (D-R5). **Known
resource exposure (flagged):** because avatar runs on every successful reverse and can reach an
arbitrary, name-owner-controlled asset host, a successful reverse's *total wall-clock* is bounded only by the
transport timeout applied to that hop — a per-avatar deadline is a possible SF-5/future hardening, not built
here (see Open Questions).

**Applies to:** `resolveAddress` (the reverse call's `elapsedMs` + single-call bound); `tryGetAvatar` (bounded
extra hops, no retry).

**Enforcement mechanism:**
- Type system: `NameResolutionErrorContext.elapsedMs?: number` (SF-1).
- Runtime guard: `const started = performance.now()` immediately before `getEnsName`; `elapsedMs:
  performance.now() - started` in the `default` ctx; no loop around either the reverse or the avatar call;
  `tryGetAvatar` is a single `await`, not a retry loop.
- Test: assert exactly one `getEnsName` call per `resolveAddress`, and at most the bounded avatar calls on
  success; fault-inject a reverse `TimeoutError` and assert the mapped `RESOLUTION_TIMEOUT.elapsedMs` is a
  finite `>= 0` number (not `-1`); assert a slow avatar (fake timers) does not inflate the reverse `elapsedMs`.

**Violation scenario:** SF-3 forgets to pass `elapsedMs` on the reverse catch; every reverse timeout surfaces
`elapsedMs: -1`, a UIKit "timed out after Nms" formatter renders "-1ms," and the cross-SF obligation from SF-1
INV-12 is silently unmet. Separately, an avatar retry loop is added "for reliability"; a hostile asset host
that always 500s now multiplies every successful reverse's latency by the retry count.

**Severity:** Medium

## Sensitive Data Handling

### INV-19: No new credential-leak channel; avatar content is untrusted and passed through verbatim (not a leak, but flagged for the consumer)

**Category:** Sensitive Data Handling

**Statement:** SF-3 introduces **no** channel that could leak *adapter/transport* credentials. It constructs
**no** free-text error field directly from a raw native (viem/RPC/gateway) message — every
native-message-derived string reaches a returned error only through SF-1's `mapNameResolutionError`, which
redacts credential substrings (SF-1 INV-16) and keeps the unredacted original only on the opaque
`ADAPTER_ERROR.cause`. SF-3's own control-path errors carry only: the caller's **own** queried `address`
echoed on `ADDRESS_NOT_FOUND` (caller-supplied, already known to the caller — not another party's data, so no
enumeration leak), the internal `networkId` on `UNSUPPORTED_NETWORK`, and the fixed `'ENS'` `provenance.label`
(INV-5) — never a keyed provider/gateway/asset URL. **Avatar note (untrusted content, not a credential
leak):** `value.avatarUrl` is **untrusted, name-owner-controlled** content (R7) passed through verbatim — the
adapter neither fetches nor sanitizes the asset beyond what `getEnsAvatar` did — and it (and the avatar record)
**must never be logged**. It is forwarded to the UIKit SF-4 layer to render defensively (SSRF / mixed-content
hardening is the consumer's, per Design § Out of Scope).

**Applies to:** `resolveAddress` (control-path error construction + `default` delegation);
`tryGetAvatar` (no logging of avatar content); `baseEnsProvenance` (`label`).

**Enforcement mechanism:**
- Type system: n/a (value-level content).
- Runtime guard: no `error.message`/`String(error)` is placed on a returned field by SF-3 — that extraction
  and its redaction live in SF-1; the `addressNotFound` payload is the echoed input address; the
  `tryGetAvatar` catch logs no avatar content.
- Test: fault-inject a reverse viem error whose message embeds `…/v2/SECRETKEY` and assert the SF-3-returned
  `ADAPTER_ERROR.message` / `EXTERNAL_GATEWAY_ERROR.detail` (produced via the mapper) do not contain
  `SECRETKEY`, while `cause` still carries it; assert `ADDRESS_NOT_FOUND.address` equals only the caller's
  input; assert no log line emitted by `tryGetAvatar` contains the avatar URL/record.

**Violation scenario:** A debug log added to `tryGetAvatar`'s catch interpolates the avatar record ("avatar
lookup failed for record `ipfs://…?key=…`"); an attacker sets a crafted avatar record on a name and, on the
next lookup failure, a name-owner-controlled string (potentially bearing a tracking token) lands in the
adapter's logs — an indirect leak through the avatar channel.

**Severity:** High

## Performance, Scalability & Re-usability

### INV-20: Dependency-injection seam — one injected client backs reverse + avatar; no hardcoded host; re-usable via config only

**Category:** Performance, Scalability & Re-usability

**Statement:** The reverse path takes all host dependencies by injection, exactly as SF-2 (D-A / SF-2 INV-20,
extended): the same borrowed `PublicClient` backs `getEnsName` **and** `getEnsAvatar`, and the network config
is a constructor parameter — the service constructs no client internally, imports no concrete singleton
logger/clock/transport, and hardcodes no app/RI/network/gateway reference (no custom avatar gateway URL — viem
defaults are used, D-R5). A different host (another app, RI, or a unit test) embeds the reverse capability by
passing a different client + config and changing **no source**. Unit tests supply a mock `{ getEnsName,
getEnsAvatar, chain }` with zero network I/O. The only non-`import type` runtime dependencies remain viem
(already a dependency) and SF-1's leaf mapper/constructors; the UIKit types are `import type` only.

**Applies to:** `EvmNameResolutionService.resolveAddress`, `tryGetAvatar`; `createEvmNameResolutionService`;
`createNameResolution` (unchanged).

**Enforcement mechanism:**
- Type system: constructor/factory parameters are the sole dependency inlets; UIKit-type imports are `import type`.
- Runtime guard: no `createEvmPublicClient` call inside the capability; no module-level singleton; no
  hardcoded gateway/asset host.
- Test: instantiate the service in a bare test with a hand-rolled mock `{ getEnsName, getEnsAvatar, chain }`
  and no host wiring; assert `resolveAddress` resolves (with and without an avatar); assert the compiled
  output has no runtime dependency on `@openzeppelin/ui-types`.

**Violation scenario:** The avatar lookup is pointed at a hardcoded IPFS/HTTP gateway constant inside the
service "for consistency"; a host that must route avatar assets through its own gateway (corporate proxy,
rate-limited mirror) can no longer do so without editing SF-3 source, and the capability stops being
embeddable via config alone.

**Severity:** Medium

## Existing Invariants (Extension Mode)

SF-3 adds one public method (`resolveAddress`) and one private helper (`tryGetAvatar`) to SF-2's
`EvmNameResolutionService` in `src/name-resolution/service.ts`; it adds **no new file**, **no new factory**,
and **no SF-1 mapper change**. Invariants it must **preserve**:

### Preserved
- **SF-1's `error-mapping.ts` is imported, not modified.** SF-3 consumes `mapNameResolutionError` +
  `addressNotFound` / `unsupportedNetwork` and feeds the mapper only Part-B rows; it adds **no** mapper row
  (`addressNotFound` already existed at `error-mapping.ts` L206), preserving **SF-1 INV-11** (mapper never
  emits a not-found) via the Part A/B split (INV-9). **SF-3 raises no drift to SF-1.**
- **SF-2's forward surface is untouched.** `isValidName`, `resolveName`, `supportsEns()`, the constructor,
  and `createEvmNameResolutionService` are unchanged; SF-2 INV-1..INV-21 continue to hold for the forward
  path. In particular SF-2 **INV-13** (statelessness), **INV-15** (borrowed-client no-dispose), **INV-16**
  (pre-I/O gate), **INV-17** (`dispose()` idempotent + no telemetry), **INV-5** (`baseEnsProvenance` shape),
  and **INV-20** (DI seam) are inherited by the reverse path (re-stated here as INV-13/15/16/5/20 for the
  reverse surface).
- **The factory `capabilities/name-resolution.ts` is unchanged.** `createNameResolution` wraps the service in
  `guardRuntimeCapability` — a Proxy that guards *every* method apply (use-after-dispose →
  `RuntimeDisposedError`) without a method allowlist — so `resolveAddress` is surfaced automatically and the
  optional interface method `resolveAddress?` is satisfied by the cast the factory already performs.
- **`shared/revert-info.ts` (`extractRevertInfo`, `BaseError`) is reused as-is** for the reverse catch's
  `errorName` read — read, not modified.
- **UIKit `@openzeppelin/ui-types` shape is never modified** — SF-3 imports `ResolutionResult` / `ResolvedName`
  / the error union and implements against them. `ResolvedName.resolveAddress?` was already optional (UIKit SF-1).
- **Non-EVM adapters (`adapter-solana`, `adapter-midnight`, `adapter-polkadot`, `adapter-stellar`) continue to
  type-check, build, and pass tests** — `resolveAddress` is additive on an already-optional interface method;
  non-EVM adapters omit the `nameResolution` slot and are unaffected (spec SC-006).
- **The `nameResolution` registration slot in `adapter-evm/profiles/shared.ts` is unchanged** — `resolveAddress`
  rides on the same capability instance and injected client; no registration change.

### Modified
- **`src/name-resolution/service.ts`** — `EvmNameResolutionService` gains the public `resolveAddress` method
  and the private `tryGetAvatar` helper. Additive: no existing method changes shape or behavior. New imports:
  `addressNotFound` (from `./error-mapping`), `isValidEvmAddress` (from `../utils/validation`), `type Address`
  (from `viem`). `BaseError`, `extractRevertInfo`, `unsupportedNetwork`, `mapNameResolutionError`,
  `baseEnsProvenance` are already imported by SF-2.

### New
- INV-1 … INV-20 above.

## Invariant Coverage Matrix

| Function / surface | Invariants | Enforcement |
|--------------------|-----------|-------------|
| `resolveAddress()` | INV-1, INV-2, INV-3, INV-6, INV-7, INV-8, INV-9, INV-10, INV-11, INV-12, INV-13, INV-14, INV-16, INV-18, INV-19, INV-20 | Req/Res + Err + Idem + Order/Obs + Rate + SensitiveData + Perf/Reuse |
| `resolveAddress()` success arm | INV-2, INV-3, INV-4, INV-5, INV-17 | Req/Res + Order/Obs (avatar ordering) |
| `tryGetAvatar()` (private helper) | INV-4, INV-6, INV-14, INV-17, INV-18, INV-19, INV-20 | Req/Res + Err + Idem + Order/Obs + Rate + SensitiveData + Perf/Reuse |
| `baseEnsProvenance()` (SF-2, reused) | INV-5, INV-13, INV-19 | Req/Res + Idem + SensitiveData |
| `isValidEvmAddress()` (reused shape gate) | INV-8, INV-12, INV-16 | Err + Order/Obs (pre-I/O) |
| `createNameResolution()` (factory, unchanged) | INV-1, INV-6, INV-15, INV-20 | Req/Res + Err + Order/Obs (ownership) + Perf/Reuse |
| `EvmNameResolutionService.dispose()` (unchanged) | INV-15; SF-2 INV-17 (preserved) | Order/Obs (ownership + idempotent inert) |
| `nameResolution` registration slot (`adapter-evm`, unchanged) | INV-15, INV-16, INV-20; SC-006 (Preserved) | Order/Obs + Perf/Reuse + additive-optional |

## Out of Scope

- **Surfacing a forward-mismatched name with `forwardVerified: false`** — deliberately **not built** (Approach
  A / D-R2 / INV-11). A mismatch folds to `ADDRESS_NOT_FOUND`; anti-spoofing is preserved at the UIKit SF-4
  display layer (truncated hex). Reconciled in spec Revision 2 & 3.
- **Chain-scoped reverse / non-60 `coinType` / ENSIP-19 chain-scoped primary names / `scopedToNetworkId` /
  `EnsProvenance` / `isEnsProvenance` / `viaGateway: true`** — SF-5. SF-3 emits `baseEnsProvenance()`
  (`external: false`, no scope) and uses the UR's built-in CCIP-Read only incidentally; it asserts no v2
  provenance property. `coinType` stays `60n`.
- **The conformance harness that *enforces* several of these (concrete-boolean `forwardVerified`, never-throw,
  determinism, user-safe `label`)** — SF-4. SF-3 *defines* the reverse-path properties (INV-3 concrete-boolean
  constant-`true`, INV-6 never-throw, INV-13 determinism, INV-5 label); SF-4 builds the parameterized check.
  The avatar-vs-determinism scoping (INV-13 caveat) is a note SF-4 must consume.
- **Avatar image fetching / caching / rendering / SSRF & mixed-content hardening / avatar-URL validation** —
  UIKit (consumer). SF-3 returns the verbatim `avatarUrl` `getEnsAvatar` produced (INV-19); it neither fetches
  nor sanitizes the asset beyond viem's own `parseAvatarRecord`.
- **A per-avatar deadline / owned timeout budget / `AbortController`** — SF-3 relies on the transport timeout
  and measures `elapsedMs` on the reverse call only (INV-18); a per-avatar deadline is a possible SF-5/future
  hardening (see Open Questions), not an invariant here.
- **The `NameResolutionError` union shape / `ResolvedName` value type** — owned by UIKit SF-1
  (`@openzeppelin/ui-types`); imported, never modified.
- **The mapper's internal class→code predicate table (Part B) and its redaction** — owned by SF-1; SF-3 fixes
  only the *reverse-path delegation contract* (INV-9, INV-10, INV-19), not the mapper's internals.
- **A raw reverse-record read / `name(bytes32)` ABI / own forward-verify (`resolveName` re-call)** — Research
  Approaches B/C only; not built under Approach A. The UR verifies internally; SF-3 does not call `resolveName`.
- **Rate limiting / admission control** — no rate surface at this layer: `resolveAddress` is a stateless read;
  back-pressure and quota are the host runtime's transport concern.
- **Auth** — no authorization surface (see Auth Boundary section).

## Dev Notes

- **Discharges Design Open Q3:** INV-3 encodes "on the SF-3 success path `forwardVerified === true`" as a
  first-class invariant, giving SF-4's concrete-boolean check a precise expected value for this adapter while
  staying compatible with the general contract (which permits `false` for a different adapter).
- **Carries Design Open Q1 to Tests (`UnsupportedResolverProfile` on the reverse path).** Invariants leans
  `ADDRESS_NOT_FOUND` (INV-8 / D-R4 — no usable reverse record). Tests should pin this against a mainnet-fork
  address whose reverse resolver lacks `name()`; if a case argues for `ADAPTER_ERROR` (resolver-capability
  gap), revisit that one row. Mirrors SF-2's D-C open question.
- **Carries Design Open Q2 to Tests (`ReverseAddressMismatch` fork coverage).** INV-11's suppress path should
  be pinned by a fork (or fixture) test against a known forward-mismatched address, asserting
  `ADDRESS_NOT_FOUND` — not a thrown error, not a surfaced name. Requires a real viem
  `ContractFunctionRevertedError` `ReverseAddressMismatch` fixture — deferred to Tests, as SF-2's
  revert-classification cases were.
- **`instanceof` brittleness (inherited from SF-1/SF-2 Dev Notes):** the reverse catch uses `error instanceof
  BaseError` + `extractRevertInfo(...).errorName`; a duplicate-copy/bundled viem can defeat `instanceof`,
  yielding `errorName === undefined` and folding to the mapper's `ADAPTER_ERROR` — safe (never a wrong/coerced
  name, never a throw), just less precise. Tests should simulate a foreign-realm `ReverseAddressMismatch`
  (matching `errorName`, failing `instanceof`)… **but note** the design gates `errorName` on `instanceof
  BaseError`, so a cross-realm mismatch would *not* be intercepted and would fold to `ADAPTER_ERROR` rather
  than `ADDRESS_NOT_FOUND`. That degrades safely (no spoofed name surfaces — INV-11 holds), but it means a
  cross-realm mismatch is reported as an adapter fault rather than a clean miss. This mirrors the doc-vs-code
  divergence SF-2 Tests flagged for the forward path; recorded here so Tests asserts *actual* behavior and, if
  cross-realm precision is wanted, a Code-Draft follow-up (structural `errorName` read without the
  `instanceof` gate) is the fix — not an invariant change.
- **Class→code table pinned to `viem@2.44.4`** (Design D-R7 / Dev Notes) — add a version-tying code comment.
  A viem major bump re-validates the reverse UR error surface, especially `ReverseAddressMismatch`'s membership
  in `isNullUniversalResolverError` and the `errorName` strings.
- **`performance.now()`** is the `elapsedMs` clock at the reverse catch site (SF-1 INV-12 caller obligation),
  identical to SF-2. Only the single `getEnsName` call is timed; `tryGetAvatar` runs after a successful reverse
  and is not part of the error-timing window (INV-18).
- **Cross-repo HOLD (same as SF-1/SF-2):** the local `@openzeppelin/ui-types` checkout already carries
  `ResolvedName` / `resolveAddress?`; the published baseline lagged. These invariants assume the designed
  shapes; do not locally redefine any UIKit-owned type. Typecheck is green against the materialized
  `@openzeppelin/ui-types@3.1.1` dev:local link (SF-1/SF-2 confirmed).

## Open Questions

*(Narrower follow-ups surfaced here, not blockers; Design Open Q3 is resolved above as INV-3, Open Q1/Q2 are
carried to Tests as noted in Dev Notes.)*

1. **Avatar-vs-determinism scoping for SF-4 (INV-13 caveat).** SF-4's deep-equal-under-cache-TTL determinism
   check must decide whether `avatarUrl` is in-scope for the structural-equality assertion. Recommendation:
   SF-4 asserts determinism on the **reverse core** (`address` / `name` / `forwardVerified` / `provenance`)
   unconditionally, and treats `avatarUrl` as determinism-checked **only under a stable avatar surface** (its
   controlled/mocked environment already provides this). Flagged for SF-4 Design; not an SF-3 code change.
2. **Per-avatar deadline (INV-18 resource exposure).** Avatar runs on every successful reverse and can reach
   an arbitrary, name-owner-controlled asset host, so a successful reverse's total wall-clock is bounded only
   by the transport timeout on that hop. If production latency profiling shows a long tail, a per-avatar
   `AbortController`/deadline (independent of the reverse call) is the fix — a Code-Draft/SF-5 hardening, not
   a contract change. Recorded so it is a conscious deferral, not a silent gap.
3. **Cross-realm `ReverseAddressMismatch` precision (Dev Notes).** As designed, a mismatch revert that defeats
   `instanceof BaseError` folds to `ADAPTER_ERROR` rather than `ADDRESS_NOT_FOUND`. This is *safe* (INV-11
   still holds — no name is surfaced) but *imprecise* (a clean miss reported as an adapter fault). Code Draft
   decides whether to read `errorName` structurally (without the `instanceof` gate) for cross-realm precision,
   consistent with whatever SF-2 lands on for the symmetric forward-path case.
