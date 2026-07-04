---
stage: code
project: ens-uikit-support
sub_feature: sf-3-reverse-resolution
repo: openzeppelin-adapters
mode: extension
extends: packages/adapter-evm-core/src
status: draft
timestamp: 2026-07-04
author: aleksandr.pasevin
previous_stage: artifacts/001-ens-uikit-support/sf-3-reverse-resolution/03-invariants.md
tags: [ens, name-resolution, reverse-resolution, forward-verification, avatar, viem, getEnsName, getEnsAvatar, capability, evm, adapter, service, code]
---

# SF-3 · Reverse resolution + forward-verification + avatar — Code Draft

## Summary

Implemented the reverse `resolveAddress` (address → name) path as a **new method** on SF-2's existing
`EvmNameResolutionService` (`packages/adapter-evm-core/src/name-resolution/service.ts`), plus a private
`tryGetAvatar` helper — per **Approach A (SUPPRESS-on-mismatch)**. It is a thin wrapper over viem's
`getEnsName({ strict: true })`, whose Universal Resolver forward-verifies internally, so
`forwardVerified` is the **constant literal `true`** on every returned name (INV-3). A forward-mismatch
(`ReverseAddressMismatch`), an empty reverse record (`null`), the three address-scoped resolver reverts,
and a malformed-address input all fold to `ADDRESS_NOT_FOUND` on SF-3's own control path via SF-1's
existing `addressNotFound` constructor; transport / gateway / timeout throws delegate to SF-1's
`mapNameResolutionError`. Avatar (`getEnsAvatar`, viem defaults) is a strictly post-success,
failure/latency-isolated best-effort lookup that can only add or omit `avatarUrl`, never fail the reverse
result. **No new files, no new factory, no SF-1 mapper change** — one method + one private helper + three
new import bindings. The most consequential coding choice carried from Design/Invariants: keeping the
`error instanceof BaseError` gate on the reverse `errorName` read — **symmetric with SF-2's forward path**
— so a cross-realm `ReverseAddressMismatch` folds safely to `ADAPTER_ERROR` (INV-11 still holds; degrades
safely, never surfaces a name). **No deviations from the design.**

## Modules

| Path | Public exports (change) | Purpose |
|------|-------------------------|---------|
| `packages/adapter-evm-core/src/name-resolution/service.ts` | `EvmNameResolutionService.resolveAddress()` (**new public method**); `tryGetAvatar()` (**new private helper**) | Reverse address → name resolution with UR-internal forward-verification (Approach A) + isolated best-effort avatar. `isValidName` / `resolveName` / `dispose()` / `supportsEns()` / the constructor / `createEvmNameResolutionService` are **unchanged**. |

**Unchanged (explicitly), reused as-is:**
- `src/name-resolution/error-mapping.ts` (SF-1) — `addressNotFound` (L206) / `unsupportedNetwork` /
  `mapNameResolutionError` consumed; **no new mapper row, no SF-1 drift**.
- `src/name-resolution/name-validation.ts`, `src/name-resolution/provenance.ts` (SF-2) — `baseEnsProvenance()` reused.
- `src/utils/validation.ts` — `isValidEvmAddress` reused as the sync address-shape gate.
- `src/shared/revert-info.ts` — `extractRevertInfo` + `BaseError` reused for the reverse catch's `errorName` read.
- `src/name-resolution/index.ts` barrel — the service is already re-exported (SF-2).
- `src/capabilities/name-resolution.ts` + `capabilities/index.ts` — the `guardRuntimeCapability` Proxy
  guards *every* method apply, so `resolveAddress` is surfaced automatically; the interface's optional
  `resolveAddress?` is satisfied by the cast the factory already performs. No factory change.
- `packages/adapter-evm/src/profiles/shared.ts` — the `nameResolution` registration slot rides the same
  capability instance + injected client. No registration change.
- Every non-EVM adapter (SC-006).

**New imports added to `service.ts`:** `type Address` (from `viem`), `ResolvedName` (from
`@openzeppelin/ui-types`), `addressNotFound` (from `./error-mapping`), `isValidEvmAddress` (from
`../utils/validation`). `BaseError`, `extractRevertInfo`, `unsupportedNetwork`, `mapNameResolutionError`,
`baseEnsProvenance` were already imported by SF-2.

