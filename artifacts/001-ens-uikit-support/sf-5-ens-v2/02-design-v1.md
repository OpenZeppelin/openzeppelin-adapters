---
stage: design
project: ens-uikit-support
sub_feature: sf-5-ens-v2
repo: openzeppelin-adapters
mode: extension
extends: packages/adapter-evm-core/src
status: draft
timestamp: 2026-07-04
author: aleksandr.pasevin
previous_stage: artifacts/001-ens-uikit-support/sf-5-ens-v2/01-research.md
tags: [ens, ensv2, name-resolution, ccip-read, cross-chain, coinType, ensip-9, ensip-11, ensip-19, ensip-23, viem, EnsProvenance, isEnsProvenance, provenance, capability, evm, adapter, service]
---

# SF-5 · ENS v2 (L1-only: CCIP-Read + cross-chain via coinType) + EnsProvenance + isEnsProvenance — Design Document

## Summary

Extends the EVM `NameResolutionCapability` forward path to serve ENS v2 — which is **L1-only** (Namechain cancelled; spec Plan Revision 1) — through the same viem `getEnsAddress` pipeline SF-2 already runs, adding: (1) an EVM-specific `EnsProvenance` type that **extends** the base `ResolutionProvenance` with *observable-only* facts (a `system: 'ens'` discriminant, an observed `external`, the `coinType` used, and — for chain-scoped results — `scopedToNetworkId`); (2) an exported `isEnsProvenance` type guard that narrows on the always-present `system` discriminant; (3) truthful offchain detection derived by wrapping the resolving client's `ccipRead.request` hook (G1). The single load-bearing architecture decision (G2) is the **client model**: because UIKit SF-1's `resolveName(name)` signature is locked, the *target chain is the bound network*, ENS resolution always starts on L1, so SF-5 injects a **dedicated mainnet L1 client alongside** SF-2's per-network client and routes an otherwise-`UNSUPPORTED_NETWORK` (L2-bound) resolve to L1 with `coinType = toCoinType(boundChainId)`. This is **purely additive**: D-A (client injection signature) and D-B (support-gate code) are untouched, no SF-2 *success* path changes output, and every new behavior is gated on the new optional `ensL1Client`. Fully additive; a minor release.

## Module Structure

Grows into the `src/name-resolution/` domain dir SF-1/SF-2 built. `provenance.ts` was left by SF-2 as "the single construction site for SF-5's `EnsProvenance` extension"; SF-5 adds one new sibling for the extension type/guard and threads a second (optional) injected client through the existing factory and service.

```
packages/adapter-evm-core/src/
├── name-resolution/
│   ├── error-mapping.ts     ← SF-1 (exists): mapNameResolutionError + constructors   [UNCHANGED]
│   ├── name-validation.ts   ← SF-2 (exists): isValidName + normalizeName             [UNCHANGED]
│   ├── provenance.ts        ← SF-2 (exists): baseEnsProvenance()                      [UNCHANGED — v1/mainnet-bound path keeps it]
│   ├── ens-provenance.ts    ← NEW (SF-5): EnsProvenance, isEnsProvenance, buildEnsProvenance, deriveCoinType, scopedNetworkId
│   ├── service.ts           ← MODIFIED (SF-5): add the L1 cross-chain branch to resolveName; accept optional ensL1Client
│   └── index.ts             ← MODIFIED (SF-5 barrel): append ens-provenance exports
├── capabilities/
│   └── name-resolution.ts   ← MODIFIED (SF-5): add optional `ensL1Client` to CreateNameResolutionOptions; thread to service
└── index.ts                 ← MODIFIED (SF-5): re-export EnsProvenance + isEnsProvenance

packages/adapter-evm/src/profiles/
└── shared.ts                ← MODIFIED (SF-5): add a dedicated mainnet ENS L1 client builder; pass ensL1Client into createNameResolution.
                                The existing per-network `ensClient(config)` (D-A) is UNTOUCHED.
```

**Rationale:**

