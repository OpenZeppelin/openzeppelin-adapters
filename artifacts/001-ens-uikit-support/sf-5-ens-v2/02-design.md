---
stage: design
project: ens-uikit-support
sub_feature: sf-5-ens-v2
repo: openzeppelin-adapters
mode: extension
extends: packages/adapter-evm-core/src
status: draft
revision: 2
revised_from: artifacts/001-ens-uikit-support/sf-5-ens-v2/02-design-v1.md
revision_trigger: design (post-artifact ruling — dev/Orchestrator)
timestamp: 2026-07-04
author: aleksandr.pasevin
previous_stage: artifacts/001-ens-uikit-support/sf-5-ens-v2/01-research.md
tags: [ens, ensv2, name-resolution, ccip-read, cross-chain, coinType, ensip-9, ensip-11, ensip-19, ensip-23, viem, EnsProvenance, isEnsProvenance, provenance, capability, evm, adapter, service]
---

# SF-5 · ENS v2 (L1-only: CCIP-Read + cross-chain via coinType) + EnsProvenance + isEnsProvenance — Design Document

> **Revision 2.** D-V9 was flipped by dev ruling: truthful `external` + `EnsProvenance` now ride **every** forward-resolution success (mainnet-bound **and** the new L1 cross-chain path), so a mainnet-bound CCIP-Read v2 name — the primary v2 case — carries a truthful `external` and narrows under `isEnsProvenance` (delivers SC-005 / UIKit SC-007). This changes SF-2's forward-success provenance output; see the **Revision Log** and the **Step-Back Suggestion** (SF-2 provenance re-baseline). All other decisions from v1 are unchanged.

## Summary

Extends the EVM `NameResolutionCapability` forward path to serve ENS v2 — which is **L1-only** (Namechain cancelled; spec Plan Revision 1) — through the same viem `getEnsAddress` pipeline SF-2 already runs, adding: (1) an EVM-specific `EnsProvenance` type that **extends** the base `ResolutionProvenance` with *observable-only* facts (a `system: 'ens'` discriminant, an observed `external`, the `coinType` used, and — for chain-scoped results — `scopedToNetworkId`); (2) an exported `isEnsProvenance` type guard that narrows on the always-present `system` discriminant; (3) truthful offchain detection derived by wrapping the resolving client's `ccipRead.request` hook (G1), applied on **every** forward resolution. The single load-bearing architecture decision (G2) is the **client model**: because UIKit SF-1's `resolveName(name)` signature is locked, the *target chain is the bound network*, ENS resolution always starts on L1, so SF-5 injects a **dedicated mainnet L1 client alongside** SF-2's per-network client and routes an otherwise-`UNSUPPORTED_NETWORK` (L2-bound) resolve to L1 with `coinType = toCoinType(boundChainId)`. The client-model change is additive (D-A signature + D-B code untouched, new behavior gated on the optional `ensL1Client`); the **provenance upgrade** (D-V9) is a deliberate, test-baselined change to SF-2's forward-success output — small, additive at the type level (base `ResolutionProvenance` unchanged), and flagged as a Recommended step-back for SF-2's provenance-test re-baseline.

## Module Structure

Grows into the `src/name-resolution/` domain dir SF-1/SF-2 built. SF-5 adds one new sibling for the extension type/guard, threads a second (optional) injected client through the existing factory and service, and switches the forward-success provenance construction to the new builder.

```
packages/adapter-evm-core/src/
├── name-resolution/
│   ├── error-mapping.ts     ← SF-1 (exists): mapNameResolutionError + constructors   [UNCHANGED]
│   ├── name-validation.ts   ← SF-2 (exists): isValidName + normalizeName             [UNCHANGED]
│   ├── provenance.ts        ← SF-2 (exists): baseEnsProvenance()                      [UNCHANGED — now REVERSE-only (SF-3); forward migrates to EnsProvenance]
│   ├── ens-provenance.ts    ← NEW (SF-5): EnsProvenance, isEnsProvenance, buildEnsProvenance, deriveCoinType, scopedNetworkId
│   ├── service.ts           ← MODIFIED (SF-5): unify resolveName's success routine over (client, coinType); observe external + build EnsProvenance on BOTH branches; accept optional ensL1Client
│   └── index.ts             ← MODIFIED (SF-5 barrel): append ens-provenance exports
├── capabilities/
│   └── name-resolution.ts   ← MODIFIED (SF-5): add optional `ensL1Client` to CreateNameResolutionOptions; thread to service
└── index.ts                 ← MODIFIED (SF-5): re-export EnsProvenance + isEnsProvenance

packages/adapter-evm/src/profiles/
└── shared.ts                ← MODIFIED (SF-5): add a dedicated mainnet ENS L1 client builder; pass ensL1Client into createNameResolution.
                                The existing per-network `ensClient(config)` (D-A) is UNTOUCHED.
```