## Invariant Enforcement Map

| INV-N | Enforced by | Location |
|-------|-------------|----------|
| INV-1 (return-shape closure) | Type system (`Promise<ResolutionResult<ResolvedName>>`) + every branch returns an explicit `{ ok }` literal; `default → mapNameResolutionError` makes it total | `service.ts` `resolveAddress` (signature + all returns) |
| INV-2 (success fidelity — verbatim name, echoed address, no coercion) | `if (name === null)` early-return before success construction; `name`/`address` passed through untransformed | `service.ts` step (5)+(6) |
| INV-3 (`forwardVerified` concrete boolean, constant `true`) | Type system (`forwardVerified: boolean`) + literal `forwardVerified: true` at the single success site; no `false`/`undefined` construction exists | `service.ts` step (6) |
| INV-4 (`avatarUrl` present iff real, key-absent otherwise) | Conditional spread `...(avatarUrl !== undefined ? { avatarUrl } : {})`; `tryGetAvatar` returns `string \| undefined` (`?? undefined`, never `null`) | `service.ts` step (6) + `tryGetAvatar` |
| INV-5 (fixed user-safe `baseEnsProvenance()`, fresh per call, no scope) | `provenance: baseEnsProvenance()` (SF-2 helper, unchanged — fresh `{ label: 'ENS', external: false }`) | `service.ts` step (6) |
| INV-6 (never-throw; sole throw `RuntimeDisposedError`) | One `getEnsName` in `try`; `catch` returns `{ ok: false }` on every arm (Part A `addressNotFound` or `default → mapper`); no `throw`/re-`throw` in body; avatar in its own `try/catch` | `service.ts` `resolveAddress` + `tryGetAvatar` |
| INV-7 (`strict: true` mandatory) | Literal `{ address, strict: true }` at the sole `getEnsName` call site | `service.ts` step (3) |
| INV-8 (`ADDRESS_NOT_FOUND` from null + reverts + malformed) | `!isValidEvmAddress` gate, `name === null` branch, and the four revert `case`s all call `addressNotFound(address)` | `service.ts` steps (2),(4),(5) |
| INV-9 (`ADDRESS_NOT_FOUND` only on control path — SF-1 INV-11 preserved) | The four address-scoped reverts handled in the `switch` **before** `default → mapper`; mapper has no `ADDRESS_NOT_FOUND` row | `service.ts` step (4) |
| INV-10 (total + closed over the seven-code union) | Part-A constructors (`addressNotFound`/`unsupportedNetwork`) + `default → mapNameResolutionError` (total, codomain-closed per SF-1 INV-1/6) | `service.ts` steps (1),(2),(4),(5) |
| INV-11 (suppress-on-mismatch — never surface a mismatched name) | `ReverseAddressMismatch` `case` returns `addressNotFound(address)` before any success construction; no code path reads a name from the revert; no raw reverse-record reader built | `service.ts` step (4) |
| INV-12 (deterministic precedence) | Sequential early-return gates (support → shape → call → `null` → ordered `switch` → `default`); first match wins | `service.ts` steps (1)→(5) |
| INV-13 (stateless / deterministic-under-stable-state) | No mutable field added to the service; results built fresh per call; `readonly` constructor fields unchanged | `service.ts` (class shape — no new state) |
| INV-14 (read-only, retry-safe) | Only `publicClient.getEnsName` + `publicClient.getEnsAvatar` (both reads); no write/submit/persist API imported | `service.ts` steps (3),(6) + `tryGetAvatar` |
| INV-15 (borrowed-client no-dispose) | `dispose()` unchanged (debug-log only; `cleanupStage: 'general'`); reverse/avatar borrow the same injected client, tear down nothing | `service.ts` `dispose` (unchanged) + factory (unchanged) |
| INV-16 (pre-I/O gating) | Support-gate + address-shape gate are early-returns positioned before the `try` holding the sole `getEnsName` call; avatar after success | `service.ts` steps (1),(2) |
| INV-17 (avatar post-success, failure/latency-isolated) | `tryGetAvatar` called only after the success determination, outside the reverse `try`; wraps both viem hops in `try { … } catch { return undefined }`; result spread conditionally | `service.ts` step (6) + `tryGetAvatar` |
| INV-18 (bounded work; `elapsedMs` around reverse call only) | `const started = performance.now()` immediately before `getEnsName`; `elapsedMs: performance.now() - started` in `default` ctx; no retry loop; avatar is one `await` outside the window | `service.ts` step (3)+(4) + `tryGetAvatar` |
| INV-19 (no credential-leak channel; avatar untrusted, passed verbatim, never logged) | Control-path errors carry only the echoed input `address` / `networkId` / fixed `'ENS'` label; native-message extraction+redaction live in SF-1's mapper; `tryGetAvatar` catch logs nothing | `service.ts` steps (2),(4) + `tryGetAvatar` |
| INV-20 (DI seam — one injected client, no hardcoded host) | Same borrowed `publicClient` backs `getEnsName` + `getEnsAvatar`; no client constructed internally; viem defaults, no hardcoded gateway/asset host; UIKit types `import type` only | `service.ts` (constructor unchanged) + `tryGetAvatar` |

