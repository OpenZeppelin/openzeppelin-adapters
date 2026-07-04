---
stage: tests
project: ens-uikit-support
sub_feature: sf-3-reverse-resolution
repo: openzeppelin-adapters
mode: extension
extends: packages/adapter-evm-core/src
status: draft
timestamp: 2026-07-04
author: aleksandr.pasevin
previous_stage: artifacts/001-ens-uikit-support/sf-3-reverse-resolution/04-code-draft.md
tags: [ens, name-resolution, reverse-resolution, forward-verification, avatar, viem, getEnsName, getEnsAvatar, tests, vitest, capability, evm, adapter, service]
---

# SF-3 · Reverse resolution + forward-verification + avatar — Test Suite

## Summary

Invariant-driven `vitest` suite for `EvmNameResolutionService.resolveAddress` (+ the private
`tryGetAvatar`) — 81 tests in `src/name-resolution/__tests__/service.reverse.test.ts`, organized by
invariant category and mirroring the SF-2 `service.test.ts` conventions (shared `fixtures.ts`, the
`expectError`/`expectValue` narrowers, table-driven fault injection, `it.each` failure sweeps). All 20
runtime invariants (INV-1..INV-20) are covered; Auth / rate / interleaving / load are `n/a` for a
public, stateless read primitive and recorded in Out of Scope, not stubbed. The anti-spoofing crux is
pinned three ways: `forwardVerified === true` on every returned name (INV-3, plus a source-grep guard
against a future `forwardVerified: false`), suppress-on-mismatch (INV-11, `ReverseAddressMismatch` →
`ADDRESS_NOT_FOUND` with the name surfaced *nowhere*), and avatar isolation (INV-17, a throwing / slow /
null avatar never changes the reverse result or its error surface). The three carried Open Qs are
resolved as tests (Q1, Q2, Q3 below). No source was modified; no code bug found; the SF-1+SF-2
name-resolution regression suite (195 tests) is intact (name-resolution suite = 276 = 195 + 81).

## Test Plan

| Test group (describe) | Invariant | Technique | What it verifies |
|-----------------------|-----------|-----------|------------------|
| return-shape closure | INV-1 | entry-point integration | Sweep of 8 outcome classes — each resolves to a discriminated `{ ok }`; never `undefined`/`null` |
| success-value fidelity | INV-2 | integration | `name` verbatim non-null; `address` echoed untransformed (no re-checksum); `null` → `ADDRESS_NOT_FOUND` |
| `forwardVerified` constant-true | INV-3 | integration + source-introspection | `=== true` & `typeof boolean` (with & without avatar); source has no `forwardVerified:false`/`:undefined` |
| avatar optionality | INV-4 | integration + fault-injection | present iff real URL; key-absent on `null`/throw; never `null`; full-shape deep-equal |
| reverse provenance | INV-5 | integration | deep-equals `{label:'ENS',external:false}`; no `scopedToNetworkId`; user-safe label; fresh per call |
| never-throw | INV-6 | fault-injection | 11 expected-failure classes resolve; avatar throw resolves; disposed proxy throws `RuntimeDisposedError`; mapper re-throws `RuntimeDisposedError` |
| `strict:true` | INV-7 | spy | `getEnsName` called with `{ address, strict:true }` |
| ADDRESS_NOT_FOUND sources | INV-8 | fault-injection | `null` + 4 reverts + 5 malformed inputs → `ADDRESS_NOT_FOUND`; **Q1** `UnsupportedResolverProfile` pinned |
| not-found only on control path | INV-9 | fault + source | mapper default arm never yields `ADDRESS_NOT_FOUND`/`NAME_NOT_FOUND`; no `ADDRESS_NOT_FOUND` built via the mapper delegation |
| total & closed classification | INV-10 | table-driven | 11-row reverse class→code table; `ADAPTER_ERROR` cause preserved; forward-only codes never appear |
| suppress-on-mismatch | INV-11 | fault + source | **Q2** `ReverseAddressMismatch`→`ADDRESS_NOT_FOUND`, name nowhere; **Q3** cross-realm→`ADAPTER_ERROR`; no name-from-revert reader |
| classification precedence | INV-12 | integration | support-gate beats shape-gate (malformed addr on unsupported net → `UNSUPPORTED_NETWORK`) |
| stateless / deterministic | INV-13 | replay | two calls deep-equal + distinct identity; interleaved calls independent; avatar-flap caveat pinned (core identical, `avatarUrl` differs) |
| read-only / retry-safe | INV-14 | spy | only `getEnsName`/`getEnsAvatar` reads; retry re-reads; no write/submit API touched |
| borrowed-client no-dispose | INV-15 | integration | `dispose()` touches no teardown; client usable for reverse afterward |
| pre-I/O gating | INV-16 | spy | unsupported net + malformed → zero `getEnsName`/`getEnsAvatar`; valid → exactly one `getEnsName` |
| avatar post-success/isolated | INV-17 | fault + ordering + fake-timers | avatar only after success; `name` before `avatar`; broken/slow avatar never fails result; no avatar error mapped |
| bounded work + `elapsedMs` | INV-18 | spy + fault | one reverse round-trip, no retry; one avatar `await`; timeout `elapsedMs` finite ≥0 ≠ sentinel; avatar disjoint from timing window |
| no credential leak | INV-19 | leak-probe + source | keyed URL redacted on field / kept on cause; `ADDRESS_NOT_FOUND` echoes only caller address, no URL; `tryGetAvatar` logs nothing |
| DI seam / portability | INV-20 | portability | runs on a bare hand-rolled `{chain,getEnsName,getEnsAvatar}`, no host wiring |