- **`ens-provenance.ts` is its own file** (not folded into `provenance.ts`) because it introduces a new exported *type* + *guard* + *builder* — a distinct public surface from SF-2's single `baseEnsProvenance()` value. `provenance.ts` stays untouched so SF-2's v1/mainnet-bound path keeps returning `baseEnsProvenance()` verbatim (proviso a).
- **`service.ts` is modified, not forked.** SF-3 established the pattern (reverse `resolveAddress` was a new method on the same `EvmNameResolutionService`). SF-5 adds a *branch* to the existing `resolveName`, reached only when the bound client has no UR **and** an `ensL1Client` was injected — the SF-2 code path (bound client, `baseEnsProvenance()`) is preserved as the first branch.
- **No hand-rolled v2/UR/CCIP-Read.** viem's `getEnsAddress` + `toCoinType` + built-in `ccipRead` cover the entire v2 read path (Research verdict GO). SF-5 adds only the coinType-derivation, the offchain-observation wrapper, and the provenance synthesis — the signals viem doesn't surface.
- **Registration change is confined to `shared.ts`** — SF-2 explicitly reserved this: *"If SF-5 requires custom gateway/`ccipRead` config, it introduces a dedicated ENS client builder here — SF-2 does not."* The new L1 client builder is that reserved seam; the existing bound `ensClient` is not modified.

## Core Types

SF-5 introduces **one** new value type (`EnsProvenance`) and **no** changes to any UIKit-owned type. The base `ResolutionProvenance` (`@openzeppelin/ui-types`) is imported and **extended**, never modified — there is **no SF-1 capability-contract change**.

### Imported from `@openzeppelin/ui-types` (owned by UIKit SF-1 — not modified)

```ts
import type { ResolutionProvenance, ResolvedAddress, ResolutionResult } from '@openzeppelin/ui-types';
```

Base shape, reproduced for reference (authoritative in `@openzeppelin/ui-types`, verified verbatim against `packages/types/src/common/name-resolution.ts`):

```ts
interface ResolutionProvenance {
  readonly label: string;               // user-safe DISPLAY string; downstream MUST NOT branch on it
  readonly external: boolean;           // went through an off-chain gateway?
  readonly scopedToNetworkId?: string;  // set only for network-scoped results
}
```

> The base type's own doc comment sanctions this design: *"Adapters extend this interface with ecosystem-specific fields (e.g., an EVM adapter may add ENS version / mechanism data) and export type guards for downstream narrowing."* — `EnsProvenance` + `isEnsProvenance` are exactly that.

### `EnsProvenance` (NEW — SF-5) — observable facts only (G4)

```ts
import type { ResolutionProvenance } from '@openzeppelin/ui-types';

/**
 * EVM-specific provenance carried on an ENS v2 / chain-scoped resolution result.
 *
 * Extends the chain-agnostic {@link ResolutionProvenance} with facts the adapter can
 * OBSERVE — never a claim the resolution cannot substantiate (Research G4). Narrow to
 * it downstream via {@link isEnsProvenance}; never by string-matching `label`.
 */
export interface EnsProvenance extends ResolutionProvenance {
  /**
   * Discriminant — ALWAYS `'ens'`. The sole sanctioned narrowing key for
   * {@link isEnsProvenance}. Chosen over the stale UIKit sketch's `version: 'v1' | 'v2'`
   * because v1/v2 is NOT reliably observable from viem's `Address | null` return (the new
   * Universal Resolver is one entry point for both — G4). A field SF-5 ALWAYS sets.
   */
  readonly system: 'ens';

  /**
   * The ENSIP-9/11 coinType the resolution was performed for. `60` = ETH / mainnet
   * (unscoped); a chain-specific value (e.g. Base → 2147492101) for a chain-scoped
   * resolution. Observable — SF-5 chose it from the bound network. Always set on an
   * `EnsProvenance`. Fits a JS `number` (< 2^53) by construction (`toCoinType` rejects
   * chainId ≥ 0x80000000).
   */
  readonly coinType: number;

  // Inherited & set by SF-5:
  //  - label:  'ENS'  |  'ENS via external gateway'  (curated literals; never a URL — INV-19 / SF-4 allowlist)
  //  - external: observed via the ccipRead.request hook (G1) — TRUE iff an OffchainLookup was actually followed
  //  - scopedToNetworkId?: the bound network's repo networkId, set ONLY when coinType !== 60 (chain-scoped)
}
```

**What is deliberately NOT on `EnsProvenance` (and why):**
- **`version: 'v1' | 'v2'`** — dropped. Not observable from the return (G4); fabricating it would violate the Research constraint "encode only observable facts." (The stale sketch used it as the discriminant; SF-5 uses `system` instead.)
- **`via: 'registry' | 'ccip-read' | 'namechain'`** — dropped in full. `'namechain'` is dead (Namechain cancelled — G5). A `'registry' | 'ccip-read'` enum would be a re-encoding of `external` **and** would pre-empt the `external` → v2-mechanism boundary that is **UIKit SF-6's** call (Open Q3, LEFT OPEN). SF-5 surfaces only the raw observable `external` boolean and stops there.