**Rationale:**

- **`ens-provenance.ts` is its own file** (not folded into `provenance.ts`) because it introduces a new exported *type* + *guard* + *builder* — a distinct public surface from SF-2's single `baseEnsProvenance()` value.
- **`provenance.ts` stays UNCHANGED.** `baseEnsProvenance()` is now used only by **SF-3's reverse path** (`resolveAddress`), which is out of SF-5 scope; its own unit tests stay green. SF-5's forward path stops calling it (switches to `buildEnsProvenance()`) — but the function itself is not modified.
- **`service.ts` is modified, not forked.** SF-5 unifies `resolveName`'s success routine over `(client, coinType)`: the only real branch is *client selection* (bound vs L1). Both selections then run the same observe-and-build routine.
- **No hand-rolled v2/UR/CCIP-Read.** viem's `getEnsAddress` + `toCoinType` + built-in `ccipRead` cover the entire v2 read path (Research verdict GO). SF-5 adds only coinType-derivation, offchain-observation, and provenance synthesis.
- **Registration change confined to `shared.ts`** — SF-2's explicitly-reserved "dedicated ENS client builder" seam. The bound `ensClient` is not modified.

## Core Types

SF-5 introduces **one** new value type (`EnsProvenance`) and **no** changes to any UIKit-owned type. The base `ResolutionProvenance` is imported and **extended**, never modified — there is **no SF-1 capability-contract change**.

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

> The base type's own doc comment sanctions this design: *"Adapters extend this interface with ecosystem-specific fields (e.g., an EVM adapter may add ENS version / mechanism data) and export type guards for downstream narrowing."*

### `EnsProvenance` (NEW — SF-5) — observable facts only (G4)

```ts
import type { ResolutionProvenance } from '@openzeppelin/ui-types';

/**
 * EVM-specific provenance carried on EVERY ENS forward-resolution result (mainnet-bound and the
 * L1 cross-chain path). Extends the chain-agnostic {@link ResolutionProvenance} with facts the
 * adapter can OBSERVE — never a claim the resolution cannot substantiate (Research G4). Narrow to
 * it downstream via {@link isEnsProvenance}; never by string-matching `label`.
 */
export interface EnsProvenance extends ResolutionProvenance {
  /**
   * Discriminant — ALWAYS `'ens'`. The sole sanctioned narrowing key for {@link isEnsProvenance}.
   * Chosen over the stale UIKit sketch's `version: 'v1' | 'v2'` because v1/v2 is NOT reliably
   * observable from viem's `Address | null` return (the new Universal Resolver is one entry point
   * for both — G4). A field SF-5 ALWAYS sets on a forward result.
   */
  readonly system: 'ens';

  /**
   * The ENSIP-9/11 coinType the resolution was performed for. `60` = ETH / mainnet (unscoped); a
   * chain-specific value (e.g. Base → 2147492101) for a chain-scoped resolution. Observable — SF-5
   * chose it from the bound network. Always set. Fits a JS `number` (< 2^53) by construction.
   */
  readonly coinType: number;

  // Inherited & set by SF-5 on every forward result:
  //  - label:  'ENS'  |  'ENS via external gateway'  (curated literals; never a URL — INV-19 / SF-4 allowlist)
  //  - external: observed via the ccipRead.request hook (G1) — TRUE iff an OffchainLookup was actually followed
  //  - scopedToNetworkId?: the bound network's repo networkId, set ONLY when coinType !== 60 (chain-scoped)
}
```

**What is deliberately NOT on `EnsProvenance` (and why):**
- **`version: 'v1' | 'v2'`** — dropped. Not observable from the return (G4). `system` is the discriminant instead.
- **`via: 'registry' | 'ccip-read' | 'namechain'`** — dropped in full. `'namechain'` is dead (G5). A `'registry' | 'ccip-read'` enum would re-encode `external` **and** pre-empt the `external` → v2-mechanism boundary that is **UIKit SF-6's** call (Open Q3, LEFT OPEN). SF-5 surfaces only the raw observable `external`.