## Coverage Matrix

| Invariant | Happy Path | Boundary | Failure | Additional |
|-----------|:---------:|:--------:|:-------:|------------|
| INV-1 (return-shape closure) | ✓ | ✓ | ✓ | sweep of all 8 outcome classes |
| INV-2 (success-value fidelity) | ✓ |  | ✓ | verbatim name / echoed address |
| INV-3 (`forwardVerified` constant-true) | ✓ |  |  | source-introspection (no `false`/`undefined`) |
| INV-4 (`avatarUrl` optionality) | ✓ | ✓ | ✓ | key-absence on null/throw |
| INV-5 (reverse provenance) | ✓ |  |  | fresh-per-call identity + label allowlist |
| INV-6 (never-throw) | ✓ |  | ✓ | 11-class sweep + avatar throw + `RuntimeDisposedError` (proxy & mapper) |
| INV-7 (`strict:true`) | ✓ |  |  | options spy |
| INV-8 (`ADDRESS_NOT_FOUND` sources) |  | ✓ | ✓ | **Q1** `UnsupportedResolverProfile`; 5 malformed inputs |
| INV-9 (not-found control-path only) |  |  | ✓ | source-introspection + gateway-not-conflated |
| INV-10 (total & closed) | ✓ |  | ✓ | 11-row table + cause preserved + forward-code exclusion |
| INV-11 (suppress-on-mismatch) |  |  | ✓ | **Q2** fixture + **Q3** cross-realm + source (no name reader) |
| INV-12 (precedence) |  | ✓ | ✓ | support-gate beats shape-gate |
| INV-13 (stateless / deterministic) | ✓ |  |  | replay + interleave + avatar-flap caveat |
| INV-14 (read-only / retry-safe) | ✓ |  |  | write-API-absent spy |
| INV-15 (borrowed-client no-dispose) | ✓ |  |  | client-usable-after-dispose |
| INV-16 (pre-I/O gating) | ✓ | ✓ | ✓ | zero-I/O on both gates |
| INV-17 (avatar isolation) | ✓ | ✓ | ✓ | ordering + 3 broken-avatar shapes + fake-timer slow + no-mapped-error |
| INV-18 (bounded work + `elapsedMs`) | ✓ | ✓ | ✓ | one-call + finite elapsedMs + avatar-disjoint |
| INV-19 (no credential leak) |  |  | ✓ | redaction + caller-only echo + no-avatar-log source check |
| INV-20 (DI seam / portability) | ✓ |  |  | bare-fixture embed |

No empty rows. Auth / Resource-rate-limit / sequence-interleaving-ordering / load+soak techniques are
`n/a` for a public, stateless read primitive (see Out of Scope) and are recorded, not stubbed.

## Test Notes

- **Fixtures extended, not forked.** `fixtures.ts` gained `getEnsName` + `getEnsAvatar` spies on the
  mock `PublicClient` (defaulting to `VITALIK_NAME` / `AVATAR_URL`) and the `VITALIK_NAME` / `AVATAR_URL`
  constants. `makeClient` now returns those spies alongside `getEnsAddress`; SF-1/SF-2 tests destructure
  only what they use, so they are unaffected (confirmed: 195 prior tests still green). The reverse suite
  reuses the SF-2 native-error factories (`makeDecodedRevert`, `makeTimeoutError`, `makeHttpError`,
  `makeChainUnsupportedError`, `foreignRealmError`) verbatim so both directions classify the same
  fixtures the same way.
- **Type-level invariants** (`forwardVerified: boolean` required, `avatarUrl?: string` optional, the
  closed `NameResolutionError` union) are compiler-enforced against the real `@openzeppelin/ui-types@3.1.1`
  dev:local link; `tsc --noEmit` is clean. Runtime tests additionally pin the *values* (`=== true`,
  key-absence) since the CI `tsconfig` excludes `*.test.ts` (SF-1/SF-2 carry-forward — see Open Questions).