## Public API

### `ens-provenance.ts` (NEW)

```ts
import type { ResolutionProvenance } from '@openzeppelin/ui-types';
import { toCoinType } from 'viem';   // ENSIP-9/11 forward chainId → coinType (top-level export, verified in viem@2.44.4)

/** @see EnsProvenance (Core Types). */
export interface EnsProvenance extends ResolutionProvenance { /* system; coinType; + inherited */ }

/**
 * Narrow a base ResolutionProvenance to the EVM ENS extension. The ONLY sanctioned
 * narrowing path (SC-005) — checks the always-present `system` discriminant, never `label`.
 * Returns false for SF-2's base v1/mainnet-bound provenance (no `system`) and for any
 * non-EVM adapter's provenance.
 */
export function isEnsProvenance(p: ResolutionProvenance): p is EnsProvenance;

/**
 * Build the EnsProvenance for a chain-scoped v2 resolution from observed facts.
 * `external` comes from the ccipRead observation (G1); `coinType` from the bound network;
 * `scopedToNetworkId` is set iff `coinType !== 60`. `label` is a curated literal chosen
 * from `external` — never a URL.
 */
export function buildEnsProvenance(args: {
  readonly external: boolean;
  readonly coinType: bigint;
  readonly networkId: string;
}): EnsProvenance;

/**
 * ENSIP-9/11 forward map: bound chainId → coinType. Thin wrapper over viem `toCoinType`
 * (mainnet → 60n). Throws viem's `EnsInvalidChainIdError` for a non-EVM / out-of-range
 * chainId — the service catches this and returns UNSUPPORTED_NETWORK (the chain cannot be
 * addressed via ENSIP-11). NOTE: no coinType→chainId INVERSE is needed (Research G3) —
 * target chain = bound network, so the networkId is known directly (D-V6).
 */
export function deriveCoinType(chainId: number): bigint;
```

### `service.ts` — modified `resolveName` (the correctness core)

The SF-2 body is preserved; SF-5 adds the client-selection branch (marked `NEW`). Precedence is unchanged (support-gate → shape → normalize → call → ordered catch).

```ts
async resolveName(name: string): Promise<ResolutionResult<ResolvedAddress>> {
  // (1) Shape + normalize gates — UNCHANGED from SF-2 (run before any client selection / I/O).
  //     [isValidName → UNSUPPORTED_NAME; normalize throw → UNSUPPORTED_NAME]  (omitted for brevity)

  // (2) CLIENT SELECTION (D-V1 — the G2 decision) — sync, before I/O.
  if (this.supportsEns()) {
    // ── SF-2 PATH, VERBATIM ── bound client carries a UR (mainnet-bound). coinType 60 implicit,
    //    baseEnsProvenance(), no offchain observation. NO output change (proviso a).
    return this.resolveOnBoundClient(name, normalized);      // == SF-2's existing call + catch
  }

  // ── NEW: L1 CROSS-CHAIN PATH ── bound client has no UR (L2-bound). SF-2 returned
  //    UNSUPPORTED_NETWORK here; SF-5 upgrades it to a chain-scoped L1 resolve when possible.
  if (!this.ensL1Client) {
    return { ok: false, error: unsupportedNetwork(this.networkConfig.id) };   // D-B preserved (no L1 client wired)
  }
  let coinType: bigint;
  try {
    coinType = deriveCoinType(this.networkConfig.viemChain.id);               // toCoinType — throws for non-EVM chainId
  } catch {
    return { ok: false, error: unsupportedNetwork(this.networkConfig.id) };   // chain not ENSIP-11-addressable
  }

  // Per-call client cloned from the injected L1 template, with a ccipRead.request that flips a
  // call-LOCAL flag (G1, D-V5) — no cross-call race under concurrent resolves.
  let sawOffchain = false;
  const callClient = this.deriveObservingClient(() => { sawOffchain = true; });

  const started = performance.now();
  try {
    const address = await callClient.getEnsAddress({ name: normalized, coinType, strict: true });   // strict:true — INV-7
    if (address === null) return { ok: false, error: nameNotFound(name) };                           // no-record (INV-8)
    const provenance = buildEnsProvenance({ external: sawOffchain, coinType, networkId: this.networkConfig.id });
    return { ok: true, value: { name, address, provenance } };
  } catch (error) {
    // Same ordered catch as SF-2 (Part A control-path constructors), with viaGateway = sawOffchain.
    const errorName = error instanceof BaseError ? extractRevertInfo(error).errorName : undefined;
    switch (errorName) {
      case 'ResolverNotFound':
      case 'ResolverNotContract':      return { ok: false, error: nameNotFound(name) };
      case 'UnsupportedResolverProfile':
        return { ok: false, error: unsupportedName(name,
          'the ENS resolver for this name does not implement address (addr) resolution') };
      default:
        return { ok: false, error: mapNameResolutionError(error, {
          networkId: this.networkConfig.id,
          elapsedMs: performance.now() - started,
          viaGateway: sawOffchain,     // D-V7 — offchain traversal observed → gateway-dominant classification (SF-1 INV-10)
        }) };
    }
  }
}
```

