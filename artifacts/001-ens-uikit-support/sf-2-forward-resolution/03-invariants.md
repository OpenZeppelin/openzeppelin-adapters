---
stage: invariants
project: ens-uikit-support
sub_feature: sf-2-forward-resolution
repo: openzeppelin-adapters
mode: extension
extends: packages/adapter-evm-core/src
status: draft
timestamp: 2026-07-03
author: aleksandr.pasevin
previous_stage: artifacts/001-ens-uikit-support/sf-2-forward-resolution/02-design.md
tags: [ens, name-resolution, forward-resolution, invariants, viem, isValidName, capability, evm, adapter, service]
---

# SF-2 · Forward resolution + capability scaffold + isValidName — Invariants

## Summary

SF-2 is the **fund-safety core of the input path**: a wrong forward result sends funds to the wrong address, so the sharpest invariants are the ones that make a wrong or coerced address structurally impossible and make every expected failure a typed `{ ok: false }` rather than a throw. The organizing principle is *`strict: true` + a deterministic, total, closed classification* — the `getEnsAddress` call is driven with `strict: true` (INV-7) so distinct failure classes surface instead of collapsing into `null`, and every one of those classes lands on exactly one member of the closed seven-code union (INV-10) via a fixed precedence (INV-12): SF-2's own control path produces the not-found / unsupported-name / unsupported-network codes (INV-8, INV-9, INV-11), and everything else is delegated to SF-1's `mapNameResolutionError`. Around that core sit the never-throw contract (INV-6), the sync network-scope gate that guarantees zero I/O for an unsupported network or malformed name (INV-16), the borrowed-client no-dispose ownership boundary (INV-15), and the statelessness that makes SF-2 trivially deterministic-under-stable-state for the SF-4 conformance harness (INV-13). Auth is `n/a` — a public read primitive has no authorization surface (the only lifecycle gate is use-after-dispose, enforced by the factory's guard proxy). This artifact discharges the Design's Open Question 1 (fork-verify `ResolverNotFound` semantics) as INV-8/INV-9 and Open Question 3 (`isValidName` dot-requirement) as INV-4.

## Bindings from prior stages (what this stage builds on)

Surfaced for traceability; each is treated as a fixed commitment here.

- **Public API surface (Design):** `createNameResolution(config, options)` factory; `EvmNameResolutionService` (`isValidName`, `resolveName`, `dispose`) + `createEvmNameResolutionService`; module helpers `isValidName` / `normalizeName` (`name-validation.ts`), `baseEnsProvenance()` (`provenance.ts`); the `nameResolution` registration slot in `adapter-evm/profiles/shared.ts`.
- **Design decisions:** D-A (inject the `PublicClient`), D-B (sync UR support-gate → `UNSUPPORTED_NETWORK`), D-C (`UnsupportedResolverProfile` → `UNSUPPORTED_NAME`), D-D (normalize up-front → `unsupportedName`), D-E (finalized forward-path class→code table: Part A SF-2 constructors + Part B SF-1 mapper), `strict: true` mandatory.
- **Cross-SF (SF-1):** the mapper + typed constructors are imported, pure, and **not modified**. SF-1 INV-1/INV-6 (codomain closure + totality) make the Part-B delegation total; SF-1 INV-11 (mapper never emits not-found) is preserved by keeping all not-found production on SF-2's control path (INV-9); SF-1 INV-12 (`elapsedMs` caller obligation) binds SF-2's catch site (INV-18).
- **Cross-repo (UIKit SF-1):** the `NameResolutionCapability` interface, `ResolutionResult` / `ResolvedAddress` / `ResolutionProvenance` value types, and the `NameResolutionError` union are imported from `@openzeppelin/ui-types` and are **never modified** here.

---

## Request/Response Contract

### INV-1: `resolveName` return-shape closure — always a discriminated `ResolutionResult`, never a bare value

**Category:** Request/Response

**Statement:** For every input, `resolveName(name)` resolves to a value that is a member of the `ResolutionResult<ResolvedAddress>` discriminated union: either `{ ok: true, value: ResolvedAddress }` or `{ ok: false, error: NameResolutionError }`. It never resolves to `undefined`, `null`, a `{ ok: true }` without `value`, a `{ ok: false }` without `error`, or an object missing the `ok` discriminant; and for an *expected* failure it never rejects (see INV-6). Every consumer can branch on `result.ok` and reach a defined arm.

**Applies to:** `EvmNameResolutionService.resolveName`, and the guarded capability surface returned by `createNameResolution`.

**Enforcement mechanism:**
- Type system: return type annotated `Promise<ResolutionResult<ResolvedAddress>>` (the closed union imported from `@openzeppelin/ui-types`); every `return`/`resolve` path is checked against it, and the `default → mapNameResolutionError` branch (total per SF-1 INV-1) makes the function total at the type level.
- Runtime guard: every branch of `resolveName` returns an explicit `{ ok }` literal; the sole non-return exit is the guard proxy's `RuntimeDisposedError` throw (INV-6).
- Test: sweep `resolveName` over success, `null`-return, each classified revert, an unsupported network, an invalid name, and a raw transport throw — assert each resolves to a `{ ok }`-shaped value with the discriminant present.

**Violation scenario:** A new branch `return undefined` slips in for an unhandled revert; the UIKit hook does `if (result.ok)` on `undefined`, takes the `else` arm, reads `result.error.code` → `TypeError`, and a resolvable name renders as a hard crash.

**Severity:** Critical

### INV-2: Success-value fidelity — the resolved address is the verbatim non-null hex, never coerced or placeheld

**Category:** Request/Response

**Statement:** On `{ ok: true }`, `value.address` is exactly the non-`null` hex string returned by `getEnsAddress` for the normalized name — never the zero address, never a truncated/checksum-rewritten/placeholder value, never a default substituted for a missing record. A `null` return (empty record) is **never** presented as success (it is `NAME_NOT_FOUND`, INV-8). `value.name` echoes the **caller's original input** `name` (not the internally-normalized form), and `value.provenance` is a freshly-built `baseEnsProvenance()` (INV-5).

**Applies to:** `EvmNameResolutionService.resolveName` (success arm).

**Enforcement mechanism:**
- Type system: `ResolvedAddress.address: string` (owned by UIKit SF-1); the success literal is constructed only inside the `address !== null` branch.
- Runtime guard: the `if (address === null) return nameNotFound(...)` check precedes the success construction, so a `null` can never flow into `value.address`; the success literal passes `address` through with no transformation.
- Test: resolve a known name against a mocked client returning a fixed hex → assert `value.address` is byte-identical; assert a `null` return yields `NAME_NOT_FOUND`, never `{ ok: true, address: '0x000…0' }`; assert `value.name === <original input>` when input differs from its normalized form (e.g. mixed-case / UTS-46-foldable input).

**Violation scenario:** A "convenience" coercion maps a `null` return to the zero address as a sentinel; a dapp reads `value.address`, funds a transfer to `0x000…000`, and the user's funds are burned — the exact fund-loss the High stakes rating names.

**Severity:** Critical

### INV-3: `isValidName` is a total, pure, synchronous boolean predicate

**Category:** Request/Response

**Statement:** `isValidName(name: string)` returns a `boolean` for every string input and **never throws**, never performs I/O, and never returns a non-boolean. A normalization failure inside it is caught and reported as `false`, not propagated. It is synchronous (returns, does not resolve).

**Applies to:** `EvmNameResolutionService.isValidName`, and the free `isValidName` helper in `name-validation.ts`.

**Enforcement mechanism:**
- Type system: signature `isValidName(name: string): boolean`.
- Runtime guard: the ENSIP-15 `normalize` call is wrapped in `try/catch` returning `false` on throw; the pre-filters (hex reject, dot requirement) are pure predicates.
- Test: feed `''`, a hex address, a bare label, a dotted name, an emoji/confusable name, and a normalize-throwing string — assert each returns a `boolean` and none throws.

**Violation scenario:** `normalize` throws on an adversarial confusable and the throw escapes `isValidName`; the UIKit calls it on every keystroke inside a render path with no `try/catch` (the contract said it never throws), and a single pasted string crashes the input field.

**Severity:** High

### INV-4: `isValidName` semantics — necessary shape gate: reject hex, require a dot, require ENSIP-15 normalizability

**Category:** Request/Response

**Statement:** `isValidName(name)` returns `true` **only if** all hold: (a) `name` is not a valid EVM hex address (`isValidEvmAddress(name) === false`), (b) `name` contains at least one `.` (rejects bare single labels — Design Open Q3), and (c) `name` passes ENSIP-15/UTS-46 `normalize` without throwing. A `true` is **necessary but not sufficient** for resolution — it asserts shape, not existence of a record. The check uses ENSIP-15 `normalize`, not a TLD allowlist regex.

**Applies to:** `isValidName` (`name-validation.ts`), and `resolveName`'s step-2 shape gate.

**Enforcement mechanism:**
- Type system: n/a (value-level predicate).
- Runtime guard: three ordered pure checks; `normalize`-based, not regex-based.
- Test: `isValidName('0xd8dA…')` → `false`; `isValidName('vitalik')` (dotless) → `false`; `isValidName('vitalik.eth')` → `true`; a well-formed `.xyz`/wildcard name → `true` (would fail a hardcoded `/\.(eth)$/`); a name that fails UTS-46 → `false`.

**Violation scenario:** The check regresses to a TLD regex allowlist; a legitimate `.box`/wildcard/DNS name is rejected as "not a name," the UIKit shows "invalid" for a resolvable name, and the whole point of ENS-in-input (accept any resolvable name) is lost. Conversely, dropping the dot requirement lets a bare hex-adjacent label reach the network needlessly.

**Severity:** High

### INV-5: `baseEnsProvenance()` — fixed user-safe shape, fresh per call, no v1 network-scoping

**Category:** Request/Response

**Statement:** `baseEnsProvenance()` returns a newly-allocated `ResolutionProvenance` equal to `{ label: 'ENS', external: false }` on every call — `label` is the fixed user-safe literal `'ENS'` (never a URL, gateway host, or internal identifier), `external` is `false` on the v1 forward path, and `scopedToNetworkId` is **absent** (network-scoping is SF-5's `EnsProvenance` extension). No two success results share a provenance object.

**Applies to:** `baseEnsProvenance` (`provenance.ts`); consumed by `resolveName`'s success arm; the user-safe `label` obligation is what SF-4's conformance `label`-allowlist check and UIKit INV-16 enforce.

**Enforcement mechanism:**
- Type system: return type `ResolutionProvenance` (UIKit SF-1); `label`/`external` required, `scopedToNetworkId` optional and omitted here.
- Runtime guard: single object-literal construction site; no shared/frozen singleton aliased into results.
- Test: assert `baseEnsProvenance()` deep-equals `{ label: 'ENS', external: false }`; assert two calls return `!==` objects; assert `'scopedToNetworkId' in p === false`; assert `label` matches the SF-4 user-safe allowlist (no `://`, no key-shaped substring).

**Violation scenario:** `label` is set to the RPC/gateway URL "for debugging"; SF-4's `label`-allowlist check fails the adapter, and if it slipped through, the UIKit renders a keyed provider URL as the provenance label — a leak (see INV-19) and a conformance failure.

**Severity:** High

## Error Semantics

### INV-6: Never-throw for expected failures — the only sanctioned throw is `RuntimeDisposedError`

**Category:** Error Semantics

**Statement:** `resolveName` **never throws for an expected failure** — every anticipated failure (unsupported network, invalid/unnormalizable name, no record, resolver-semantic revert, gateway failure, timeout, transport/RPC error, unclassifiable native throw) resolves to `{ ok: false, error }`. The single sanctioned throw across the capability surface is `RuntimeDisposedError` on use-after-dispose, raised by the factory's `guardRuntimeCapability` proxy **before** `resolveName`'s body runs (so the mapper is never even consulted, and per SF-1 INV-9 it would re-throw it anyway). No native viem error, and no error from the mapper, ever escapes `resolveName` as a rejection. This is the SF-2 realization of UIKit INV-8 and spec SC-002.

**Applies to:** `EvmNameResolutionService.resolveName`; the guarded capability surface.

**Enforcement mechanism:**
- Type system: return is the closed union; `@throws {RuntimeDisposedError}` documented as the sole throw.
- Runtime guard: the one network call sits in `try`; the `catch` classifies every branch to a `{ ok: false }` (Part A constructors) or delegates to `mapNameResolutionError` (total per SF-1 INV-6); there is no `throw` in the body and no re-`throw` in the catch.
- Test: fault-inject each expected failure class (mock client throws `TimeoutError`, `HttpError`, `ResolverNotFound`, a non-`Error` primitive, etc.) and assert `resolveName` **resolves** (never rejects); separately, call a disposed capability and assert it **rejects** with `RuntimeDisposedError`.

**Violation scenario:** A revert class not in the `switch` re-throws instead of hitting `default → mapper`; the UIKit's resolution path — told expected failures never throw and therefore lacking a `try/catch` there — leaks an untyped exception and the address field crashes on a name whose gateway was merely down.

**Severity:** Critical

### INV-7: `strict: true` is mandatory on `getEnsAddress`

**Category:** Error Semantics

**Statement:** The single `getEnsAddress` call is **always** invoked with `strict: true`. Under `strict: true`, distinct failure classes (gateway HTTP failure, resolver-absent, unsupported profile, malformed offchain response) surface as typed reverts that SF-2 classifies (INV-10), and only a genuine empty-record decode returns `null`. `strict: false` (viem's default) is forbidden on this path because it collapses gateway/resolver/no-record failures into an indistinguishable `null`, which would be mis-reported as `NAME_NOT_FOUND` — hiding a gateway outage or resolver misconfiguration behind "no such name."

**Applies to:** `EvmNameResolutionService.resolveName` (the network call).

**Enforcement mechanism:**
- Type system: n/a (an argument value, not a type).
- Runtime guard: the call site literally passes `{ name: normalized, strict: true }`; a code-review/lint check pins the literal.
- Test: assert the mocked client's `getEnsAddress` is invoked with `strict: true` (spy on the options arg); a regression test that flips it to `false` must fail a dedicated assertion.

**Violation scenario:** Someone drops `strict: true` to "avoid the throws"; a CCIP-Read gateway 500 now returns `null`, SF-2 reports `NAME_NOT_FOUND`, the UIKit tells the user the name doesn't exist, the user retypes / gives up, and a name that *does* resolve (to a funded recipient) is silently unreachable — a fund-directing correctness failure with no error signal.

**Severity:** Critical

### INV-8: `NAME_NOT_FOUND` arises from **both** the `null`-return path and classified reverts

**Category:** Error Semantics

**Statement:** `resolveName` produces `NAME_NOT_FOUND` (via the SF-1 `nameNotFound(name)` constructor) in exactly two situations, both meaning "this well-formed name on this ENS-supporting network has no usable forward record": (1) `getEnsAddress` returns `null` (structural success, empty record — a non-throw path), and (2) the caught revert's `errorName` is `ResolverNotFound` or `ResolverNotContract`. Both are name-scoped, not network-scoped — the D-B support-gate (INV-16) has already pre-empted the genuine "no ENS on this network" case, so a resolver-level revert reaching the catch is necessarily about the *name*. (This discharges Design Open Q1 and refines the Research-stage provisional `UNSUPPORTED_NETWORK`.)

**Applies to:** `resolveName` (null-return branch + `ResolverNotFound`/`ResolverNotContract` switch arms).

**Enforcement mechanism:**
- Type system: `nameNotFound(name)` returns the `NAME_NOT_FOUND` variant (SF-1 INV-2).
- Runtime guard: the `address === null` branch and the two revert `case`s all call `nameNotFound(name)`; no other code maps to not-found.
- Test: (1) mock `null` return → `NAME_NOT_FOUND`; (2) mock a `ResolverNotFound` revert and a `ResolverNotContract` revert → each `NAME_NOT_FOUND`; assert an unregistered `.eth` name on a fork yields `NAME_NOT_FOUND`, **not** `UNSUPPORTED_NETWORK` (the Design's fork-verify note).

**Violation scenario:** Only the `null` path is treated as not-found and `ResolverNotFound` falls through to the mapper → `ADAPTER_ERROR`; an unregistered name surfaces as an internal adapter bug instead of a clean "not found," and the UIKit shows a scary error for a name the user simply hasn't registered.

**Severity:** High

### INV-9: Not-found is produced **only** on SF-2's control path — the mapper never fabricates it (preserves SF-1 INV-11)

**Category:** Error Semantics

**Statement:** Every `NAME_NOT_FOUND` value originates from SF-2 calling `nameNotFound(...)` on its own control path (INV-8); `resolveName` never obtains a not-found from `mapNameResolutionError`, and SF-2 does not ask (and must not cause) SF-1's mapper to emit a not-found. This is the SF-2 side of the contract that keeps SF-1 INV-11 intact: the `ResolverNotFound`/`ResolverNotContract`/`UnsupportedResolverProfile` reverts are classified **upstream in SF-2** (Part A), so SF-1's mapper needs no not-found rows (Design Part B / drift note to SF-1 Code Draft).

**Applies to:** `resolveName` (all not-found production); the SF-1 mapper (must remain not-found-free).

**Enforcement mechanism:**
- Type system: n/a (a sourcing/ownership property).
- Runtime guard: the `switch` handles `ResolverNotFound`/`ResolverNotContract`/`UnsupportedResolverProfile` **before** the `default → mapper` arm; the mapper's classification table (SF-1) contains no not-found row.
- Test: grep/assert `resolveName`'s `default` arm result `code` is never `NAME_NOT_FOUND`/`ADDRESS_NOT_FOUND`; assert SF-1's mapper (imported) never returns a not-found for any gateway/resolver input (cross-checked in SF-1's suite).

**Violation scenario:** A future refactor moves the `ResolverNotFound` classification into SF-1's mapper "to centralize it"; SF-1 INV-11 breaks, a gateway 500 that happens to `.walk()` into a resolver-shaped cause is mis-mapped to `NAME_NOT_FOUND`, and the gateway-vs-not-found distinction the spec's Edge Cases demand collapses.

**Severity:** High

### INV-10: Forward-path classification is total and closed over the seven-code union

**Category:** Error Semantics

**Statement:** Every terminal outcome of `resolveName` is a member of the closed seven-code `NameResolutionError` union (on failure) or a `ResolvedAddress` (on success) — SF-2 never returns or constructs a `code` outside `{ NAME_NOT_FOUND, ADDRESS_NOT_FOUND, UNSUPPORTED_NETWORK, UNSUPPORTED_NAME, RESOLUTION_TIMEOUT, EXTERNAL_GATEWAY_ERROR, ADAPTER_ERROR }`, and never invents one. Totality is guaranteed structurally: SF-2's Part-A constructors cover the control-path codes, and the `default` arm delegates to `mapNameResolutionError`, which is itself total and codomain-closed (SF-1 INV-1/INV-6). The catch therefore has no unhandled path. (`ADDRESS_NOT_FOUND` is reachable only from SF-3's reverse path, not SF-2.)

**Applies to:** `resolveName` (every return path).

**Enforcement mechanism:**
- Type system: union return type; the `default` branch's `mapNameResolutionError` return is `NameResolutionError`, so the compiler sees every arm as union-typed.
- Runtime guard: the `switch` `default` is an unconditional delegate to the mapper; there is no arm that returns a bare/unknown shape.
- Test: enumerate the forward-path class→code table (Design D-E Part A + Part B) and assert each maps to its expected union code; feed an unclassifiable throw and assert `ADAPTER_ERROR` with `cause` preserved (via SF-1).

**Violation scenario:** A new revert branch returns `{ ok:false, error: { code: 'GATEWAY_TIMEOUT' } }` (an invented code); the UIKit's exhaustive `switch` over seven codes has no arm, renders nothing, and SF-4's closed-union check fails the adapter.

**Severity:** Critical

### INV-11: `UNSUPPORTED_NAME` classification — shape gate, normalize throw, and `UnsupportedResolverProfile`

**Category:** Error Semantics

**Statement:** `resolveName` produces `UNSUPPORTED_NAME` (via `unsupportedName(name, reason)`) in exactly three name-property situations, each with a precise user-safe `reason`: (1) the step-2 shape gate `isValidName(name)` is `false` (`reason: 'not a well-formed ENS name'`); (2) `normalizeName(name)` throws despite the shape gate (D-D backstop, `reason` derived from the normalize failure); (3) the caught revert's `errorName` is `UnsupportedResolverProfile` (D-C, `reason: 'the ENS resolver for this name does not implement address (addr) resolution'`). `UNSUPPORTED_NAME` is used **only** for these name-property failures — never for a missing record (that is `NAME_NOT_FOUND`) and never for an adapter/transport fault (that is `ADAPTER_ERROR`).

**Applies to:** `resolveName` (shape gate, normalize catch, `UnsupportedResolverProfile` switch arm); `unsupportedName` (SF-1).

**Enforcement mechanism:**
- Type system: `unsupportedName(name, reason)` returns the `UNSUPPORTED_NAME` variant carrying `name` + `reason` (SF-1 INV-2).
- Runtime guard: three explicit call sites; the `UnsupportedResolverProfile` `case` precedes `default → mapper`.
- Test: invalid shape → `UNSUPPORTED_NAME`; a normalize-throwing input reaching the constructor → `UNSUPPORTED_NAME` with a non-empty `reason`; a mocked `UnsupportedResolverProfile` revert → `UNSUPPORTED_NAME` (not `NAME_NOT_FOUND`, not `ADAPTER_ERROR`).

**Violation scenario:** `UnsupportedResolverProfile` is routed to `NAME_NOT_FOUND`; a registered name whose resolver simply lacks the `addr` profile is reported as "doesn't exist," and the user can't tell a missing name from a resolver-capability gap — a misleading, potentially fund-directing message.

**Severity:** High

### INV-12: Deterministic classification precedence — a fixed total order from gates to `default`

**Category:** Error Semantics

**Statement:** `resolveName` evaluates a fixed, total precedence so any given (name, network state, native-error shape) always classifies to the same code: **(0)** the guard proxy's use-after-dispose check (throws `RuntimeDisposedError`) → **(1)** D-B sync support-gate (`UNSUPPORTED_NETWORK`) → **(2)** shape gate `isValidName` (`UNSUPPORTED_NAME`) → **(3)** `normalizeName` throw (`UNSUPPORTED_NAME`) → **(4)** the network call: `null` → `NAME_NOT_FOUND`, else success → **(5)** catch: `ResolverNotFound`/`ResolverNotContract` → `NAME_NOT_FOUND`, `UnsupportedResolverProfile` → `UNSUPPORTED_NAME`, `default` → `mapNameResolutionError` (whose own precedence is SF-1 INV-8/INV-10). First match wins; gates 1–3 run before any I/O.

**Applies to:** `resolveName`.

**Enforcement mechanism:**
- Type system: n/a (control flow).
- Runtime guard: the gates are sequential early-returns; the catch is an ordered `switch` on `errorName` with a `default` delegate — no unordered set that could double-match.
- Test: construct inputs that could satisfy two levels (e.g. an invalid name on an unsupported network) and assert the higher-precedence code wins (`UNSUPPORTED_NETWORK` before `UNSUPPORTED_NAME`, because the support-gate runs first); snapshot the full level→code table.

**Violation scenario:** The shape gate is moved before the support-gate; an invalid name typed while pointed at a non-ENS network returns `UNSUPPORTED_NAME` instead of `UNSUPPORTED_NETWORK`, and the UIKit tells the user to fix a name on a chain where no name would ever resolve — a confusing, wrong diagnosis.

**Severity:** High

## Idempotency & Retry

### INV-13: Stateless & deterministic-under-stable-state — repeated calls converge, concurrent calls are independent

**Category:** Idempotency & Retry

**Statement:** `EvmNameResolutionService` holds no resolution state — it caches nothing, memoizes nothing, and mutates no field across calls (it holds only the injected client and the bound network config, both read-only). Therefore, under stable underlying chain/registry state, repeated `resolveName(name)` (and `isValidName(name)`) calls return **structurally-equal** results, and concurrent/interleaved calls never interfere or share mutable state. This statelessness is precisely what lets SF-4's conformance harness apply its deep-equal-under-cache-TTL determinism check to the EVM adapter.

**Applies to:** `EvmNameResolutionService.resolveName`, `isValidName`; the pure helpers.

**Enforcement mechanism:**
- Type system: service fields are `readonly`; no mutable cache field is declared.
- Runtime guard: no module-level or instance-level mutable state; each call builds fresh results (INV-5) and reads no clock/RNG into its output (elapsedMs is on the *error* path only and is measured per-call, INV-18).
- Test: two `resolveName` calls with equal input against a stable mock return deep-equal results (distinct object identities); grep the service for mutable instance state / cache and assert none; run interleaved concurrent calls and assert no cross-talk.

**Violation scenario:** An LRU cache is added keyed by name only (ignoring network); after a network switch (which should recreate the capability), a stale cache entry returns the wrong-chain address, and a deterministic-under-stable-state assertion in SF-4 fails — or worse, a real consumer funds the wrong chain's address.

**Severity:** High

### INV-14: Read-only and retry-safe — no state mutation, no submission, safe to re-invoke at any time

**Category:** Idempotency & Retry

**Statement:** `resolveName` performs a **read-only** RPC (ENS resolution) and no state-changing operation — no transaction submission, no KV/disk write, no external mutation. A retry (at 1s, 1h, after a crash, from another process) submits nothing, double-writes nothing, and simply re-reads; the operation is inherently idempotent with no idempotency key or dedup record required. There is no partial-effect window a retry could observe or duplicate.

**Applies to:** `resolveName`.

**Enforcement mechanism:**
- Type system: n/a.
- Runtime guard: the only external call is `publicClient.getEnsAddress` (a read); no `writeContract`/`sendTransaction`/KV/fs API is imported or invoked.
- Test: spy the injected client and assert only read methods are called; assert no write/submit/persist API is reachable from `resolveName`.

**Violation scenario:** A telemetry "resolution log" is written to a shared KV inside `resolveName`; a retried resolution double-writes, an analytics count is inflated, and (if the write can fail) an expected-failure path gains a new throw channel that breaks INV-6.

**Severity:** Medium

## Auth Boundary

**Not applicable — recorded explicitly.** SF-2 is a **public read primitive**: ENS forward resolution reads publicly-readable on-chain/gateway state, carries no caller identity, gates no privileged operation, and holds no credential of its own (the injected client's transport/keys are the runtime's concern, INV-15/INV-19). There is nothing to authorize. The one lifecycle boundary is **use-after-dispose**, enforced by the factory's `guardRuntimeCapability` proxy (raising `RuntimeDisposedError` before the body — INV-6), not an authorization check. Network-scope admission (may this network resolve at all?) is a request-contract gate (INV-16), not an auth gate. Recorded rather than omitted, per coverage discipline; the auth surface for name resolution, if any, lives in the host runtime that wires the client.

## Side-Effect Ordering & Observability

### INV-15: Borrowed-client no-dispose ownership — the capability never tears down the injected `PublicClient`

**Category:** Side-Effect Ordering & Observability

**Statement:** The `PublicClient` is **owned by the composing runtime** (`adapter-evm/profiles/shared.ts`), injected via `CreateNameResolutionOptions` (D-A). The capability **borrows** it: `dispose()` is a no-op with respect to the client — it never calls a client teardown, never closes its transport, never nulls a shared handle — and the capability registers `cleanupStage: 'general'` (not `'rpc'`) precisely because SF-2 releases no RPC resource of its own. After a capability `dispose()`, the same injected client remains fully usable by the runtime and any other capability sharing it.

**Applies to:** `EvmNameResolutionService.dispose`; `createNameResolution` (cleanup registration).

**Enforcement mechanism:**
- Type system: n/a (a lifecycle/ownership property).
- Runtime guard: `dispose()` body touches no client method (at most a debug log); no `registerRuntimeCapabilityCleanup` for the client; `cleanupStage: 'general'`.
- Test: build a service over a spy client, call `dispose()`, assert **no** client teardown/close method was invoked and the client is still callable afterward; assert `cleanupStage === 'general'`.

**Violation scenario:** `dispose()` calls a transport-close on the shared client; a second capability (or the runtime) that shares that client suddenly fails all RPC after this capability is disposed — an ownership violation that manifests as spurious `ADAPTER_ERROR`s elsewhere in the runtime.

**Severity:** High

### INV-16: Pre-I/O gating — zero network round-trips before the support-gate and shape/normalize gates pass

**Category:** Side-Effect Ordering & Observability

**Statement:** `resolveName` performs **no network I/O** until after (a) the sync D-B support-gate confirms the bound chain carries `contracts.ensUniversalResolver`, and (b) the shape gate + normalize succeed. An unsupported network returns `UNSUPPORTED_NETWORK`, and an invalid/unnormalizable name returns `UNSUPPORTED_NAME`, **without a single `getEnsAddress` call**. Ordering: support-check → shape/normalize → (at most) one network call. This makes cheap, deterministic pre-checks free of round-trips and guarantees the D-B decision is made before viem could throw its own `ChainDoesNotSupportContract`.

**Applies to:** `resolveName` (gate ordering); `supportsEns()`.

**Enforcement mechanism:**
- Type system: n/a (ordering).
- Runtime guard: the support-gate and shape/normalize checks are early-returns positioned before the `try` containing the sole `getEnsAddress` call.
- Test: with a spy client, call `resolveName` on an unsupported-network config and on an invalid name → assert `getEnsAddress` was **never** invoked and the correct typed code returned; on a valid name + supported network assert it is invoked **exactly once**.

**Violation scenario:** The support-gate is checked after the call; viem throws `ChainDoesNotSupportContract`, the catch maps it (via the mapper backstop) — functionally the same code, but every unsupported-network probe now costs a wasted RPC round-trip and a thrown-error allocation, and the "sync, before I/O" guarantee D-B rests on is gone.

**Severity:** Medium

### INV-17: `dispose()` is idempotent and observably inert; the service emits no events/metrics

**Category:** Side-Effect Ordering & Observability

**Statement:** `dispose()` is idempotent (repeated calls are safe, enforced by `guardRuntimeCapability`) and produces no observable effect beyond at most a single debug log — no metric, no event, no state transition visible to other components. The service emits **no** telemetry of its own during resolution (per-resolution latency/success telemetry is the UIKit consumer's concern); there is no observability slot on the capability, and no reader can observe optimistic or partially-applied state because the service holds none (INV-13).

**Applies to:** `EvmNameResolutionService.dispose`; the service surface.

**Enforcement mechanism:**
- Type system: n/a.
- Runtime guard: `dispose()` is a debug-log-or-noop; idempotency provided by the guard; no metrics/event emitter is imported or injected.
- Test: call `dispose()` twice → no throw, no second-call side effect; spy for any metric/event emission during `resolveName`/`dispose` → assert none.

**Violation scenario:** `dispose()` decrements a shared in-flight counter without idempotency; a double-dispose (common under React strict-mode double-invoke on the consumer side) drives the counter negative and corrupts the runtime's resource accounting.

**Severity:** Medium

## Resource Limits & Rate

### INV-18: Bounded work per call — at most one UR round-trip, no internal retry loop, caller-measured `elapsedMs`

**Category:** Resource Limits & Rate

**Statement:** A single `resolveName` performs **at most one** Universal-Resolver round-trip (viem's own CCIP-Read traversal within that call is viem's bounded concern), runs **no** retry/backoff loop of its own, and allocates no unbounded structure — work is O(1) plus one bounded network call. SF-2 owns **no** resolution-scoped timeout budget; it relies on the injected client's transport timeout, and it **measures** wall-clock via `performance.now()` around the call, supplying `ctx.elapsedMs` to `mapNameResolutionError` on the timeout/transport path so `RESOLUTION_TIMEOUT.elapsedMs` is a real number, not SF-1's `-1` sentinel (SF-1 INV-12 caller obligation). `resolveName` never blocks indefinitely beyond the transport timeout.

**Applies to:** `resolveName` (the catch site's `ctx.elapsedMs`; the single-call bound).

**Enforcement mechanism:**
- Type system: `NameResolutionErrorContext.elapsedMs?: number` (SF-1).
- Runtime guard: `const started = performance.now()` immediately before the call; `elapsedMs: performance.now() - started` in the `default` ctx; no loop around the call.
- Test: assert exactly one `getEnsAddress` call per `resolveName`; fault-inject a `TimeoutError` and assert the mapped `RESOLUTION_TIMEOUT.elapsedMs` is a finite `>= 0` number (not `-1`), confirming the caller obligation is met.

**Violation scenario:** SF-2 forgets to pass `elapsedMs`; every timeout surfaces `elapsedMs: -1`, a UIKit "timed out after Nms" formatter renders "-1ms," and the cross-SF obligation from SF-1 INV-12 is silently unmet (a review/lint smell SF-1's Dev Notes flagged).

**Severity:** Medium

## Sensitive Data Handling

### INV-19: No new credential-leak channel — native-message text is redacted by the mapper; SF-2's own strings are curated

**Category:** Sensitive Data Handling

**Statement:** SF-2 introduces **no** channel that could leak credentials. It constructs **no** free-text error field directly from a raw native (viem/RPC/gateway) message — every native-message-derived string reaches a returned error only through SF-1's `mapNameResolutionError`, which applies credential redaction (SF-1 INV-16) and keeps the unredacted original only on the opaque `ADAPTER_ERROR.cause`. SF-2's own control-path error text is either static literals (`'not a well-formed ENS name'`, the D-C resolver-profile reason) or a curated `normalize`-failure description containing no transport secret, and `provenance.label` is the fixed `'ENS'` literal (INV-5) — never a keyed provider URL. The `networkId` on `UNSUPPORTED_NETWORK` is an internal namespace identifier, not a secret.

**Applies to:** `resolveName` (control-path error construction + `default` delegation); `baseEnsProvenance` (`label`).

**Enforcement mechanism:**
- Type system: n/a (value-level content).
- Runtime guard: no `error.message`/`String(error)` is placed on a returned field by SF-2 — that extraction and its redaction live in SF-1; SF-2's `unsupportedName` reasons are literals/curated; `label` is a constant.
- Test: fault-inject a viem error whose message embeds `…/v2/SECRETKEY` and assert the SF-2-returned `ADAPTER_ERROR.message`/`EXTERNAL_GATEWAY_ERROR.detail` (produced via the mapper) do not contain `SECRETKEY`, while `cause` still carries it; assert `provenance.label` and every SF-2 control-path `reason` contain no `://` or key-shaped substring.

**Violation scenario:** SF-2 "enriches" a normalize-failure reason by concatenating `String(error)` from a deeper transport error that happens to carry a keyed URL; the reason string bypasses SF-1's redaction, and the UIKit renders a provider API key in a validation toast.

**Severity:** High

## Performance, Scalability & Re-usability

### INV-20: Dependency-injection seam — client injected, no hardcoded host; re-usable via config only

**Category:** Performance, Scalability & Re-usability

**Statement:** The capability takes all host dependencies by injection: the `PublicClient` via `CreateNameResolutionOptions` (D-A) and the network config as a parameter — it constructs no client internally, imports no concrete singleton logger/clock/transport, and hardcodes no app/RI/network reference. A different host (another app, RI, or a unit test) embeds the capability by passing a different client + config and changing **no source**. The only non-`import type` runtime dependencies are viem (already an `adapter-evm-core` dependency) and SF-1's leaf mapper; the UIKit types are `import type` only (erased at build).

**Applies to:** `createNameResolution`, `createEvmNameResolutionService`, `EvmNameResolutionService`.

**Enforcement mechanism:**
- Type system: constructor/factory parameters are the sole dependency inlets; UIKit-type imports are `import type`.
- Runtime guard: no `createEvmPublicClient` call inside the capability (that lives in the registration layer); no module-level singleton.
- Test: instantiate the service in a bare test with a hand-rolled mock `{ getEnsAddress, chain }` and no host wiring; assert it resolves; assert the compiled output has no runtime dependency on `@openzeppelin/ui-types`.

**Violation scenario:** The capability calls `createEvmPublicClient` internally when `publicClient` is absent; the minimal-chain fallback (id 1, no contracts) silently disables ENS where `viemChain` was absent (D-A's rejected path), and the capability is no longer embeddable with a caller-supplied client.

**Severity:** Medium

### INV-21: `isValidName` is an independently-importable, client-free hot-path predicate

**Category:** Performance, Scalability & Re-usability

**Statement:** `isValidName` / `normalizeName` live in `name-validation.ts` with **no dependency on the service or the injected client** — they are pure, synchronous, allocation-light, and importable on their own. This makes `isValidName` safe for the UIKit to call on **every keystroke** (its stated hot-path use) with no round-trip, no client, and no capability instance, and lets `resolveName` reuse the exact same shape gate (INV-4) it advertises to consumers.

**Applies to:** `isValidName`, `normalizeName` (`name-validation.ts`).

**Enforcement mechanism:**
- Type system: the module imports only `viem/ens` `normalize` and the local `isValidEvmAddress` — no service/client import.
- Runtime guard: pure functions; no I/O, no async, no shared state.
- Test: import `isValidName` directly from `name-validation.ts` with no service constructed and exercise it; assert no network/client is touched; a micro-benchmark confirms sub-millisecond typical evaluation (allocation-light).

**Violation scenario:** `isValidName` is refactored to live on the service and reach the client for a "better" check; the UIKit can no longer call it per-keystroke without a capability instance and a round-trip, the input field lags or fires network calls on every character, and INV-3's never-throw/no-I/O guarantee erodes.

**Severity:** Medium

## Existing Invariants (Extension Mode)

SF-2 adds files under `src/name-resolution/` + `src/capabilities/name-resolution.ts` and one registration slot in `adapter-evm/profiles/shared.ts`; it modifies no existing behavior. Invariants it must **preserve**:

### Preserved
- **SF-1's `error-mapping.ts` is imported, not modified.** SF-2 consumes `mapNameResolutionError` + the typed constructors and feeds the mapper only Part-B rows; it does **not** add not-found rows to the mapper — preserving **SF-1 INV-11** (mapper never emits not-found) via the Part A/B split (INV-9).
- **`erc4626` / `addressing` and every other existing capability are untouched.** SF-2 mirrors the `erc4626` factory shape but adds a new capability; it renames/re-signs nothing.
- **`shared/revert-info.ts` is reused as-is** (`extractRevertInfo`, `BaseError`) — read, not modified — exactly as `erc4626/error-mapping.ts` uses it.
- **`createEvmPublicClient` / `resolveRpcUrl` are reused unchanged** at the registration layer.
- **Non-EVM adapters (`adapter-solana`, `adapter-midnight`, `adapter-polkadot`, `adapter-stellar`) continue to type-check, build, and pass tests** — the capability is additive and optional at the runtime-map level (spec SC-006); non-EVM adapters omit the slot and are unaffected.
- **UIKit `@openzeppelin/ui-types` shape is never modified** — SF-2 imports the interface, value types, and error union and implements against them.
- **The `nameResolution` capability slot is already optional** on `EcosystemRuntime` / `CapabilityFactoryMap` (UIKit SF-1); SF-2 supplies the EVM factory without changing the slot's optionality.

### Modified
- **`adapter-evm/profiles/shared.ts`** — the eager `capabilityFactories` and lazy `createRuntimeCapabilityFactories` gain a `nameResolution` slot threading an injected client. Additive: no existing slot changes shape or behavior.
- **`src/name-resolution/index.ts`** (SF-1 barrel) and **`src/capabilities/index.ts`** — append re-exports only; no existing export changes.

### New
- INV-1 … INV-21 above.

## Invariant Coverage Matrix

| Function / surface | Invariants | Enforcement |
|--------------------|-----------|-------------|
| `resolveName()` | INV-1, INV-2, INV-6, INV-7, INV-8, INV-9, INV-10, INV-11, INV-12, INV-13, INV-14, INV-16, INV-18, INV-19 | Req/Res + Err + Idem + Order/Obs + Rate + SensitiveData |
| `isValidName()` (service + helper) | INV-3, INV-4, INV-13, INV-21 | Req/Res + Idem + Perf/Reuse |
| `normalizeName()` | INV-3 (backstop), INV-4, INV-21 | Req/Res + Perf/Reuse |
| `baseEnsProvenance()` | INV-5, INV-13, INV-19 | Req/Res + Idem + SensitiveData |
| `createNameResolution()` (factory) | INV-1, INV-6, INV-15, INV-20 | Req/Res + Err + Order/Obs (ownership) + Perf/Reuse |
| `createEvmNameResolutionService()` | INV-13, INV-20 | Idem + Perf/Reuse |
| `EvmNameResolutionService.dispose()` | INV-15, INV-17 | Order/Obs (ownership + idempotent inert) |
| `nameResolution` registration slot (`adapter-evm`) | INV-15, INV-16, INV-20; SC-006 (Preserved) | Order/Obs + Perf/Reuse + additive-optional |
| `CreateNameResolutionOptions` (type) | INV-15 (`publicClient` borrowed), INV-20 (DI seam) | Ownership + Re-usability |

## Out of Scope

- **Reverse resolution / `resolveAddress` / `forwardVerified` / avatar** — SF-3. `ADDRESS_NOT_FOUND` is in the union but unreachable from SF-2.
- **ENS v2 (first-class CCIP-Read / Namechain / cross-chain) / `EnsProvenance` / `isEnsProvenance` / `scopedToNetworkId` / `viaGateway: true`** — SF-5. SF-2's `baseEnsProvenance()` (`external:false`, no scope) is the seam SF-5 extends; SF-2 uses the UR's built-in CCIP-Read only incidentally and asserts no v2 provenance property.
- **The `NameResolutionError` union shape and its fields** — owned by UIKit SF-1; SF-2 maps *into* it and is forbidden from adding/removing fields.
- **The mapper's internal class→code predicate table (Part B) and its redaction** — owned by SF-1 (SF-1 INV-1/INV-6/INV-16); SF-2 fixes only the *forward-path delegation contract* (INV-9, INV-10, INV-19), not the mapper's internals.
- **`ResolverError` offchain-origin reclassification** — Design Open Q2; SF-2 maps `ResolverError` → `ADAPTER_ERROR` (via mapper); reclassification needs explicit gateway context and is SF-5's.
- **The conformance harness that *enforces* several of these (concrete-boolean, never-throw, determinism, user-safe `label`)** — SF-4. SF-2 defines the properties (INV-5 label, INV-6 never-throw, INV-13 determinism); SF-4 builds the parameterized check.
- **A resolution-scoped timeout budget / `AbortController`** — SF-2 relies on transport timeout and measures `elapsedMs` (INV-18); an owned budget is a possible SF-5/future extension.
- **Rate limiting / admission control** — no rate surface at this layer: `resolveName` is a stateless read; back-pressure and quota are the host runtime's transport concern.
- **Auth** — no authorization surface (see Auth Boundary section).

## Dev Notes

- **Discharges Design Open Questions:** Open Q1 (fork-verify `ResolverNotFound` semantics) → INV-8 + INV-9 (state the "NAME_NOT_FOUND from both null and classified-revert" property explicitly; Tests must pin it against a mainnet fork — resolve an unregistered `.eth` and assert `NAME_NOT_FOUND`, not `UNSUPPORTED_NETWORK`). Open Q3 (`isValidName` dot-requirement) → INV-4 (require a dot; Tests should confirm no target deployment resolves dotless single-label names via the forward `addr` path — if one does, relax the pre-filter, correctness still gated by `normalize`). Open Q2 (`ResolverError` offchain reclassification) is carried to SF-5 (Out of Scope).
- **Cross-SF obligation to carry into Code Draft (from SF-1 INV-12 / INV-18):** the `performance.now()` measurement around the `getEnsAddress` call is load-bearing — a missing `ctx.elapsedMs` yields a `-1` sentinel to consumers. Worth a review/lint check in SF-2 Code Draft.
- **`instanceof` brittleness (inherited from SF-1 Dev Notes):** SF-2's catch uses `error instanceof BaseError` + `extractRevertInfo(...).errorName`; a duplicate-copy/bundled viem can defeat `instanceof`. The `errorName`-needle path (via `extractRevertInfo`) backstops the `switch`; Tests should simulate a foreign-realm revert (matching `errorName`, failing `instanceof`) and confirm the `switch` still classifies `ResolverNotFound`/`UnsupportedResolverProfile` correctly.
- **Class→code table is pinned to `viem@2.44.4`** (Design D-E / Dev Notes) — a viem major bump requires re-validating INV-8/INV-10/INV-11 against the new UR error surface; add a version-tying code comment.
- **Cross-repo HOLD (same as SF-1):** `@openzeppelin/ui-types@3.1.0` does not yet export `NameResolutionError`/`ResolvedAddress`/`NameResolutionCapability`; typecheck stays red until UIKit SF-1 types land via local-linking. These invariants assume the designed shapes; do not locally redefine any UIKit-owned type.

## Open Questions

*(Both are narrower follow-ups surfaced here, not blockers; Design Open Questions 1 and 3 are resolved above, Open Question 2 is carried to SF-5.)*

1. **`RuntimeDisposedError` is the sole re-throw — confirm the guard proxy, not `resolveName`, raises it.** INV-6 assumes `guardRuntimeCapability` throws `RuntimeDisposedError` *before* the body runs (so the mapper never sees it, consistent with SF-1 INV-9's allowlist). Code Draft should confirm the guard wraps `resolveName` such that no in-body disposal check is needed; if any in-body path can observe disposal, add an explicit `RuntimeDisposedError` re-throw ahead of classification.
2. **`isValidName` normalize-cost under adversarial input (INV-21).** ENSIP-15 `normalize` on a pathological confusable string is bounded but not free; if per-keystroke profiling in the UIKit shows a hot-path cost, consider a cheap structural pre-filter before `normalize` (dot + charset) — a Code Draft micro-optimization, not a contract change.