- **Source-introspection tests** (INV-3, INV-9, INV-11, INV-19) read `service.ts` from
  `process.cwd()/src/name-resolution/service.ts` (vitest cwd = package root; `import.meta.url` is not a
  `file://` URL under Vite's transform), mirroring the SF-1 `error-mapping.test.ts` helper. These are
  structural guards against future regressions the type system can't catch (a `forwardVerified: false`
  literal, a name extracted from a mismatch revert, a logger call inside `tryGetAvatar`).
- **Fake timers** back the single "slow avatar" test (INV-17): `getEnsAvatar` resolves after 60 s of
  virtual time; `vi.advanceTimersByTimeAsync` drives it, asserting the reverse still succeeds with the
  avatar once it settles — no real wall-clock wait, F.I.R.S.T.-compliant.
- **`elapsedMs`-vs-avatar disjointness (INV-18)** is asserted structurally rather than numerically:
  `elapsedMs` is produced only on the failure/timeout path and the avatar runs only post-success, so the
  two never co-occur — the test asserts `getEnsAvatar` is never called on the timeout path, which is the
  observable form of "avatar hops are outside the reverse timing window."
- **Every failure assertion names the specific mapped `code`** (never a bare `toThrow()`); `expectError`
  throws loudly on an unexpected success (and `expectValue` on an unexpected failure), so a
  mis-classification fails informatively.

## Resolved Open Questions (carried from Invariants / Code Draft)