## Public API

### `ens-provenance.ts` (NEW)

```ts
import type { ResolutionProvenance } from '@openzeppelin/ui-types';
import { toCoinType } from 'viem';   // ENSIP-9/11 forward chainId → coinType (top-level export, verified in viem@2.44.4)

/** @see EnsProvenance (Core Types). */
export interface EnsProvenance extends ResolutionProvenance { /* system; coinType; + inherited */ }

/**
 * Narrow a base ResolutionProvenance to the EVM ENS extension. The ONLY sanctioned narrowing path
 * (SC-005) — checks the always-present `system` discriminant, never `label`. Returns true for every
 * SF-5 forward result; false for SF-3's reverse base provenance (no `system`) and any non-EVM
 * adapter's provenance.
 */
export function isEnsProvenance(p: ResolutionProvenance): p is EnsProvenance;

/**
 * Build the EnsProvenance for a forward resolution from observed facts. `external` comes from the
 * ccipRead observation (G1); `coinType` from the bound network (60 for mainnet-bound); `scopedToNetworkId`
 * is set iff `coinType !== 60`. `label` is a curated literal chosen from `external` — never a URL.
 */
export function buildEnsProvenance(args: {
  readonly external: boolean;
  readonly coinType: bigint;
  readonly networkId: string;
}): EnsProvenance;

/**
 * ENSIP-9/11 forward map: bound chainId → coinType. Thin wrapper over viem `toCoinType` (mainnet → 60n).
 * Throws viem's `EnsInvalidChainIdError` for a non-EVM / out-of-range chainId — the service catches this
 * and returns UNSUPPORTED_NETWORK. NOTE: no coinType→chainId INVERSE is needed (Research G3) — target
 * chain = bound network, so the networkId is known directly (D-V6).
 */
export function deriveCoinType(chainId: number): bigint;
```

### `service.ts` — modified `resolveName` (the correctness core)

The gates (support/shape/normalize) are SF-2's. SF-5 unifies the success routine over `(client, coinType)` and adds the client-selection branch. **Every forward success now observes `external` and builds `EnsProvenance`.**

```ts
async resolveName(name: string): Promise<ResolutionResult<ResolvedAddress>> {
  // (1) Shape + normalize gates — UNCHANGED from SF-2 (before any client selection / I/O).
  //     [isValidName → UNSUPPORTED_NAME; normalize throw → UNSUPPORTED_NAME]  (omitted for brevity)

  // (2) CLIENT + coinType SELECTION (D-V1, D-V2) — sync, before I/O.
  let client: PublicClient;
  let coinType: bigint;
  if (this.supportsEns()) {
    client = this.publicClient;                 // bound client carries a UR (mainnet-bound)
    coinType = 60n;                             // ETH / mainnet — unscoped
  } else if (this.ensL1Client) {
    try {
      coinType = deriveCoinType(this.networkConfig.viemChain.id);   // toCoinType — throws for non-EVM chainId
    } catch {
      return { ok: false, error: unsupportedNetwork(this.networkConfig.id) };
    }
    client = this.ensL1Client;                  // resolve chain-scoped via L1
  } else {
    return { ok: false, error: unsupportedNetwork(this.networkConfig.id) };   // D-B preserved (no L1 client wired)
  }

  return this.resolveVia(client, coinType, name, normalized);
}

/** Shared success routine — same for both client selections. Observes external + builds EnsProvenance. */
private async resolveVia(client: PublicClient, coinType: bigint, name: string, normalized: string) {
  // Per-call client cloned from `client`, with a ccipRead.request that flips a call-LOCAL flag (G1, D-V5)
  // — no cross-call race under concurrent resolves. Reuses `client`'s transport (no new RPC connection).
  let sawOffchain = false;
  const callClient = deriveObservingClient(client, () => { sawOffchain = true; });

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
          viaGateway: sawOffchain,     // D-V7 — offchain traversal observed → gateway-dominant (SF-1 INV-10)
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
   * SF-5 — NEW, OPTIONAL. A dedicated **mainnet** viem client used ONLY when the bound network has no
   * Universal Resolver, to resolve an ENS name chain-scoped to the bound network via L1
   * (`coinType = toCoinType(boundChainId)`). Also borrowed, never disposed. When absent, an L2-bound
   * `resolveName` returns `UNSUPPORTED_NETWORK` exactly as SF-2 does today (D-B preserved).
   */
  readonly ensL1Client?: PublicClient;
}
```

