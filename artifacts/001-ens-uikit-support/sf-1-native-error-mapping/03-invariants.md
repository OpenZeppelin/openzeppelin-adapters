---
stage: invariants
project: ens-uikit-support
sub_feature: sf-1-native-error-mapping
repo: openzeppelin-adapters
mode: extension
extends: packages/adapter-evm-core/src
status: draft
timestamp: 2026-07-03
author: aleksandr.pasevin
previous_stage: artifacts/001-ens-uikit-support/sf-1-native-error-mapping/02-design.md
tags: [ens, name-resolution, error-mapping, invariants, viem, evm, adapter, service]
---

# SF-1 · Native-error → NameResolutionError mapping — Invariants

## Summary

SF-1 is a **pure, stateless** classification module: `mapNameResolutionError(error, ctx?)` is total over expected failures and the four typed constructors build the non-throw control-path variants. The invariants therefore center on **codomain closure** (output is always a member of the closed seven-code union UIKit SF-1 owns — never an invented code, never `undefined`), **totality with a single closed carve-out** (every input returns a union member or re-throws a designated programmer-error class — no third outcome), and **purity / determinism** (no I/O, no clock, no mutation of the caught error — the property SF-4's conformance determinism check leans on). Auth-boundary invariants are `n/a` (a leaf utility has no auth surface); the sharpest properties are the never-throw guarantee (INV-6), the credential-redaction obligation on renderable free-text (INV-16), and the three formalizations that discharge the Design's deferred open questions (INV-9, INV-10, INV-12). This artifact resolves all three deferred questions — see **Resolved Open Questions** below.

## Resolved Open Questions (deferred from Design)

The Design carried three questions to Invariants. All three are resolved here; each maps to a formal invariant.

### RQ-1 → INV-10, INV-16: timeout-vs-gateway precedence, and `elapsedMs` on `EXTERNAL_GATEWAY_ERROR`

- **Precedence (formalized as INV-10):** when a caught error classifies as a transport timeout/failure **and** `ctx.viaGateway === true`, the result is `EXTERNAL_GATEWAY_ERROR` — the gateway flag *dominates* the timeout classification (precedence row 1 before row 2). A bare timeout with no gateway flag is `RESOLUTION_TIMEOUT`. This is a **total order**, so the ambiguous "a CCIP-Read call that timed out" case has exactly one answer.
- **Does `elapsedMs` belong on `EXTERNAL_GATEWAY_ERROR`? — No, and it *must not*.** Two independent reasons:
  1. The `NameResolutionError` union is **closed and owned by UIKit SF-1**; `EXTERNAL_GATEWAY_ERROR` carries `{ detail: string }` and nothing else. Adding an `elapsedMs` field would *modify the upstream-owned union*, which SF-1 is contractually forbidden from doing (Design "Out of Scope"; spec §Within-Repo Scope). `elapsedMs` exists on `RESOLUTION_TIMEOUT` **only**.
  2. `elapsedMs` is not "provenance" — provenance is a **success-path** concept carried on `ResolvedAddress`/`ResolvedName`, never on an error variant. No error variant carries provenance at all. So the phrasing "does `elapsedMs` belong in provenance" resolves doubly negative: errors have no provenance field, and `EXTERNAL_GATEWAY_ERROR` has no `elapsedMs` field.
- **Where elapsed-on-gateway-timeout can still surface:** if the elapsed time is diagnostically useful on a gateway timeout, the caller may fold a human-readable elapsed hint into the free-text `detail` string — subject to the redaction obligation (INV-16). It is never a typed numeric field on the gateway variant.

### RQ-2 → INV-12: `elapsedMs` provenance / fallback

- **The mapper cannot read a clock** (purity, INV-14), so `elapsedMs` is caller-supplied via `ctx.elapsedMs`. `RESOLUTION_TIMEOUT.elapsedMs` is a **required `number`** in the closed union, so the mapper must always produce a finite number when it constructs that variant.
- **Resolution — both a caller obligation and a mapper safety net (not either/or):**
  - **Caller obligation (binds SF-2/SF-3/SF-5, recorded here, not enforceable inside SF-1):** any resolution path on which a timeout is *possible* MUST supply `ctx.elapsedMs` measured by its own timeout wrapper (the Design integration sketch already does — `elapsedMs: performance.now() - started`). The sentinel below is a totality guard, **not** a license to omit.
  - **Mapper safety net (INV-12, enforceable in SF-1):** when the mapper classifies `RESOLUTION_TIMEOUT` and `ctx.elapsedMs` is absent or not a finite non-negative number, it emits the sentinel **`-1`**. `-1` is chosen over `0` because it is not a physically-realizable elapsed time, so a consumer can distinguish "unmeasured" from a genuine sub-millisecond `0`; `0` would be an ambiguous plausible-but-wrong real value.
- **Net:** the mapper's output `RESOLUTION_TIMEOUT.elapsedMs` is *always* a finite number (INV-12); quality of that number is the caller's obligation; totality never depends on the caller honoring it.

### RQ-3 → INV-9: which classes count as "genuine programmer errors" to re-throw

- **The carve-out is a closed, explicit *allowlist* — not a structural/duck-typed predicate.** Membership is by designated class identity (`instanceof`-primary + `.name`-needle fallback, mirroring the classification defense-in-depth), against a named constant set. **Current set: exactly `{ RuntimeDisposedError }`.**
- **Everything else maps into the union — including a plain `TypeError`, `RangeError`, or `ReferenceError`.** Rationale (the formal-methods crux): the never-throw contract (INV-6) is the module's most valuable guarantee, and every class added to the re-throw set *narrows* it. A `TypeError` can arise from a transport library chewing on malformed wire data, not only from a caller bug; re-throwing it would crash an otherwise-expected failure path. The cost of a **false re-throw** (aborting an expected-failure path) strictly exceeds the cost of a **false `ADAPTER_ERROR`** (a genuine bug surfaced as a typed error) — because `ADAPTER_ERROR.cause` preserves the original by reference (INV-7, INV-17), so no diagnostic fidelity is lost. Therefore the bias is: **map to `ADAPTER_ERROR`; re-throw only explicit allowlist members.**
- **Extension discipline:** the allowlist is a named constant (e.g. `PROGRAMMER_ERROR_CLASSES`). Future lifecycle/assertion classes join it only by explicit addition, never by broadening the predicate to "looks like a bug." Adding a member is an **API-visible decision** because it narrows the never-throw guarantee that UIKit INV-8 and the SF-4 conformance harness depend on.
- **Precedence:** the re-throw check runs **first** (classification row 0), before any union classification, so a disposed-capability error can never be mis-mapped to `ADAPTER_ERROR`.

---

## Request/Response Contract

### INV-1: Codomain closure — output is always a member of the closed seven-code union

**Category:** Request/Response

**Statement:** Every value `mapNameResolutionError` *returns* has a `code` field whose value is one of exactly `{ 'NAME_NOT_FOUND', 'ADDRESS_NOT_FOUND', 'UNSUPPORTED_NETWORK', 'UNSUPPORTED_NAME', 'RESOLUTION_TIMEOUT', 'EXTERNAL_GATEWAY_ERROR', 'ADAPTER_ERROR' }`, carrying exactly that variant's required payload. The function never returns `undefined`, `null`, an object without a `code`, or a `code` outside the seven literals. No invented code ever escapes the union.

**Applies to:** `mapNameResolutionError`; by construction also all four constructors.

**Enforcement mechanism:**
- Type system: return type annotated `NameResolutionError` (the closed discriminated union imported `import type` from `@openzeppelin/ui-types`); every return path is checked against it. The `ADAPTER_ERROR` fallback (row 6) makes the function total at the type level — there is no code path that returns anything else.
- Runtime guard: the classification's final `else` branch is unconditional `ADAPTER_ERROR`; there is no reachable path returning a bare/unknown shape.
- Test: exhaustively assert `result.code ∈ SEVEN_CODES` across a corpus of native errors, non-Error throws, `null`, `undefined`, primitives, and unclassifiable objects.

**Violation scenario:** A new native-error branch returns `{ code: 'GATEWAY_TIMEOUT', … }` (an invented code) instead of a union member; a downstream `switch` over the seven codes falls through, the UIKit renders nothing, and SF-4's closed-union check fails.

**Severity:** Critical

### INV-2: Constructor payload exactness

**Category:** Request/Response

**Statement:** Each typed constructor returns exactly its variant with exactly the required fields and no extras: `nameNotFound(name) → { code: 'NAME_NOT_FOUND', name }`; `addressNotFound(address) → { code: 'ADDRESS_NOT_FOUND', address }`; `unsupportedName(name, reason) → { code: 'UNSUPPORTED_NAME', name, reason }`; `unsupportedNetwork(networkId) → { code: 'UNSUPPORTED_NETWORK', networkId }`. Field values are the arguments verbatim; no coercion, no defaulting, no additional keys.

**Applies to:** `nameNotFound`, `addressNotFound`, `unsupportedName`, `unsupportedNetwork`.

**Enforcement mechanism:**
- Type system: each constructor's return type is annotated to the specific variant (not the whole union), so an extra or missing field is a compile error.
- Runtime guard: constructors are one-line object literals — no branching.
- Test: structural-equality assertion per constructor, plus a "no extra keys" check (`Object.keys(result).sort()` equals the expected set).

**Violation scenario:** `unsupportedName` silently drops `reason` (or defaults it to `''`), and the UIKit's SF-2 validation layer can no longer tell the user *why* a name was rejected.

**Severity:** High

### INV-3: Fresh immutable results — no shared mutable state

**Category:** Request/Response

**Statement:** Every invocation of the mapper or a constructor returns a **newly-allocated** object with `readonly` fields; no two calls share a returned object, and no returned object is retained or reused internally. The sole by-reference exception is `ADAPTER_ERROR.cause`, which intentionally holds the original thrown value by reference (INV-7). No caller can mutate a returned result in a way that affects any other call.

**Applies to:** all five functions.

**Enforcement mechanism:**
- Type system: union field declarations are `readonly`; results are constructed as fresh literals.
- Runtime guard: no module-level cache/singleton exists to alias into results (INV-14, INV-18).
- Test: two calls with equal inputs return objects that are `!==` (distinct identity) yet structurally equal (except `cause` identity); mutating one result never affects a second call's result.

**Violation scenario:** A memoization "optimization" returns the same frozen singleton for `NAME_NOT_FOUND`, a caller mutates `.name` for logging, and a concurrent resolution reads the corrupted name — a cross-request data bleed.

**Severity:** High

### INV-4: Input domain is genuinely `unknown` — no call-site guard required

**Category:** Request/Response

**Statement:** `mapNameResolutionError` accepts any JavaScript value as `error`: an `Error`/`BaseError` subclass, a non-Error object, a rejected primitive (string/number/bigint/symbol), `null`, or `undefined`. Every one maps to a union member (unclassifiable → `ADAPTER_ERROR`) without the call site needing to pre-narrow. `context` is optional; `mapNameResolutionError(error)` with no context is always valid.

**Applies to:** `mapNameResolutionError`.

**Enforcement mechanism:**
- Type system: parameter typed `unknown` (not `Error`); `context?` optional.
- Runtime guard: all field access on `error` is existence-guarded (`typeof`/`in`/optional chaining) before use — see INV-5.
- Test: feed `null`, `undefined`, `42`, `'boom'`, `Symbol('x')`, `{ }`, and a bare `Error` — each returns a valid union member, none throws (except an allowlisted programmer error).

**Violation scenario:** The mapper does `error.message` on a `null` throw without guarding, throws `TypeError`, and the caller's `catch` that was supposed to *produce* a typed result instead propagates an untyped crash — the never-throw contract is broken at the worst moment.

**Severity:** Critical

### INV-5: `ADAPTER_ERROR.message` is always a string, and message extraction never throws

**Category:** Request/Response

**Statement:** When the mapper produces `ADAPTER_ERROR`, `message` is always a non-empty `string`, computed as `error.message` when that is a string, else `String(error)` — and the extraction itself is guarded so that a hostile/broken `toString`/`message` getter cannot throw out of the mapper. If stringification would throw or yield empty, a stable fallback literal (e.g. `'unknown error'`) is used.

**Applies to:** `mapNameResolutionError` (`ADAPTER_ERROR` and any free-text extraction for `EXTERNAL_GATEWAY_ERROR.detail`/`UNSUPPORTED_NAME.reason`).

**Enforcement mechanism:**
- Type system: `ADAPTER_ERROR.message: string` (required).
- Runtime guard: a small `safeMessage(unknown): string` helper wraps property access and `String()` in a `try`/`catch`, returning the fallback literal on any throw; `typeof` checks precede use.
- Test: feed an object whose `get message()` throws, and one whose `toString()` throws — assert `ADAPTER_ERROR.message` is the fallback string and the mapper did not throw.

**Violation scenario:** `String(error)` is invoked on an object with a throwing `toString`; the mapper throws mid-classification, defeating totality (INV-6) for an input that should have been a clean `ADAPTER_ERROR`.

**Severity:** High

## Error Semantics

### INV-6: Totality with a single closed carve-out

**Category:** Error Semantics

**Statement:** For every input, `mapNameResolutionError` has exactly one of two outcomes: (a) it **returns** a member of the closed union, or (b) it **re-throws** a member of the programmer-error allowlist (INV-9). There is no third outcome — it never returns a non-union value (INV-1), and it never throws any error that is not an allowlist member (INV-4, INV-5 guard the accidental-throw paths). This is the type-level realization of UIKit INV-8 ("expected failures return `ok:false` and never throw; only genuine programmer errors MAY throw").

**Applies to:** `mapNameResolutionError`. (Constructors never throw at all — they are pure literal construction, INV-2.)

**Enforcement mechanism:**
- Type system: `@throws {RuntimeDisposedError}` documented; return type is the closed union.
- Runtime guard: allowlist re-throw is the *only* `throw` statement in the module; every other path returns; field access is guarded (INV-4/INV-5) so no incidental throw escapes.
- Test: property-style sweep over a large native-error corpus asserting each input either returns a union member or throws *only* an allowlist member; assert the module contains no unguarded `throw`.

**Violation scenario:** An unclassified error whose `.message` getter throws slips past the guard and propagates; a caller relying on "the mapper never throws for a transport failure" leaks an untyped exception to the UIKit, which had no `catch` there because the contract said it was unnecessary.

**Severity:** Critical

### INV-7: `ADAPTER_ERROR` is the total fallback and preserves the cause by reference

**Category:** Error Semantics

**Statement:** Any caught error not matched by classification rows 0–5 maps to `ADAPTER_ERROR`, and `ADAPTER_ERROR.cause` holds the **original thrown value by reference identity** (`result.cause === error`). The original is never dropped, re-wrapped, or shallow-copied; the sole normalization applied to the *displayable* `message` is INV-5/INV-16, which never touches `cause`.

**Applies to:** `mapNameResolutionError` (row 6).

**Enforcement mechanism:**
- Type system: `ADAPTER_ERROR.cause?: unknown`.
- Runtime guard: fallback branch assigns `cause: error` directly.
- Test: pass a sentinel object, assert `result.cause === thatSameObject` (identity, not deep-equal).

**Violation scenario:** The fallback stores `cause: String(error)` instead of the object; an on-call engineer loses the stack trace and nested `.cause` chain needed to diagnose an unclassified viem failure.

**Severity:** High

### INV-8: Deterministic classification precedence — a fixed total order, first match wins

**Category:** Error Semantics

**Statement:** Classification evaluates a fixed precedence order — row 0 (programmer-error re-throw) → row 1 (`viaGateway` + timeout/gateway → `EXTERNAL_GATEWAY_ERROR`) → row 2 (bare timeout → `RESOLUTION_TIMEOUT`) → row 3 (offchain/HTTP gateway errors → `EXTERNAL_GATEWAY_ERROR`) → row 4 (chain-config errors → `UNSUPPORTED_NETWORK`) → row 5 (UTS-46 normalize throw → `UNSUPPORTED_NAME`) → row 6 (`ADAPTER_ERROR`). The first matching row wins; the order is total and stable, so any given native-error shape (plus context) always classifies to the same code.

**Applies to:** `mapNameResolutionError`.

**Enforcement mechanism:**
- Type system: n/a (ordering is control flow).
- Runtime guard: single ordered `if/else if` (or ordered predicate table) with `.walk()` traversal; no unordered `switch` on a set that could double-match.
- Test: construct an error that satisfies two rows' predicates (e.g. a gateway `TimeoutError` with `viaGateway: true`) and assert the higher-precedence code (row 1) wins; snapshot the full row→code table.

**Violation scenario:** Rows are reordered so a plain `TimeoutError` is checked before the `viaGateway` branch; a CCIP-Read gateway timeout is reported as `RESOLUTION_TIMEOUT`, and SF-5's "gateway unreachable vs name-not-found" distinction (spec Edge Cases) collapses.

**Severity:** High

### INV-9: Programmer-error carve-out is a closed explicit allowlist, checked first

**Category:** Error Semantics

**Statement:** The mapper re-throws (never classifies) exactly the errors whose class is a member of a named allowlist constant — **currently exactly `{ RuntimeDisposedError }`** — detected `instanceof`-primary with a `.name`-needle fallback, evaluated at row 0 before any classification. Every non-member — including `TypeError`, `RangeError`, `ReferenceError`, and any un-designated class — is classified into the union (unmatched → `ADAPTER_ERROR`), never re-thrown. Membership is by class identity, not by a structural "looks like a bug" heuristic. (Full rationale: **Resolved Open Questions RQ-3**.)

**Applies to:** `mapNameResolutionError` (row 0).

**Enforcement mechanism:**
- Type system: allowlist is a named `readonly` constant; `@throws` documents the re-throw set.
- Runtime guard: row-0 predicate tests allowlist membership only; the check precedes all classification and uses the same `.walk()` + `instanceof`/needle idiom as classification.
- Test: (a) a `RuntimeDisposedError` (and one nested inside a wrapper chain) re-throws unchanged; (b) a `TypeError`, `RangeError`, and a bare `Error` each map to `ADAPTER_ERROR` with `cause` preserved and do **not** throw.

**Violation scenario:** The check is broadened to "re-throw any `TypeError`," and a viem `TypeError` raised while parsing a malformed gateway response — an *expected* transport failure — is re-thrown; the UIKit's resolution path, told expected failures never throw, crashes instead of showing `EXTERNAL_GATEWAY_ERROR`.

**Severity:** Critical

### INV-10: Timeout-vs-gateway precedence — `viaGateway` dominates

**Category:** Error Semantics

**Statement:** When a caught error classifies as a transport timeout/failure **and** `ctx.viaGateway === true`, the mapped code is `EXTERNAL_GATEWAY_ERROR`, never `RESOLUTION_TIMEOUT` (row 1 precedes row 2). When the same class of timeout is caught with `ctx.viaGateway` falsy/absent, the mapped code is `RESOLUTION_TIMEOUT`. The gateway flag is the sole discriminator for this otherwise-ambiguous case, and the outcome is deterministic. (Full rationale: **Resolved Open Questions RQ-1**.)

**Applies to:** `mapNameResolutionError`.

**Enforcement mechanism:**
- Type system: `ctx.viaGateway?: boolean`.
- Runtime guard: row 1 (`viaGateway && isTimeoutOrGatewayFailure`) is evaluated before row 2 (bare timeout).
- Test: same underlying `TimeoutError` mapped twice — once with `{ viaGateway: true }` → `EXTERNAL_GATEWAY_ERROR`, once without → `RESOLUTION_TIMEOUT`.

**Violation scenario:** A v2 CCIP-Read gateway that times out is reported as `RESOLUTION_TIMEOUT`; the UIKit treats it as a generic transient timeout and silently retries against a stale v1 path, exactly the "silent fallback" the spec forbids (SF-5 scenario 2, spec Edge Cases).

**Severity:** High

### INV-11: Gateway failures are never conflated with not-found

**Category:** Error Semantics

**Statement:** A classified gateway/offchain failure (rows 1, 3) always maps to `EXTERNAL_GATEWAY_ERROR` and is **never** mapped to `NAME_NOT_FOUND` or `ADDRESS_NOT_FOUND`. A structurally-successful "no record" outcome is not a thrown error at all (viem returns `null`) and is produced only by the `nameNotFound`/`addressNotFound` constructors on the caller's control path — the mapper never fabricates a not-found from a caught error.

**Applies to:** `mapNameResolutionError` (must not emit not-found), `nameNotFound`/`addressNotFound` (sole not-found source).

**Enforcement mechanism:**
- Type system: the mapper's classification table has no `NAME_NOT_FOUND`/`ADDRESS_NOT_FOUND` rows.
- Runtime guard: not-found is unreachable from any classification branch.
- Test: feed gateway/offchain/HTTP errors and assert the code is `EXTERNAL_GATEWAY_ERROR`, never a not-found; assert the mapper source contains no not-found construction.

**Violation scenario:** A gateway 500 is mapped to `NAME_NOT_FOUND`; the UIKit tells the user "no such name" for a name that exists but whose gateway was down — a misleading, potentially fund-directing error message.

**Severity:** High

### INV-12: `RESOLUTION_TIMEOUT.elapsedMs` is always a finite number; `-1` sentinel when unmeasured

**Category:** Error Semantics

**Statement:** Whenever the mapper constructs `RESOLUTION_TIMEOUT`, `elapsedMs` is a finite `number`: `ctx.elapsedMs` when it is a finite value `≥ 0`, otherwise the sentinel `-1`. The mapper never emits `undefined`, `NaN`, `Infinity`, or a negative-other-than-`-1` `elapsedMs`. The `-1` sentinel denotes "not measured," distinguishable from a genuine `0`. Callers on any timeout-capable path are obligated to supply a real `ctx.elapsedMs` (cross-SF obligation, see Dev Notes); the sentinel is a totality guard, not a substitute. (Full rationale: **Resolved Open Questions RQ-2**.)

**Applies to:** `mapNameResolutionError` (row 2); consumed by SF-2/SF-3/SF-5 callers.

**Enforcement mechanism:**
- Type system: `RESOLUTION_TIMEOUT.elapsedMs: number` (required).
- Runtime guard: `Number.isFinite(ctx?.elapsedMs) && ctx.elapsedMs >= 0 ? ctx.elapsedMs : -1`.
- Test: classify a timeout with `elapsedMs: 1234` → `1234`; with `elapsedMs` absent → `-1`; with `elapsedMs: NaN`/`-5`/`Infinity` → `-1`.

**Violation scenario:** The mapper emits `elapsedMs: undefined` when the caller forgot to measure; a UIKit component that formats `elapsedMs` renders `"NaNms"` or throws on `.toFixed()`, turning a clean timeout into a UI crash.

**Severity:** Medium

## Idempotency & Retry

### INV-13: Referential transparency — deterministic, side-effect-free classification

**Category:** Idempotency & Retry

**Statement:** For identical `(error, context)` inputs, `mapNameResolutionError` returns a **structurally-equal** result on every call — modulo `ADAPTER_ERROR.cause`, which is the same object by reference. Constructors are likewise deterministic. The functions read no clock, no random source, and no mutable global/module state, so re-invocation across time, processes, or interleaved calls converges to the same structural result. This purity is precisely what lets SF-4's conformance harness treat the never-throw contract as deterministic and apply its deep-equal-under-cache-TTL check.

**Applies to:** all five functions.

**Enforcement mechanism:**
- Type system: n/a.
- Runtime guard: module holds no state (INV-14, INV-18); no `Date.now()`/`Math.random()`/counter.
- Test: call each function twice with equal inputs; assert deep structural equality (with `cause` compared by identity); grep the module for clock/RNG/mutable-module-state usage and assert none.

**Violation scenario:** The mapper stamps `ADAPTER_ERROR.message` with `Date.now()`; two identical inputs produce different results; SF-4's determinism family fails the EVM adapter even though resolution is correct.

**Severity:** High

## Auth Boundary

**Not applicable.** SF-1 is a pure leaf utility with no request surface, no caller identity, no privileged operation, and no access to a transport or credential — there is nothing to authorize. The auth boundary for name resolution lives entirely in the SF-2 capability and its host runtime. Recorded explicitly rather than omitted, per the coverage discipline.

## Side-Effect Ordering & Observability

### INV-14: Zero side effects; the caught error is never mutated

**Category:** Side-Effect Ordering & Observability

**Statement:** Neither the mapper nor any constructor performs I/O (network, disk, KV), reads a clock, logs, emits an event/metric, or mutates any input. In particular the caught `error` object is treated read-only: its fields are read for classification and its identity is preserved on `ADAPTER_ERROR.cause`, but no property of `error` (including `error.cause`, `error.message`) is written, deleted, or reordered. A caller that inspects or logs the original error after mapping observes it unchanged.

**Applies to:** all five functions.

**Enforcement mechanism:**
- Type system: `error: unknown` accessed via read-only patterns (`in`, optional chaining, `instanceof`); no assignment to `error.*`.
- Runtime guard: no logger/clock/transport is imported or injected (INV-18); `.walk()` traversal is read-only.
- Test: pass a deeply-frozen error object; assert the mapper does not throw (no write attempt) and the object is byte-for-byte unchanged after mapping; assert no logger/network is invoked (spy assertions).

**Violation scenario:** The mapper sets `error.handled = true` for bookkeeping; a frozen error throws on write (breaking totality), or a shared error object is corrupted for a concurrent handler.

**Severity:** High

### INV-15: Bounded cause-chain traversal — terminates on cyclic or deep chains

**Category:** Side-Effect Ordering & Observability

**Statement:** Classification's traversal of the error/`cause` chain (via viem `.walk()` and any manual `.cause` following) is bounded: it terminates on a cyclic `cause` chain (`a.cause === b`, `b.cause === a`) and on an adversarially deep chain, via a visited-set or a fixed depth cap. The mapper never infinite-loops, never blows the stack, and performs at most O(bounded) work per call regardless of input error shape.

**Applies to:** `mapNameResolutionError` (row-0 re-throw detection and rows 1–5 classification, both of which walk).

**Enforcement mechanism:**
- Type system: n/a.
- Runtime guard: rely on viem `BaseError.walk` (which walks its own bounded `.cause`); for any manual traversal, guard with a visited `Set` or a depth cap constant.
- Test: build a cyclic `cause` chain and a 10⁴-deep chain; assert the mapper returns a union member in bounded time and does not throw `RangeError: Maximum call stack`.

**Violation scenario:** A native error with a self-referential `cause` (constructed by a buggy wrapper) sends a naive recursive walk into an infinite loop; the resolution call hangs, and the caller's timeout — meant for the network — never fires because the CPU is spinning.

**Severity:** Medium

## Resource Limits & Rate

*(Covered structurally by INV-15 — bounded traversal and no unbounded allocation — and INV-18. SF-1 has no rate surface: it is a synchronous pure function invoked on the caller's cold error path, with no queue, connection pool, or admission control of its own. No additional rate invariant applies.)*

## Sensitive Data Handling

### INV-16: Credential redaction in consumer-renderable free-text fields

**Category:** Sensitive Data Handling

**Statement:** Any free-text field the mapper populates from a **raw native error message** — `ADAPTER_ERROR.message` and `EXTERNAL_GATEWAY_ERROR.detail` — is passed through a minimal redaction that strips credential-bearing substrings before it is placed on the returned variant: URL userinfo (`https://user:pass@host` → credentials removed) and known API-key-in-path/query patterns (viem/RPC errors frequently embed the provider URL, and provider URLs routinely carry an Alchemy/Infura-style key in the path or a query param). The **full, unredacted** original is retained **only** on `ADAPTER_ERROR.cause` (opaque, INV-17), never on a renderable string field. `UNSUPPORTED_NAME.reason` and any caller-curated `detail` are assumed already log-safe (caller-supplied) but pass through the same redaction defensively.

> **Deviation / strengthening from Design.** The Design describes `detail`/`message` as "log-safe free text" but derives `ADAPTER_ERROR.message` directly from `error.message` with no redaction, and viem error messages can embed a keyed RPC/gateway URL. This invariant *adds* an explicit redaction obligation to close a credential-leak channel. It is a **local fix** (a `redactSecrets(string): string` helper inside SF-1), not a design step-back. Flagged for dev confirmation of the redaction pattern set — see Open Questions.

**Applies to:** `mapNameResolutionError` (`ADAPTER_ERROR.message`, `EXTERNAL_GATEWAY_ERROR.detail`); defensively `unsupportedName.reason`.

**Enforcement mechanism:**
- Type system: n/a (value-level content).
- Runtime guard: `redactSecrets` applied to every string that flows from a native message into a returned field; applied *before* construction, *not* to `cause`.
- Test: map a viem error whose message is `HTTP request failed: https://eth-mainnet.g.alchemy.com/v2/SECRETKEY123 …`; assert `SECRETKEY123` does not appear in `ADAPTER_ERROR.message`/`EXTERNAL_GATEWAY_ERROR.detail`; assert the full URL *is* recoverable from `cause`.

**Violation scenario:** An RPC failure message carrying `…/v2/<alchemy-key>` is placed verbatim into `ADAPTER_ERROR.message`; the UIKit logs the typed error at info level, or renders it in a toast, and the provider API key leaks into logs / the user's screen / a bug report.

**Severity:** High

### INV-17: `cause` is opaque — never narrowed, never the default-rendered field

**Category:** Sensitive Data Handling

**Statement:** `ADAPTER_ERROR.cause` is typed and treated as `unknown`: SF-1 never narrows it, parses it, or copies fields out of it into other variants, and it is the *only* field carrying the unredacted native value (INV-16). It is a diagnostic/privileged channel, not a consumer-render channel; SF-1's contract (and the downstream UIKit contract) is that chain-agnostic consumers must not narrow or display `cause` by default.

**Applies to:** `mapNameResolutionError` (`ADAPTER_ERROR`).

**Enforcement mechanism:**
- Type system: `cause?: unknown` — no narrower type exported; consumers cannot narrow without an explicit unsafe cast.
- Runtime guard: `cause` assigned by reference and otherwise untouched.
- Test: assert `cause` is set only on `ADAPTER_ERROR`; assert no other variant carries the native object; type-level assert `cause` is `unknown`.

**Violation scenario:** SF-1 exports a `ResolutionError & { cause: BaseError }` narrowing helper; a consumer starts reading `cause.url` for display, re-introducing the leak INV-16 closed and coupling the UIKit to viem internals.

**Severity:** Medium

## Performance, Scalability & Re-usability

### INV-18: Pure, dependency-free leaf — embeddable with zero code changes

**Category:** Performance, Scalability & Re-usability

**Statement:** SF-1 depends on the `NameResolutionError` **union at the type level only** (`import type` from `@openzeppelin/ui-types`, erased at compile time — zero runtime coupling to the not-yet-stable UIKit type shape). The **one** permitted runtime import from `@openzeppelin/ui-types` is the `RuntimeDisposedError` **class**, which INV-9 requires as a value for its `instanceof`-primary re-throw check; this adds **no new package coupling** (`@openzeppelin/ui-types` is already a runtime dependency of `adapter-evm-core` via `erc4626/error-mapping.ts` and of `adapter-runtime-utils` via `runtime-capability.ts`, and `RuntimeDisposedError` is a stable, already-shipped lifecycle class). Beyond that, SF-1 injects and imports **no** host dependencies (logger, clock, KV, transport, metrics), holds no singleton, and hardcodes no app/RI/network reference. Any consumer — the SF-2/SF-3/SF-5 resolution paths, the SF-4 conformance harness, or a future non-EVM adapter — imports the mapper and constructors by package name and uses them with no configuration. Work per call is O(1) construction plus O(bounded) classification (INV-15), synchronous, on the cold error path; the module imposes no throughput ceiling of its own.

**Applies to:** all five functions and the module surface.

**Enforcement mechanism:**
- Type system: the only `@openzeppelin/ui-types` imports are the `import type` of the `NameResolutionError` union and the runtime `RuntimeDisposedError` class INV-9 requires; no other runtime import (no logger/clock/transport require emitted).
- Runtime guard: no constructor parameters for deps; no module-level mutable state or singleton.
- Test: import the mapper in a bare test with no host wiring and exercise it; assert the compiled output has no runtime dependency on `@openzeppelin/ui-types`; grep for injected-dependency parameters and assert none.

**Violation scenario:** Someone adds a module-level `logger` import "for convenience"; SF-4's conformance harness (which imports SF-1 in isolation) now drags in an app logger it can't satisfy, and the mapper is no longer embeddable in a non-EVM adapter without that logger.

**Severity:** Medium

## Existing Invariants (Extension Mode)

SF-1 adds a new `src/name-resolution/` directory and one re-export line in `src/index.ts`; it modifies no existing behavior. The relevant existing invariants it must **preserve**:

### Preserved
- **`erc4626/error-mapping.ts` and `shared/revert-info.ts` are untouched.** SF-1 *reuses* their idioms (`BaseError.walk(predicate)`, the `includesAny`/`searchText` needle helper) but imports/mirrors rather than modifies them. Their existing mapping behavior is unchanged. (Design "Unchanged".)
- **`src/index.ts` public surface is additive-only.** The one added re-export of the `name-resolution` barrel introduces new names; it renames/removes nothing. No existing import path changes. (Design "API compatibility: fully additive.")
- **Non-EVM adapters (`adapter-solana`, `adapter-midnight`, `adapter-polkadot`, `adapter-stellar`) continue to type-check, build, and pass tests unchanged** — SF-1 adds a leaf utility to `adapter-evm-core` only and touches no shared runtime map (spec SC-006).
- **`@openzeppelin/adapter-runtime-utils` is not modified by SF-1** — the SF-4 conformance harness will *consume* SF-1's exports later; SF-1 adds nothing there. (Design "Unchanged".)

### Modified
- None. SF-1 introduces new code; it changes no existing invariant.

### New
- INV-1 … INV-18 above.

## Invariant Coverage Matrix

| Function / surface | Invariants | Enforcement |
|--------------------|-----------|-------------|
| `mapNameResolutionError()` | INV-1, INV-4, INV-5, INV-6, INV-7, INV-8, INV-9, INV-10, INV-11, INV-12, INV-13, INV-14, INV-15, INV-16, INV-17, INV-18 | Req/Res + Err + Idem + Order/Obs + SensitiveData + Perf/Reuse |
| `nameNotFound()` | INV-1, INV-2, INV-3, INV-11, INV-13, INV-14, INV-18 | Req/Res + Err + Idem + Perf/Reuse |
| `addressNotFound()` | INV-1, INV-2, INV-3, INV-11, INV-13, INV-14, INV-18 | Req/Res + Err + Idem + Perf/Reuse |
| `unsupportedName()` | INV-1, INV-2, INV-3, INV-13, INV-14, INV-16, INV-18 | Req/Res + Idem + SensitiveData + Perf/Reuse |
| `unsupportedNetwork()` | INV-1, INV-2, INV-3, INV-13, INV-14, INV-18 | Req/Res + Idem + Perf/Reuse |
| `NameResolutionErrorContext` (type) | INV-10 (`viaGateway`), INV-12 (`elapsedMs`) | Req/Res field contract |

## Out of Scope

- **The `NameResolutionError` union shape and its field set** — owned by UIKit SF-1 (`@openzeppelin/ui-types`); SF-1 maps *into* it and is forbidden from adding/removing fields. This is why RQ-1 resolves against adding `elapsedMs` to `EXTERNAL_GATEWAY_ERROR` (INV-1, Resolved Open Questions RQ-1).
- **The exact `viem`-class → code predicate table** — a required output of SF-2 Research (v1 error shapes) and SF-5 Research (v2/CCIP-Read gateway error shapes) per the spec's "prefer `viem`" directive. Invariants fix the *contract* (closure, totality, precedence, redaction, elapsedMs discipline); the internal predicate membership can be refined by Research without touching any INV here.
- **Avatar-fetch failure mapping** — viem `EnsAvatar*Error` classes are deliberately not a mapper row; an avatar miss degrades to "no avatar" in SF-3, never a top-level `NameResolutionError` (Design "Out of Scope").
- **Observability / telemetry of unclassified errors** — adapter-side (SF-2) via the preserved `cause`; SF-1 emits nothing (INV-14).
- **Auth** — no auth surface exists at this layer (see Auth Boundary section).
- **Enforcing the caller's `elapsedMs`-supply obligation** — SF-1 cannot enforce SF-2/SF-3/SF-5 behavior; INV-12 guarantees a well-formed value regardless, and the obligation is recorded as a cross-SF note (Dev Notes).

## Dev Notes

- **Cross-SF caller obligation (from RQ-2 / INV-12):** SF-2, SF-3, and SF-5 must supply `ctx.elapsedMs` (measured by their own timeout wrapper) on any path where a timeout is possible. The `-1` sentinel is a totality safety net inside the mapper, not a substitute for a real measurement — a `-1` reaching a consumer means a caller forgot to measure. Worth a lint/review check in those SFs' Code Draft stages.
- **Redaction helper (from INV-16):** the `redactSecrets(string): string` helper is small and self-contained; it should live in `src/name-resolution/error-mapping.ts` (or a sibling `redact.ts` in the same dir) and be applied at the single point each free-text field is constructed. Keep the pattern set conservative (URL userinfo + provider-key-in-path/query) to avoid over-scrubbing legitimate diagnostic text.
- **Re-throw allowlist is a named constant (from RQ-3 / INV-9):** implement as `const PROGRAMMER_ERROR_CLASSES = [RuntimeDisposedError] as const` (or a name-set) so growth is an explicit, reviewable edit. Adding a member narrows the never-throw guarantee UIKit INV-8 and SF-4 depend on — treat additions as API-visible.
- **`instanceof` brittleness:** as the Design notes, duplicate-copy/bundled `viem` (or `adapter-runtime-utils`) can defeat `instanceof`; the `.name`-needle fallback backstops both classification (rows 1–5) and the row-0 re-throw check. Tests should simulate a "foreign realm" error (matching `.name`, failing `instanceof`) for both paths.
- **Sync from Code Draft (2026-07-03, dev-approved):** INV-18 clarified — its "type-level only" guarantee scopes to the `NameResolutionError` *union*; the `RuntimeDisposedError` *class* is a permitted runtime import because INV-9's `instanceof`-primary re-throw check needs it as a value, and it adds no new package coupling (`@openzeppelin/ui-types` is already a runtime dep of `adapter-evm-core` and `adapter-runtime-utils`). Resolves the INV-18 ↔ INV-9 wording conflict surfaced during SF-1 Code Draft.

## Open Questions

1. **Redaction pattern scope (INV-16)** — confirm the credential-substring set to strip from `ADAPTER_ERROR.message`/`EXTERNAL_GATEWAY_ERROR.detail`. Proposed minimal set: URL userinfo (`//user:pass@`) and provider-key-in-URL (path segment or query param following a known provider host / `/v2/`, `/v3/`, `?apiKey=`, `?key=` patterns). Should this also cover bearer-token-shaped substrings in arbitrary message text, or stay URL-scoped to avoid over-scrubbing? Defaulting to URL-scoped for Code Draft unless the dev widens it.
2. **`-1` vs `0` timeout sentinel (INV-12)** — resolved to `-1` here (distinguishable from a real `0ms`). If a downstream UIKit formatter cannot tolerate a negative `elapsedMs` and would prefer `0` + an "approximate" flag, that is a UIKit-side concern; flag back if their SF-4/SF-6 formatting can't handle `-1`. No change needed on the adapter side unless they object.

*(All three Design open questions are resolved in the Resolved Open Questions section — RQ-1 → INV-10/INV-16, RQ-2 → INV-12, RQ-3 → INV-9. The two items above are new, narrower follow-ups surfaced during this stage, not carried-over blockers.)*