- **Q1 — `UnsupportedResolverProfile` on the reverse path.** Pinned as `ADDRESS_NOT_FOUND` (a "no usable
  reverse record" outcome, D-R4) — explicitly *not* `UNSUPPORTED_NAME` (a forward-path code) and *not*
  `ADAPTER_ERROR`. Test: `INV-8 › Q1`. No fork needed — a decoded-revert fixture (`makeDecodedRevert`)
  reproduces the classification deterministically; the mainnet-fork variant is deferred to a future
  integration suite (Out of Scope), not required to lock the unit contract.
- **Q2 — `ReverseAddressMismatch` suppress-path fixture.** Pinned via a real viem decoded-revert fixture
  (`makeDecodedRevert('ReverseAddressMismatch')`): folds to `ADDRESS_NOT_FOUND`, is not a throw, and the
  (would-be) mismatched name string appears *nowhere* in the returned value (`JSON.stringify` scan). A
  companion source-introspection test asserts the `ReverseAddressMismatch` `case` returns
  `addressNotFound(address)` and that no `name(bytes32)` raw-record reader exists. Test: `INV-11 › Q2`.
- **Q3 — cross-realm `ReverseAddressMismatch` precision.** Asserted at *actual* behavior: a foreign-realm
  mismatch (matches by `.name`, fails `instanceof BaseError`) falls to the mapper's `ADAPTER_ERROR`
  fallback, not the `ADDRESS_NOT_FOUND` control-path arm. This is the implemented (Code-Draft-endorsed,
  KISS/symmetric-with-SF-2) behavior; it degrades **safely** — INV-11 still holds (no name surfaced,
  never a throw) — just less precisely. Test: `INV-11 › Q3`. Mirrors the SF-2 forward-path divergence
  test; if a future symmetric change reads `errorName` structurally, both tests update in lockstep.

## Verification

- `vitest run src/name-resolution/__tests__/service.reverse.test.ts` — **81/81 pass**.
- `vitest run src/name-resolution` — **276/276 pass** across 7 files (195 SF-1+SF-2 + 81 SF-3); **zero
  regressions** to the SF-1+SF-2 suites.
- `pnpm test` (full package, excludes the indexer-integration e2e) — **958/958 pass** across 39 files.
- `tsc --noEmit -p tsconfig.json` (includes the test file) — **clean (exit 0)**, against the real
  `@openzeppelin/ui-types@3.1.1` dev:local link.
- `eslint src/name-resolution/__tests__/{service.reverse.test.ts,fixtures.ts}` — **clean** (one
  `--fix` pass applied prettier formatting only; no logic change).
- No `as any` / `as unknown as X` on real domain types (the sole `as unknown as PublicClient` casts are
  the centralized fixture cast + the two hand-rolled-client casts SF-2 already uses, house style). Every
  async test awaits its calls; no floating promises. Time-dependent test uses fake timers.

## Out of Scope

- **Real-chain / mainnet-fork integration** (`vitalik.eth` reverse round-trip, a live forward-mismatched
  address, a live `UnsupportedResolverProfile` reverse resolver) — reserved for a future ephemeral-fork
  integration suite; unit tests stub the viem client (fast, deterministic, F.I.R.S.T.). The unit
  fixtures reproduce every classification the fork would exercise.
- **Auth-boundary tests** — `n/a`; SF-3 is a public read primitive with no caller identity / privileged
  operation / credential (Invariants § Auth Boundary). The one lifecycle gate (use-after-dispose) is
  covered as an error-semantics test (INV-6) via the guard proxy, and cross-tenant leakage is covered as
  a sensitive-data test (INV-19, `ADDRESS_NOT_FOUND` echoes only the caller's own address).
- **Rate-limit / quota / backpressure tests** — `n/a`; no rate surface at this layer (stateless read;
  back-pressure is the host transport's concern — INV-18).
- **Sequence-interleaving-ordering tests** — the only ordering guarantee (avatar strictly post-success)
  is covered under INV-17; there is no state-mutation-vs-observable ordering to interleave (INV-14
  read-only), so the deterministic-interleaving technique reduces to the concurrent-independence test
  under INV-13.
- **Load + soak (perf) tests** — separate concern, separate suite; service correctness tests are
  deterministic and fast. Portability (the reusability half of the perf/reuse category) is covered under
  INV-20.
- **SF-4 determinism (deep-equal-under-cache-TTL) enforcement** — the harness is SF-4. This suite pins
  the SF-3 *properties* SF-4 will enforce (INV-13 determinism incl. the avatar caveat, INV-3
  concrete-boolean, INV-6 never-throw, INV-5 label). The avatar-vs-determinism scoping recommendation
  (assert the reverse core unconditionally, `avatarUrl` only under a stable avatar surface) is surfaced
  for SF-4 Design as Open Q1.
- **`@openzeppelin/ui-types` shape tests** — owned by UIKit SF-1; imported, never redefined.

## Dev Notes

- **No source modified, no code bug found.** The implementation matches `03-invariants.md` and
  `04-code-draft.md` exactly; all 20 invariants had a testable guard and each passed on the first green
  run. No local fix, no step-back.
- **No upstream sync needed.** No test-driven change touched `service.ts`, `error-mapping.ts`, or any
  design/invariants prose. `fixtures.ts` was extended additively (new spies + constants); this is a
  test-helper change, not a source change, and required no artifact edit elsewhere.
- **Regression posture.** The SF-1+SF-2 name-resolution suite (195 tests) is byte-for-byte unaffected by
  the `fixtures.ts` extension (verified: 276 = 195 + 81, all green). The one-time `eslint --fix` on the
  new files applied prettier formatting only and touched no already-tracked SF-1/SF-2 file (contrast the
  incidental SF-2-Tests glob-fix note — this run's `--fix` was path-scoped to the two new/edited files).
- **Cross-repo HOLD unchanged.** Ran against the materialized `@openzeppelin/ui-types@3.1.1` dev:local
  link; no UIKit-owned type redefined locally.
- **viem@2.44.4 pinning inherited.** The reverse revert `errorName` fixtures (`ReverseAddressMismatch`,
  `ResolverNotFound`, `ResolverNotContract`, `UnsupportedResolverProfile`, `HttpError`) match the
  version-pinned class→code table; a viem major bump re-validates both this suite and the source table.

## Open Questions

*(All are downstream-stage concerns; none block this artifact. Design Open Q1/Q2/Q3 are resolved above;
the Invariants follow-ups are carried unchanged.)*

1. **Avatar-vs-determinism scoping for SF-4 (INV-13 caveat).** SF-4's deep-equal-under-cache-TTL check
   should assert determinism on the **reverse core** (`address`/`name`/`forwardVerified`/`provenance`)
   unconditionally and treat `avatarUrl` as determinism-checked only under a stable avatar surface. This
   suite demonstrates the caveat concretely (the avatar-flap test): the reverse core is identical across
   a flapping avatar while `avatarUrl` presence differs. Flagged for SF-4 Design.
2. **CI does not typecheck `*.test.ts`** (carried from SF-1/SF-2). The `tsconfig` excludes test files, so
   the type-level assertions here (`ResolvedName` field types, closed-union narrowing) are not
   CI-enforced by default — verified clean out-of-band via `tsc --noEmit`. A Docs/CI follow-up could add
   a test-inclusive typecheck step.
3. **Mainnet-fork integration coverage** for the three revert classifications (Q1/Q2/Q3) — the unit
   suite locks the contract deterministically via decoded-revert fixtures; a fork suite would add
   end-to-end confidence against real UR revert shapes. Deferred to a future integration suite (Out of
   Scope), not a blocker.