## State Ownership & Boundaries

| Entity | Owner | Lifecycle | Notes |
|--------|-------|-----------|-------|
| Bound `publicClient` (D-A) | Composing runtime (`shared.ts`) | Built per capability instance; **borrowed** | UNCHANGED. No-dispose (INV-15). Now also the source client for the per-call observing client on the mainnet-bound path. |
| `ensL1Client` (NEW) | Composing runtime (`shared.ts`) | Built once per capability instance from mainnet chain + RPC; **borrowed** | No-dispose (INV-15 extends to it). Injected, not constructed in the service (D-A philosophy). |
| Per-call observing client | **SF-5 service** | Created per `resolveName` success routine (both branches); discarded when the call returns | SF-5-**owned** ephemeral — distinct from the borrowed clients, so discarding it does not violate INV-15. Reuses the selected client's transport (no new RPC connection). |
| `EnsProvenance` value | SF-5 (`buildEnsProvenance`) | Fresh per forward success; discarded by consumer | Never aliased/frozen singleton. |
| `sawOffchain` flag | SF-5 (`resolveVia` closure) | Call-local `let`; captured by the per-call client's `ccipRead.request` | Call-scoped → race-free under concurrency (D-V5). |
| `EnsProvenance` / `isEnsProvenance` types | SF-5 | Exported from `@openzeppelin/adapter-evm-core` | Base type stays UIKit-owned. |