### `capabilities/name-resolution.ts` — modified options (additive)

```ts
export interface CreateNameResolutionOptions {
  /** SF-2, D-A — UNCHANGED. Bound per-network client; borrowed, never disposed (INV-15). */
  readonly publicClient: PublicClient;

  /**
   * SF-5 — NEW, OPTIONAL. A dedicated **mainnet** viem client used ONLY when the bound network
   * has no Universal Resolver, to resolve an ENS name chain-scoped to the bound network via L1
   * (`coinType = toCoinType(boundChainId)`). Also borrowed, never disposed. When absent, an
   * L2-bound `resolveName` returns `UNSUPPORTED_NETWORK` exactly as SF-2 does today (D-B preserved).
   */
  readonly ensL1Client?: PublicClient;
}
```

## State Ownership & Boundaries

| Entity | Owner | Lifecycle | Notes |
|--------|-------|-----------|-------|
| Bound `publicClient` (D-A) | Composing runtime (`shared.ts`) | Built per capability instance; **borrowed** | UNCHANGED. No-dispose (INV-15). |
| `ensL1Client` (NEW) | Composing runtime (`shared.ts`) | Built once per capability instance from a mainnet chain + RPC; **borrowed** | No-dispose (INV-15 extends to it). Injected, not constructed in the service (D-A philosophy). |
| Per-call observing client | **SF-5 service** | Created per `resolveName`, on the L1 path only; discarded when the call returns | SF-5-**owned** ephemeral — distinct from the borrowed clients, so discarding it does **not** violate INV-15. Reuses the injected L1 client's transport (no new RPC connection). |
| `EnsProvenance` value | SF-5 (`buildEnsProvenance`) | Fresh per success on the L1 path; discarded by consumer | Never aliased/frozen singleton. |
| `sawOffchain` flag | SF-5 (`resolveName` closure) | Call-local `let`; captured by the per-call client's `ccipRead.request` | Call-scoped → race-free under concurrency (D-V5). |
| `EnsProvenance` / `isEnsProvenance` types | SF-5 | Exported from `@openzeppelin/adapter-evm-core` | Base type stays UIKit-owned. |

### Boundary invariants (carried from SF-2, extended)
- **Both injected clients are borrowed; neither is disposed** by the capability (INV-15). `cleanupStage` stays `'general'`.
- **Statelessness / determinism (INV-13)** preserved: no cache/memo; the only mutable state is the call-local `sawOffchain`, which never escapes the call.
- **`label` is a curated literal** (`'ENS'` / `'ENS via external gateway'`) — never a gateway URL (INV-19 / SF-4 allowlist).

## Integration Patterns

### Registration — `packages/adapter-evm/src/profiles/shared.ts` (SF-5 delivers the delta)

```ts
import { mainnet } from 'viem/chains';

// UNCHANGED (SF-2, D-A): the bound per-network client.
function ensClient(config: TypedEvmNetworkConfig) {
  return createEvmPublicClient(resolveRpcUrl(config), config.viemChain);
}

// NEW (SF-5): a dedicated mainnet L1 client — the ENSv2 UR entry point. `mainnet` always carries
// contracts.ensUniversalResolver (the DAO-owned v2 UR proxy). RPC precedence: a configured mainnet
// endpoint if present, else viem's default mainnet transport (documented rate-limit caveat).
function ensL1Client(config: TypedEvmNetworkConfig) {
  return createEvmPublicClient(resolveMainnetRpcUrl(config), mainnet);
}

// Both eager and lazy factory maps:
nameResolution: (config: NetworkConfig) => {
  const typed = toTypedEvmNetworkConfig(config);
  return createNameResolution(typed, {
    publicClient: ensClient(typed),          // D-A, unchanged
    ensL1Client:  ensL1Client(typed),        // NEW — enables the L1 cross-chain path
  });
},
```