All 20 runtime invariants have an in-code guard/annotation. Auth is `n/a` (public read primitive — see
Invariants § Auth Boundary); the only lifecycle gate (use-after-dispose → `RuntimeDisposedError`) is
enforced upstream by the factory's guard proxy, unchanged.

## Implementation Notes

- **`address as Address` boundary cast.** viem's `getEnsName` requires the branded `Address` type; the
  input is `string`, validated by `isValidEvmAddress(address)` at gate (2) immediately prior, so the cast
  is safe and is the standard viem boundary pattern. No `!` non-null assertions anywhere; no `any`.
- **Cross-realm precision — kept the `instanceof BaseError` gate (Invariants Open Q3 / Design divergence
  resolved by the dev).** The reverse `errorName` read is gated on `error instanceof BaseError`, exactly
  as SF-2's forward path. A foreign-realm viem that defeats `instanceof` yields `errorName === undefined`
  → the `default` arm → mapper → `ADAPTER_ERROR`. This degrades **safely** (INV-11 holds: no name is ever
  surfaced; never a throw), just less precisely (a cross-realm clean-miss is reported as an adapter fault,
  not `ADDRESS_NOT_FOUND`). Chosen for **consistency with SF-2 and KISS**; endorsed by the Orchestrator.
  If a future symmetric change reads `errorName` structurally (dropping the `instanceof` gate) for the
  forward path, do the same here in lockstep — it is not an invariant change.
- **`getEnsAvatar` uses `strict: true`** for posture-consistency with the reverse call; per Design Dev
  Notes this is immaterial to the observable result (`tryGetAvatar` swallows every outcome to `undefined`
  — a `null` under `strict: false` and a throw under `strict: true` both normalize to `undefined`).
- **viem@2.44.4 pinning.** Added a version-tying comment on `resolveAddress`: a viem major bump requires
  re-validating `ReverseAddressMismatch`'s membership in `isNullUniversalResolverError` and the UR revert
  `errorName` strings — mirroring the forward table and SF-1's mapper.
- **`performance.now()`** times only the single `getEnsName` call (SF-1 INV-12 caller obligation); the
  avatar hops are deliberately outside the window (INV-18).

## Verification

- `pnpm exec tsc --noEmit` on `adapter-evm-core` — **clean** (against the real
  `@openzeppelin/ui-types@3.1.1` dev:local link; `ResolvedName` shape confirmed: `address`/`name`/
  `forwardVerified: boolean`/`avatarUrl?: string`/`provenance`; `resolveAddress?` is optional).
- `pnpm exec tsc --noEmit` on `adapter-evm` (consuming runtime, registration slot) — **clean**.
- `pnpm exec eslint src/name-resolution/service.ts` — **clean**.
- `pnpm build` on `adapter-evm-core` — **complete** (the one `RuntimeCleanupStage` `MISSING_EXPORT`
  `.d.ts` warning is pre-existing in `capabilities/helpers.d.ts`, not touched by this diff).