### Boundary invariants (carried from SF-2, extended)
- **Both injected clients are borrowed; neither is disposed** (INV-15). `cleanupStage` stays `'general'`.
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
const result = await runtime.nameResolution.resolveName('alice.eth');   // mainnet-bound
if (result.ok) {
  const { address, provenance } = result.value;
  if (isEnsProvenance(provenance)) {         // narrow — never provenance.label === 'ENS'. TRUE for every forward result now.
    provenance.external;          // truthful — observed offchain traversal (works on the mainnet-bound CCIP-Read case)
    provenance.scopedToNetworkId; // present → bind address to THIS network only (chain-scoped path)
    provenance.coinType;          // ENSIP-11 coinType
  }
} else switch (result.error.code) { /* UNSUPPORTED_NETWORK | EXTERNAL_GATEWAY_ERROR | NAME_NOT_FOUND | … */ }
```

## Error Handling

Unchanged style — discriminated `ResolutionResult`, never-throw for expected failures. SF-5 adds **no** error code, **no** SF-1 mapper row.

| Code | Produced by | SF-5 trigger |
|------|-------------|--------------|
| `UNSUPPORTED_NETWORK` | `unsupportedNetwork()` (control path) | bound network has no UR **and** (no `ensL1Client` **or** chainId not ENSIP-11-addressable). D-B preserved as fallback. |
| `NAME_NOT_FOUND` | `nameNotFound()` (control path) | `getEnsAddress` returns `null`; or `ResolverNotFound`/`ResolverNotContract` revert. |
| `UNSUPPORTED_NAME` | `unsupportedName()` (control path) | shape/normalize gate; `UnsupportedResolverProfile` revert (D-C, reused). |
| `EXTERNAL_GATEWAY_ERROR` | `mapNameResolutionError` (SF-1) | `HttpError`/`OffchainLookup*` (unconditional); `TimeoutError`/`HttpRequestError` **with `viaGateway: sawOffchain === true`** (now possible on the mainnet-bound path too). |
| `RESOLUTION_TIMEOUT` | `mapNameResolutionError` (SF-1) | `TimeoutError` with `sawOffchain` false (pre-offchain transport timeout). |
| `ADAPTER_ERROR` | `mapNameResolutionError` (SF-1) | `ResolverError` (Open Q2 RESOLVED — unchanged), unclassified. `cause` preserved. |

- **Never silent-fallback (spec hazard).** Each resolution is a **single** `getEnsAddress` call under `strict:true`; on gateway failure it returns `EXTERNAL_GATEWAY_ERROR` — it **never** retries a v1/on-chain lookup. "L1 path" is a *client-selection* choice, not a v2→v1 resolution fallback; there is no v2→v1 fallback anywhere.
- **`viaGateway` is truthful on both paths.** SF-2 hardcoded `viaGateway:false`; SF-5 now passes the **observed** `sawOffchain` on every forward resolution, so an ambiguous `TimeoutError`/`HttpRequestError` after an OffchainLookup dominates to `EXTERNAL_GATEWAY_ERROR` (SF-1 INV-10) — including on the mainnet-bound CCIP-Read case.

## Events / Observability

**None beyond SF-2's debug-on-dispose.** `ADAPTER_ERROR.cause` remains the ops hook.

## Change Plan (Extension Mode)

- **New file (`adapter-evm-core`):** `src/name-resolution/ens-provenance.ts` — `EnsProvenance`, `isEnsProvenance`, `buildEnsProvenance`, `deriveCoinType`, `scopedNetworkId`.
- **Modified (`adapter-evm-core`):**
  - `src/name-resolution/service.ts` — unify `resolveName`'s success routine over `(client, coinType)`; add client selection; **switch the forward-success provenance construction from `baseEnsProvenance()` to `buildEnsProvenance(...)` on BOTH branches**; add the per-call observing-client helper; accept optional `ensL1Client` (3rd ctor param). **This changes SF-2's forward-success OUTPUT — see the Step-Back Suggestion.**
  - `src/name-resolution/index.ts` — append `ens-provenance` exports.
  - `src/capabilities/name-resolution.ts` — add optional `ensL1Client` to `CreateNameResolutionOptions`; thread to the service factory.
  - `src/index.ts` — re-export `EnsProvenance` + `isEnsProvenance`.
- **Modified (`adapter-evm`):** `src/profiles/shared.ts` — add the `ensL1Client` builder + pass it into both factory maps. Bound `ensClient` unchanged.
- **Unchanged:** `provenance.ts` (`baseEnsProvenance` — now REVERSE-only, SF-3); `error-mapping.ts` (SF-1); `name-validation.ts` (SF-2); `shared/revert-info.ts`; every non-EVM adapter (SC-006).
- **API compatibility:** Additive at the type level — a new optional options field, a new ctor param defaulted-absent, new exported type/guard; base `ResolutionProvenance` unchanged. **Behavioral change:** forward-success `provenance` gains the `system`/`coinType` fields and a truthful `external` (was `{label:'ENS', external:false}`). `resolveName(name)` signature unchanged (SF-1 locked). Minor release.
- **Migration:** Runtimes that don't wire `ensL1Client` still resolve mainnet-bound; their forward results now carry `EnsProvenance` instead of base provenance (a superset — the base fields are all still present). `viem@2.44.4` already a dep.
- **Regression obligation (Orchestrator proviso b):** SF-5 Code re-runs SF-2's full suite; the mainnet-bound/no-`ensL1Client` **resolution** paths (address, error codes, precedence) are unchanged — only the `provenance` shape on success changes (the intended re-baseline).

## Design Decisions Log

- **D-V1 — Client model: dedicated mainnet L1 client injected *alongside* the bound client; L1 path gated on it.** (Orchestrator-ruled additive, not a step-back.) D-A signature unchanged (new field optional), D-B code unchanged, INV-15 intact. *Rejected:* re-point the single client to L1 for all networks (changes mainnet-bound wiring semantics); service constructs its own L1 client (breaks D-A "inject, don't construct" / mockability).
- **D-V2 — Target chain = bound network (Orchestrator-confirmed).** Only reading compatible with UIKit SF-1's locked `resolveName(name)`. Explicit target-chain param = breaking cross-repo SF-1 change, out of scope.
- **D-V3 — `EnsProvenance` encodes observable facts only (G4).** `system`, `coinType`, `external`, `scopedToNetworkId`. No `version`, no `via`, no `'namechain'`.
- **D-V4 — `isEnsProvenance` discriminant = `system: 'ens'`, always set on a forward result** — not `version` (unobservable). Guard true for every SF-5 forward result; false for SF-3 reverse base provenance and non-EVM (SC-005).
- **D-V5 — `external` observed via a per-call `ccipRead.request` wrapper on EVERY forward resolution, never inferred (G1).** Per-call ephemeral client + call-local `sawOffchain` → race-free. *Rejected:* AsyncLocalStorage (Node-only; adapter is browser-consumed); shared client + shared flag (races → false `external`).
- **D-V6 — `scopedToNetworkId` = bound network's own `networkId`, set only when `coinType !== 60`; no coinType-inverse (D-V2 collapses Research G3).**
- **D-V7 — `viaGateway = observed sawOffchain` on both paths; single call, no v2→v1 fallback.** Truthful gateway classification (SF-1 INV-10) without masking a v2 failure as a stale v1 success.
- **D-V8 — `ResolverError → ADAPTER_ERROR` unchanged (Open Q2 RESOLVED).** No mapper row.
- **D-V9 (REVISED — v2) — `EnsProvenance` + observed `external` ride EVERY forward-resolution success (mainnet-bound and L1 cross-chain).** *v1 said the opposite* (EnsProvenance only on the L1 path; mainnet-bound kept `baseEnsProvenance()`). *Flipped by dev ruling:* proviso (a) was to prevent regression, not to veto a deliberate, test-baselined provenance UPGRADE that SC-005 / UIKit SC-007 require for the **primary** v2 case (a mainnet-bound CCIP-Read name). Shipping v2 provenance invisible in its most common case is the worse outcome. *Consequence:* SF-2's forward-success `provenance` output changes → a Recommended step-back to SF-2 to re-baseline its provenance assertions (see Step-Back Suggestion). Base `ResolutionProvenance` stays unchanged; `baseEnsProvenance()` remains only on SF-3's reverse path.

## Revision Log

### v2 — 2026-07-04
**Triggered by:** design (post-artifact ruling — dev via Orchestrator) — the v1 D-V9 scope line (raised as v1 Open Question #2) left the primary v2 case (mainnet-bound CCIP-Read) without truthful `external`/`EnsProvenance`, undercutting SC-005 / UIKit SC-007.
**Changes:**
- **D-V9 flipped:** observed `external` + `EnsProvenance` now ride **every** forward-resolution success, not only the L1 cross-chain path. `resolveName`'s success routine unified over `(client, coinType)` (`resolveVia`); both client selections observe offchain traversal and call `buildEnsProvenance(...)`.
- Forward-success `provenance` construction switches from `baseEnsProvenance()` to `buildEnsProvenance(...)`; `viaGateway` becomes the observed `sawOffchain` on both paths; per-call observing client applies on both branches.
- `isEnsProvenance` now narrows true for **every** forward result (previously only L1-path results).
- Sections updated: Summary, Module Structure (service.ts note; provenance.ts now reverse-only), Core Types (EnsProvenance rides all forward results), Public API (`resolveVia`), Error Handling (viaGateway truthful on both paths), Change Plan (SF-2 output change), Design Decisions (D-V5/D-V9), Open Questions (#2 resolved). Added this Revision Log + the Step-Back Suggestion.
**Preserved:** D-V1, D-V2, D-V3, D-V4, D-V6, D-V7, D-V8 verbatim. Base `ResolutionProvenance` UNCHANGED (no SF-1 contract change). Client model (dedicated L1 alongside, gated on optional `ensL1Client`) unchanged. `provenance.ts` file unmodified (`baseEnsProvenance` now reverse-only). Open Q1 (external→v2-mechanism) still OPEN for UIKit SF-6; Open Q3/Q4 carried.
**Downstream impact:** SF-5 Invariants reads this revised D-V9 (invariant the truthful-external-on-all-forward-results property, not an accepted gap). SF-2 needs a controlled provenance-test re-baseline (Step-Back Suggestion) — Orchestrator coordinates before any commit.

## Out of Scope

- **Namechain L2 resolution** — cancelled (G5); `'namechain'` dropped.
- **`provenance.external` → v2-mechanism boundary** — LEFT OPEN for UIKit SF-6 (Open Q1). SF-5 surfaces only raw `external`.
- **Explicit target-chain parameter on `resolveName`** — breaking UIKit SF-1 change; target = bound network (D-V2).
- **Upgrading SF-3 reverse results to `EnsProvenance`** — SF-3 (reverse) is out of SF-5 scope; reverse keeps `baseEnsProvenance()` (guard false). A future slice could unify forward+reverse provenance.
- **Reverse resolution / avatar** — SF-3.
- **The conformance harness** — SF-4 (will exercise `isEnsProvenance` for SC-005).
- **The `NameResolutionError` union + base value types** — UIKit SF-1; extended, never modified.
- **`@ensdomains/ensjs` / `ox` primitives** — documented fallbacks only.
- **Non-EVM name systems** — follow-up initiative (SC-006).

## Dev Notes

- **viem coupling pinned to `2.44.4`:** mainnet UR proxy address, `toCoinType`, `getEnsAddress` `coinType`/`strict`, the `ccipRead.request` hook contract. A viem major bump re-validates all four. Code stage: confirm `getEnsAddress`'s `coinType` accepts the `bigint` `toCoinType` returns; `EnsProvenance.coinType` is `number` via `Number()`.
- **Per-call observing client — the one fragile seam.** Couples SF-5 to viem's internal `ccipRead.request`. SF-5 Tests: a probe that fails if the hook stops firing on `test.offchaindemo.eth`, and a chain-scoped probe (`test.ses.eth` differing mainnet vs Base).
- **`deriveObservingClient(client, onOffchain)` mechanism (Code stage):** mint a per-call `PublicClient` reusing `client`'s transport (viem `custom(client)` or transport-config reuse) + chain, with `ccipRead.request` wrapping viem's default `ccipRequest` to call `onOffchain()` then delegate. Do NOT dispose the borrowed `client`.
- **Regression proviso (Orchestrator b):** re-run SF-2's full suite in SF-5 Code; the only intended change is the forward-success `provenance` shape (the re-baseline); resolution/error/precedence behavior is unchanged.
- **SF-5-owned Docs proviso (Orchestrator c):** the L1-fallback behavior + the forward-provenance upgrade are documented in SF-5's own Docs.
- **Namechain residuals** in the ui-types base-type doc comment + spec Summary/Open-Q are cosmetic, outside SF-5's edit scope (spec Revision 1/3 flagged the cleanup); the adapter enum correctly omits `'namechain'`.

## Open Questions

1. **[CARRIED — OPEN for UIKit SF-6, per spec]** `provenance.external` → v2-mechanism (registry / ccip-read) boundary. SF-5 surfaces only observable `external`; does not pin it.
2. **[RESOLVED — v2]** *Was:* should a mainnet-bound CCIP-Read name carry `EnsProvenance` + observed `external`? *Ruling (dev):* **YES — deliver it** (D-V9 flipped). The mainnet-bound path now builds `EnsProvenance`; SF-2's forward provenance assertions get a controlled re-baseline (Step-Back Suggestion).
3. **[FOR INVARIANTS]** State the `external`-truthfulness property precisely: `external === true` **iff** an `OffchainLookup` was actually followed during *this* resolution (observed via the per-call `ccipRead.request`), on **every** forward path, never inferred. Plus the race-freedom property: concurrent `resolveName` calls never cross-contaminate `sawOffchain`.
4. **[FOR CODE — wiring]** `resolveMainnetRpcUrl(config)` precedence (configured mainnet endpoint vs viem default public transport) and its rate-limit caveat — a `shared.ts` wiring detail.

## Step-Back Suggestion (Optional)

**Target stage:** SF-2 (Code / Tests — delivered)
**Severity:** Recommended — improves quality; delivers a stated success criterion. Not a blocker for SF-5's own stages.
**Issue:** D-V9 (v2) makes SF-5's forward path build `EnsProvenance` on **every** success, including the mainnet-bound path SF-2 delivered. SF-2's forward-success `provenance` output therefore changes from `baseEnsProvenance()` = `{ label: 'ENS', external: false }` to `buildEnsProvenance(...)` = `{ system: 'ens', label: 'ENS' | 'ENS via external gateway', external: <observed>, coinType: 60 }`. SF-2's provenance assertions (the ~6 provenance tests + any `service` test asserting the base forward-success provenance) will fail against the new output until re-baselined.
**Current workaround:** None needed for SF-5 — SF-5 Code delivers the change and updates the affected SF-2 assertions as part of the controlled amendment the Orchestrator coordinates (surfaced to the dev before any commit).
**Why step-back would be better:** The change touches delivered, tested SF-2 code (its forward-success output + its provenance assertions). Routing it as an explicit, dev-approved SF-2 amendment — rather than silently editing delivered tests inside SF-5 Code — keeps SF-2's history honest and the re-baseline auditable. Scope is small and bounded: (a) the one provenance-construction line in `service.ts`'s mainnet-bound branch (now `buildEnsProvenance(...)`), and (b) SF-2's provenance assertions. Base `ResolutionProvenance` is unchanged; the base fields (`label`, `external`) remain present, so the change is a superset, not a break, at the type level.

The dev decides whether to route this as a formal SF-2 amendment (Orchestrator's stated plan) or fold the assertion updates into SF-5 Code. This is a suggestion, not a blocker.