### Consumer (UIKit SF-6 — sketch, not delivered here)

```ts
const result = await runtime.nameResolution.resolveName('test.ses.eth');   // bound to Base
if (result.ok) {
  const { address, provenance } = result.value;
  if (isEnsProvenance(provenance)) {                       // narrow — never provenance.label === 'ENS'
    provenance.external;          // observed offchain traversal
    provenance.scopedToNetworkId; // present → bind address to THIS network only
    provenance.coinType;          // ENSIP-11 coinType (e.g. Base)
  }
} else switch (result.error.code) { /* UNSUPPORTED_NETWORK | EXTERNAL_GATEWAY_ERROR | NAME_NOT_FOUND | … */ }
```

## Error Handling

Unchanged style — discriminated `ResolutionResult`, never-throw for expected failures. SF-5 adds **no** error code, **no** SF-1 mapper row.

| Code | Produced by | SF-5 trigger |
|------|-------------|--------------|
| `UNSUPPORTED_NETWORK` | `unsupportedNetwork()` (control path) | bound network has no UR **and** (no `ensL1Client` **or** chainId not ENSIP-11-addressable). D-B preserved as fallback. |
| `NAME_NOT_FOUND` | `nameNotFound()` (control path) | L1 `getEnsAddress` returns `null`; or `ResolverNotFound`/`ResolverNotContract` revert. |
| `UNSUPPORTED_NAME` | `unsupportedName()` (control path) | shape/normalize gate; `UnsupportedResolverProfile` revert (D-C, reused). |
| `EXTERNAL_GATEWAY_ERROR` | `mapNameResolutionError` (SF-1) | `HttpError`/`OffchainLookup*` (unconditional); `TimeoutError`/`HttpRequestError` **with `viaGateway: sawOffchain === true`**. |
| `RESOLUTION_TIMEOUT` | `mapNameResolutionError` (SF-1) | `TimeoutError` with `sawOffchain` false (pre-offchain transport timeout). |
| `ADAPTER_ERROR` | `mapNameResolutionError` (SF-1) | `ResolverError` (Open Q2 RESOLVED — unchanged), unclassified. `cause` preserved. |

- **Never silent-fallback (spec hazard).** The L1 path is a **single** `getEnsAddress` call under `strict:true`; on any gateway failure it returns `EXTERNAL_GATEWAY_ERROR` — it **never** retries a v1/on-chain lookup. "L1 path" is a *client-selection* choice (bound-client → L1-client), **not** a v2→v1 resolution fallback; there is no v2→v1 fallback anywhere in SF-5.
- **`viaGateway` is now truthful, not hardcoded.** SF-2 passed `viaGateway:false`; SF-5's L1 path passes the **observed** `sawOffchain`, so an ambiguous `TimeoutError`/`HttpRequestError` that occurred *after* an OffchainLookup was followed dominates to `EXTERNAL_GATEWAY_ERROR` (SF-1 INV-10). The genuinely-gateway reverts already classify unconditionally.

## Events / Observability

**None beyond SF-2's debug-on-dispose.** No metrics/events on the capability surface (matches SF-1/SF-2). `ADAPTER_ERROR.cause` remains the ops hook.

## Change Plan (Extension Mode)

- **New file (`adapter-evm-core`):** `src/name-resolution/ens-provenance.ts` — `EnsProvenance`, `isEnsProvenance`, `buildEnsProvenance`, `deriveCoinType`, `scopedNetworkId`.
- **Modified (`adapter-evm-core`):**
  - `src/name-resolution/service.ts` — add the L1 cross-chain branch to `resolveName`; accept an optional `ensL1Client` (3rd ctor param); add the per-call observing-client helper. **The `supportsEns()`-true branch is SF-2's body, unchanged.**
  - `src/name-resolution/index.ts` — append `ens-provenance` exports.
  - `src/capabilities/name-resolution.ts` — add optional `ensL1Client` to `CreateNameResolutionOptions`; thread to the service factory.
  - `src/index.ts` — re-export `EnsProvenance` + `isEnsProvenance`.
