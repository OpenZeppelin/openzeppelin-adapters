---
stage: code-draft
project: ens-uikit-support
sub_feature: sf-2-forward-resolution
repo: openzeppelin-adapters
mode: extension
extends: packages/adapter-evm-core/src
status: draft
timestamp: 2026-07-04
author: aleksandr.pasevin
previous_stage: artifacts/001-ens-uikit-support/sf-2-forward-resolution/03-invariants.md
tags: [ens, name-resolution, forward-resolution, viem, isValidName, capability, evm, adapter, service, code-draft]
---

# SF-2 · Forward resolution + capability scaffold + isValidName — Code Draft

## Summary

Implemented the EVM `NameResolutionCapability` forward path in `@openzeppelin/adapter-evm-core` as a
thin service over viem's `getEnsAddress`, wired into the EVM runtime via `adapter-evm`. Every settled
decision landed verbatim: `strict: true` (fund-safety, INV-7), injected viem `PublicClient` via
`createNameResolution(config, { publicClient })` (D-A), a synchronous Universal-Resolver support-gate →
typed `UNSUPPORTED_NETWORK` before any I/O (D-B), `UnsupportedResolverProfile` → `UNSUPPORTED_NAME`
(D-C), normalize-up-front via the `unsupportedName` constructor (D-D), and borrowed-client no-dispose
ownership (INV-15). Part A (`ResolverNotFound`/`ResolverNotContract` → `NAME_NOT_FOUND`;
`UnsupportedResolverProfile` → `UNSUPPORTED_NAME`) is classified on SF-2's control path; everything
else delegates to SF-1's `mapNameResolutionError` (Part B), preserving SF-1 INV-11.

**Verification:** `tsc --noEmit` green on both `adapter-evm-core` and `adapter-evm` (against the real
`@openzeppelin/ui-types@3.1.1` dev:local link); both packages build; ESLint clean on all SF-2 files;
SF-2 declarations emit cleanly (the only `.d.ts` warning is pre-existing and unrelated — see Watch
Item). A throwaway runtime smoke confirmed the full control path against the built module + the real
SF-1 mapper (results below). Fully additive; a minor release; non-EVM adapters untouched (SC-006).

## Files

### New (`adapter-evm-core`)
- `src/name-resolution/name-validation.ts` — `isValidName`, `normalizeName` (pure, sync, client-free shape gate).
- `src/name-resolution/provenance.ts` — `baseEnsProvenance()` (SF-5 seam).
- `src/name-resolution/service.ts` — `EvmNameResolutionService` + `createEvmNameResolutionService` (the correctness core).
- `src/capabilities/name-resolution.ts` — `createNameResolution` factory + `CreateNameResolutionOptions`.

### New (`adapter-evm`)
- `src/capabilities/name-resolution.ts` — re-export of `createNameResolution` from core (mirrors `erc4626.ts`).

### Modified (`adapter-evm-core`)
- `src/name-resolution/index.ts` — append `name-validation` / `provenance` / `service` exports (SF-1 barrel).
- `src/capabilities/index.ts` — add `createNameResolution` + type export.
- `src/index.ts` — surface `createNameResolution`, `CreateNameResolutionOptions`, the service/helpers,
  **and `createEvmPublicClient`** (see Drift D2).

### Modified (`adapter-evm`)
- `src/capabilities/index.ts` — add `createNameResolution` barrel line.
- `src/profiles/shared.ts` — add the `nameResolution` slot to **both** the eager `capabilityFactories`
  and the lazy `createRuntimeCapabilityFactories`, threading an injected client via the new `ensClient`
  helper (`createEvmPublicClient(resolveRpcUrl(config), config.viemChain)`).

## Invariant → code traceability

Every runtime invariant from `03-invariants.md` has its assertion in code:

| Invariant | Where enforced |
|-----------|----------------|
| INV-1 return-shape closure | `service.ts` — every branch returns an explicit `{ ok }` literal; return type `Promise<ResolutionResult<ResolvedAddress>>`; `default` arm delegates to the total mapper |
| INV-2 success-value fidelity | `service.ts` — `address === null` handled before the success literal; `address` passed through verbatim; `value.name` = original input (verified: `Vitalik.ETH` echoed) |
| INV-3 `isValidName` total/pure/sync | `name-validation.ts` — `try/catch` around `normalize` returns `false`; no I/O |
| INV-4 `isValidName` semantics | `name-validation.ts` — ordered: reject hex → require dot → `normalize` (not a TLD regex) |
| INV-5 `baseEnsProvenance` shape | `provenance.ts` — fresh `{ label:'ENS', external:false }` per call; no `scopedToNetworkId` |
| INV-6 never-throw | `service.ts` — one `try` around the call; `catch` classifies to `{ ok:false }`; no `throw`/re-`throw`; sole throw is the guard proxy's `RuntimeDisposedError` (verified: generic throw did not escape) |
| INV-7 `strict: true` mandatory | `service.ts` — literal `{ name: normalized, strict: true }` (verified: `strict:true` captured) |
| INV-8 `NAME_NOT_FOUND` from both paths | `service.ts` — `null` branch + `ResolverNotFound`/`ResolverNotContract` cases all call `nameNotFound` |
| INV-9 not-found only on SF-2 path | `service.ts` — Part A cases precede `default → mapper`; mapper has no not-found row (SF-1) |
| INV-10 total/closed classification | `service.ts` — Part A constructors + `default → mapNameResolutionError` (codomain-closed, SF-1 INV-1/6) |
| INV-11 `UNSUPPORTED_NAME` (3 sites) | `service.ts` — shape gate, normalize catch (`describeNormalizeFailure`), `UnsupportedResolverProfile` case |
| INV-12 precedence | `service.ts` — sequential early-returns (support → shape → normalize → call) then ordered `switch` |
| INV-13 stateless/deterministic | `service.ts` — only `readonly` injected fields; no cache/memo/mutable state |
| INV-14 read-only/retry-safe | `service.ts` — sole external call is `getEnsAddress` (a read); no write/persist API |
| INV-15 borrowed-client no-dispose | `service.ts` `dispose()` touches no client method; `capabilities/name-resolution.ts` uses `cleanupStage: 'general'`, no client cleanup registered |
| INV-16 pre-I/O gating | `service.ts` — `supportsEns()` + shape/normalize are early-returns before the `try` (verified: `calledRPC:false` for both) |
| INV-17 `dispose()` idempotent/inert | guard proxy's `lifecycle.dispose()` early-returns when disposed; body is a debug log only |
| INV-18 bounded work + `elapsedMs` | `service.ts` — one call, no retry loop; `performance.now()` around the call feeds `ctx.elapsedMs` |
| INV-19 no leak channel | `service.ts` — no `error.message`/`String(error)` on a returned field; reasons are literals/curated; `label` constant (verified: `SECRETKEY` redacted, `cause` retained) |
| INV-20 DI seam | `capabilities/name-resolution.ts` — client + config are the only inlets; no internal `createEvmPublicClient` |
| INV-21 independent `isValidName` | `name-validation.ts` — imports only `viem/ens` `normalize` + `isValidEvmAddress`; no service/client |

Design Open Questions discharged in code: **Q1** (`ResolverNotFound` → `NAME_NOT_FOUND` under the D-B
premise) implemented; **Q3** (dot-requirement) implemented in `isValidName`. Invariants Open Q1 (guard
proxy raises `RuntimeDisposedError` before the body — no in-body check needed) **confirmed** by reading
`adapter-runtime-utils/runtime-capability.ts`: the proxy checks `isDisposed()` before every method apply.

## Runtime smoke (ephemeral — not a committed test; Tests stage owns the suite)

Against the built `dist` + real SF-1 mapper, with a mock `{ chain, getEnsAddress }` client:

- `isValidName`: `vitalik.eth`→`true`; hex/`vitalik`/`''`→`false`.
- success: `ok:true`, `address:'0xABCDEF'` verbatim, `name:'Vitalik.ETH'` (original echoed), `provenance {label:'ENS',external:false}`, client called with `{ name:'vitalik.eth', strict:true }`.
- `getEnsAddress → null`: `NAME_NOT_FOUND`.
- no-UR chain: `UNSUPPORTED_NETWORK`, `networkId:'ethereum-mainnet'`, **RPC not called**.
- invalid name: `UNSUPPORTED_NAME` (`'not a well-formed ENS name'`), **RPC not called**.
- generic throw (message embeds `…/v2/SECRETKEY…`): **did not throw**, `ADAPTER_ERROR`, message redacted, `cause` preserved by reference.

Revert-classification paths (`ResolverNotFound` / `UnsupportedResolverProfile` and the foreign-realm
`instanceof`-defeat case) require real viem `ContractFunctionRevertedError` fixtures and a mainnet fork —
deferred to Tests per the Invariants Dev Notes.

## Drift / cross-SF notes (route via Orchestrator)

- **D1 — Design used `networkConfig.networkId`; the actual config field is `networkConfig.id`.** The
  repo-wide convention is `NetworkConfig.id` (e.g. `configuration/rpc.ts:50` does
  `const networkId = networkConfig.id`); there is no `networkId` on `BaseNetworkConfig`/`EvmNetworkConfig`.
  Implemented with `this.networkConfig.id` for both `unsupportedNetwork(...)` and the mapper `ctx.networkId`.
  Non-blocking (corrected in code); verified end-to-end (`networkId:'ethereum-mainnet'`).
- **D2 — `createEvmPublicClient` was not exported from the `adapter-evm-core` root.** The Design listed
  it "Unchanged / reused as-is" assuming it was already public, but `./utils` is re-exported *selectively*
  and it was omitted. Added it to the root `utils` export block (additive, one line) so the `adapter-evm`
  registration layer can build the injected ENS client. Non-blocking (corrected in code).
- **D3 (cross-SF, route to SF-1 Code Draft) — SF-1's mapper lacks a UR `HttpError` errorName row.** The
  finalized D-E **Part B** table says the UR revert `errorName = 'HttpError'` → `EXTERNAL_GATEWAY_ERROR`
  (unconditional). SF-1's implemented `error-mapping.ts` classifies viem's `OffchainLookup*` /
  `HttpRequestError` / `TimeoutError` classes but has **no row for the UR contract's `HttpError` custom
  revert name**, so such a revert reaching SF-2's `default` arm maps to `ADAPTER_ERROR` (cause preserved)
  rather than `EXTERNAL_GATEWAY_ERROR`. SF-2's delegation is correct and the outcome stays safe (closed
  union, never a wrong address, never a throw — INV-6/INV-10 hold); this is a **precision** gap in SF-1's
  mapper vs. the D-E Part B intent, not an SF-2 defect. `ResolverError`/`ReverseAddressMismatch` →
  `ADAPTER_ERROR` are already correct per the design. Flagging so SF-1 can add the `HttpError` (and
  optionally `ChainDoesNotSupportContract` is already present) row; SF-2 needs no change. I did **not**
  modify SF-1's `error-mapping.ts` (imported, not modified).

## Watch item (from brief) — resolved

The reported `rolldown-plugin-dts` "failed to emit declaration" warnings on the `adapter-evm-core`
build: the current build emits **no** such warning for any SF-2 file. The one declaration warning
present (`RuntimeCleanupStage` MISSING_EXPORT in `capabilities/helpers.d.ts`) is **pre-existing** (an
SF-0 file untouched by SF-2) — `helpers.ts` imports `RuntimeCleanupStage` as a value-position `type`
that the `.d.ts` emitter flags. SF-2's exported capability types (`createNameResolution`,
`CreateNameResolutionOptions`, service, helpers) all emit cleanly into `dist/index.d.mts` (confirmed by
grep). Recommend SF-1/maintainers fix the pre-existing `helpers.ts` import to a `import type` to clear it.

## Out of scope (unchanged from Design/Invariants)

Reverse resolution (SF-3); ENS v2 / `EnsProvenance` / `viaGateway:true` (SF-5); the conformance harness
(SF-4); the `NameResolutionError` union + value types (UIKit SF-1); the mapper internals (SF-1); tests
(Dev3 05 Tests). No commits made — the dev decides when/what to commit.