- `vitest run src/name-resolution` — **195/195 pass** across 6 files (SF-1 + SF-2 suites); zero
  regressions. No SF-3 tests yet — those are Dev3 05 Tests' stage.

## Out of Scope

- **SF-3 tests** — Dev3 05 Tests. This stage adds no test files; the Design/Invariants Open Qs to pin at
  Tests (Q1 `UnsupportedResolverProfile` → `ADDRESS_NOT_FOUND` on a fork; Q2 `ReverseAddressMismatch`
  suppress-path fixture; the INV-13 avatar-vs-determinism caveat) are carried forward, not implemented here.
- **Surfacing a forward-mismatched name with `forwardVerified: false`** — deliberately not built (Approach
  A / INV-11); mismatch folds to `ADDRESS_NOT_FOUND`, anti-spoofing preserved at the UIKit SF-4 display.
- **Chain-scoped reverse / non-60 `coinType` / ENSIP-19 chain-scoped primary names / `scopedToNetworkId`
  / `EnsProvenance` / `isEnsProvenance` / `viaGateway: true`** — SF-5. `coinType` stays 60n; `resolveAddress`
  emits `baseEnsProvenance()` (`external: false`, no scope).
- **Raw reverse-record read / `name(bytes32)` ABI / own forward-verify (`resolveName` re-call) /
  `reverse-record.ts`** — Research Approaches B/C only; the UR verifies internally, so not built.
- **Avatar image fetching / caching / rendering / SSRF & mixed-content hardening / avatar-URL validation /
  per-avatar deadline** — UIKit (consumer) / possible SF-5 hardening. SF-3 returns the verbatim
  `avatarUrl` `getEnsAvatar` produced (INV-19).
- **The `NameResolutionError` union / `ResolvedName` value type / the mapper internals** — owned upstream
  (UIKit SF-1 / SF-1); imported and consumed, never modified.
- **The conformance harness** — SF-4.

## Dev Notes

- **No upstream sync needed.** The implementation matches `02-design.md` and `03-invariants.md` exactly
  (method name, signature, algorithm steps, precedence, class→code table). No design type was loosened, no
  signature adjusted, no INV was missing — nothing to propose back to Design/Invariants.
- **No SF-1 drift.** `addressNotFound` already existed (`error-mapping.ts` L206); the reverse path adds no
  mapper row. SF-1 INV-11 (mapper never fabricates a not-found) is preserved by keeping all
  `ADDRESS_NOT_FOUND` production on SF-3's control path (INV-9).
- **Additive, non-EVM untouched (SC-006).** `resolveAddress` lands on an already-optional interface method
  (`resolveAddress?`); the guard proxy surfaces it without a factory/registration change; non-EVM adapters
  omit the `nameResolution` slot and are unaffected. Verified via the green `adapter-evm` typecheck.
- **Cross-repo HOLD unchanged.** Built against the materialized `@openzeppelin/ui-types@3.1.1` dev:local
  link; no UIKit-owned type redefined locally.

## Open Questions

*(All are Tests-stage concerns; none block this artifact.)*

1. **`UnsupportedResolverProfile` on the reverse path (Design Q1 / Invariants Dev Note).** Coded as
   `ADDRESS_NOT_FOUND` (no usable reverse record). Tests should pin this against a mainnet-fork address
   whose reverse resolver lacks `name()`; if a case argues for `ADAPTER_ERROR`, revisit that one `case`.
2. **`ReverseAddressMismatch` suppress-path fixture (Design Q2 / Invariants Dev Note).** INV-11's
   suppress path needs a real viem `ContractFunctionRevertedError` `ReverseAddressMismatch` fixture (fork
   or hand-built) asserting `ADDRESS_NOT_FOUND` — not a throw, not a surfaced name.
3. **Cross-realm `ReverseAddressMismatch` precision (Invariants Q3).** As coded, a mismatch revert that
   defeats `instanceof BaseError` folds to `ADAPTER_ERROR` (safe per INV-11, imprecise). Tests should
   assert this *actual* behavior. A structural `errorName` read (no `instanceof` gate) is a possible future
   fix — to be done in lockstep with the symmetric SF-2 forward-path decision, not unilaterally here.