- **Modified (`adapter-evm`):** `src/profiles/shared.ts` — add the `ensL1Client` builder + pass it into both factory maps. **The existing bound `ensClient` is unchanged.**
- **Unchanged:** `provenance.ts` (SF-2 `baseEnsProvenance` — v1/mainnet-bound path); `error-mapping.ts` (SF-1); `name-validation.ts` (SF-2); `shared/revert-info.ts`; every non-EVM adapter (SC-006).
- **API compatibility:** Fully additive — a new optional options field, a new ctor param defaulted-absent, new exported type/guard. Nothing removed/renamed/re-signed. `resolveName(name)` signature **unchanged** (SF-1 locked). Minor release of `adapter-evm-core` and `adapter-evm`.
- **Migration:** None. Runtimes that don't wire `ensL1Client` behave exactly as SF-2. `viem@2.44.4` already a dep — no dependency change.
- **Regression obligation (Orchestrator proviso b):** SF-5 Code MUST re-run SF-2's full suite (service / factory / provenance / validation) and confirm zero change on the mainnet-bound / no-`ensL1Client` paths.

## Design Decisions Log

- **D-V1 — Client model: dedicated mainnet L1 client injected *alongside* the bound client; L1 path gated on it.** ENS resolution always starts on L1; the bound (possibly-L2) client cannot resolve v2 alone. SF-5 injects an optional `ensL1Client` and, only when the bound client has no UR, resolves on it with a derived coinType. *Why additive (not a step-back — Orchestrator-ruled):* D-A signature unchanged (new field is optional/additive), D-B code unchanged, INV-15 intact, **no SF-2 success path changes output**, SF-2 tests inject mocks (none break), and `shared.ts` is SF-2's explicitly-reserved client-builder seam. *Rejected:* (a) re-point the single client to L1 for all networks — changes SF-2's mainnet-bound wiring semantics; (b) service constructs its own L1 client — breaks D-A "inject, don't construct" / mockability.
- **D-V2 — Target chain = bound network (Orchestrator-confirmed).** The only reading compatible with UIKit SF-1's locked `resolveName(name)` signature. An explicit target-chain parameter would be a breaking cross-repo SF-1 change — out of scope.
- **D-V3 — `EnsProvenance` encodes observable facts only (G4).** `system` (discriminant), `coinType` (chosen), `external` (observed), `scopedToNetworkId` (derived). No `version`, no `via` mechanism enum, no `'namechain'`.
- **D-V4 — `isEnsProvenance` discriminant = `system: 'ens'`, a field SF-5 ALWAYS sets** — NOT the stale sketch's `version` (unobservable). Guard returns false for SF-2 base provenance and non-EVM provenance (SC-005).
- **D-V5 — `external` is observed via a per-call `ccipRead.request` wrapper, never inferred from the name/TLD (G1).** Per-call ephemeral client with a call-local `sawOffchain` closure → race-free under concurrent resolves. *Rejected:* AsyncLocalStorage (Node-only; adapter is browser-consumed by the UIKit); a shared client + shared flag (races across concurrent calls → a false `external`, unacceptable for a fund-safety-adjacent signal).
- **D-V6 — `scopedToNetworkId` = the bound network's own `networkId`, set only when `coinType !== 60` — no coinType-inverse needed.** Research (G3) anticipated a coinType→chainId inverse; D-V2 makes it unnecessary because the target chain *is* the bound network, whose `networkId` the service already holds. The forward `toCoinType(chainId)` is still needed to build the request.
- **D-V7 — `viaGateway = observed `sawOffchain`` on the L1 path; single call, no v2→v1 fallback.** Makes gateway classification truthful (SF-1 INV-10) without ever masking a v2 failure as a stale v1 success (spec hazard).
- **D-V8 — `ResolverError → ADAPTER_ERROR` unchanged (Open Q2 RESOLVED in Research).** Per ENSIP-23 the gateway-failure signal is `HttpError` (already mapped, unconditional); `ResolverError` is an origin-ambiguous resolver-fn revert — reclassifying it would mis-signal a deterministic revert as a transient gateway outage. SF-5 adds no mapper row.
- **D-V9 — `EnsProvenance` rides ONLY the new L1 cross-chain path; the mainnet-bound path keeps `baseEnsProvenance()` (proviso a).** Guarantees no SF-2 success output changes. *Consequence/limitation:* a mainnet-bound offchain (CCIP-Read) name is not upgraded to a truthful `external`/`EnsProvenance` — see Open Questions (a deliberate scope line to keep SF-2 delivered code untouched; revisitable if the dev accepts re-baselining SF-2's 6 provenance tests).

## Out of Scope

- **Namechain L2 resolution** — cancelled (Feb–Mar 2026); no target. `'namechain'` dropped from the provenance enum (G5).
- **`provenance.external` → v2-mechanism (registry / ccip-read) boundary** — LEFT OPEN for **UIKit SF-6** (Open Q3 / spec Open Q1). SF-5 surfaces only the raw `external` observation; it pins no mechanism semantics.
- **Explicit target-chain parameter on `resolveName`** — would require a breaking UIKit SF-1 signature change; target chain = bound network instead (D-V2).
- **Upgrading the mainnet-bound path to `EnsProvenance` / observed `external`** — deliberately excluded to keep SF-2's delivered success path byte-identical (D-V9). Revisitable.
- **Reverse resolution / `resolveAddress` / avatar** — SF-3. `coinType` stays 60 there.
- **The conformance harness** — SF-4. (SF-4 will exercise `isEnsProvenance` for SC-005.)
- **The `NameResolutionError` union + base value types (incl. `ResolutionProvenance`)** — UIKit SF-1; extended, never modified.
- **`@ensdomains/ensjs` / `ox` primitives** — documented fallbacks only; not used.
- **Non-EVM name systems** — follow-up initiative; non-EVM adapters omit the capability (SC-006).

## Dev Notes

- **viem coupling pinned to `2.44.4`:** the mainnet UR proxy address (in `viem/chains` `mainnet`), `toCoinType` (top-level export), `getEnsAddress`'s `coinType`/`strict` params, and the `ccipRead.request` hook contract. A viem major bump re-validates all four (add a version-tying comment, as SF-2 does). Code stage: confirm `getEnsAddress`'s `coinType` param accepts the `bigint` `toCoinType` returns (viem accepts `bigint`; the `EnsProvenance.coinType` field is `number` via `Number()` for JSON-friendliness).
- **Per-call observing client — the one fragile seam.** It couples SF-5 to viem's internal `ccipRead.request` contract. Tests (SF-5) should include a probe that fails if the hook stops firing on a known offchain name (`test.offchaindemo.eth`) and a chain-scoped probe (`test.ses.eth` differing across mainnet vs Base) — see Research verification hooks.
- **Regression proviso (Orchestrator b):** re-run SF-2's full suite in SF-5 Code; assert zero change on mainnet-bound / no-`ensL1Client` outputs.
- **SF-5-owned Docs proviso (Orchestrator c):** the new L1-fallback behavior is documented in SF-5's own Docs — do not burden SF-2 Docs (which documents SF-2 as delivered).
- **Namechain residuals** in the `@openzeppelin/ui-types` base-type doc comment (line ~16) and the spec Summary/Open-Q are cosmetic and outside SF-5's edit scope (spec Revision 1/3 flagged the cleanup); the adapter-side enum correctly omits `'namechain'`.

## Open Questions

1. **[CARRIED — OPEN for UIKit SF-6, per spec]** `provenance.external` → v2-mechanism (registry / ccip-read) boundary. SF-5 surfaces only observable `external`; does not pin it. If SF-5 Code is forced to a provisional choice, raise a drift note to the UIKit initiative — do not commit.
2. **[FOR INVARIANTS/CODE — D-V9 scope line]** Should a *mainnet-bound* CCIP-Read name also carry `EnsProvenance` + observed `external`? Current design: no (keeps SF-2 output byte-identical, proviso a). If the dev wants full v2 provenance on mainnet-bound too, that re-baselines SF-2's 6 provenance tests — a small, deliberate step-back to weigh at Invariants. Flagged, not decided.
3. **[FOR INVARIANTS]** State the `external`-truthfulness property precisely: `external === true` **iff** an `OffchainLookup` was actually followed during *this* resolution (observed via the per-call `ccipRead.request`), never inferred. And the race-freedom property: concurrent `resolveName` calls never cross-contaminate `sawOffchain`.
4. **[FOR CODE — wiring]** `resolveMainnetRpcUrl(config)` precedence (a configured mainnet endpoint vs viem's default public transport) and its rate-limit caveat — a `shared.ts` wiring detail; confirm the config surface for a mainnet RPC on an L2-bound runtime.
