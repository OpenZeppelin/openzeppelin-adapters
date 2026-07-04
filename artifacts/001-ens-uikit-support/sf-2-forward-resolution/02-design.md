---
stage: design
project: ens-uikit-support
sub_feature: sf-2-forward-resolution
repo: openzeppelin-adapters
mode: extension
extends: packages/adapter-evm-core/src
status: draft
timestamp: 2026-07-03
author: aleksandr.pasevin
previous_stage: artifacts/001-ens-uikit-support/sf-2-forward-resolution/01-research.md
tags: [ens, name-resolution, forward-resolution, viem, isValidName, capability, evm, adapter, service]
---

# SF-2 · Forward resolution + capability scaffold + isValidName — Design Document

## Summary

Implements the EVM `NameResolutionCapability` forward path in `@openzeppelin/adapter-evm-core`: the required synchronous `isValidName` and the async `resolveName` (name → address), delivered as a thin service over `viem`'s `getEnsAddress` (Universal Resolver — ENSIP-10 wildcard + CCIP-Read built in). The load-bearing choice is driving `getEnsAddress` with **`strict: true`** so distinct failure classes surface as typed throws instead of collapsing into `null`; the service then classifies ENS resolver-semantic reverts on its own control path (via SF-1's typed constructors) and funnels every remaining transport/gateway/timeout throw through SF-1's `mapNameResolutionError`. The `viem` `PublicClient` is **injected** into the capability factory (decoupled, mockable, and the seam SF-5's CCIP-Read/v2 client config rides on); a synchronous Universal-Resolver support-check returns a typed `UNSUPPORTED_NETWORK` before any I/O when the bound network has no UR. Wiring mirrors the `erc4626` domain-dir + thin `capabilities/` factory pattern with `guardRuntimeCapability`. Fully additive; a minor release; non-EVM adapters untouched.

## Module Structure

Follows the established `erc4626` shape (domain dir for the machinery, a thin capability file for the seam), building into the `src/name-resolution/` directory SF-1 created. `viem`'s `getEnsAddress` **is** the on-chain reader, so — unlike `erc4626/` — there is no `abi.ts` / `onchain-reader.ts` / `actions.ts`; the domain is deliberately smaller.

```
packages/adapter-evm-core/src/
├── name-resolution/
│   ├── error-mapping.ts     ← SF-1 (exists): mapNameResolutionError + typed constructors  [NOT this SF]
│   ├── name-validation.ts   ← NEW (SF-2): isValidName + normalizeName (ENSIP-15/UTS-46)     [G3, G6]
│   ├── provenance.ts        ← NEW (SF-2): baseEnsProvenance() builder                       [G4; SF-5 seam]
│   ├── service.ts           ← NEW (SF-2): EvmNameResolutionService (isValidName, resolveName, dispose)
│   └── index.ts             ← MODIFIED (SF-1 barrel): append service / validation / provenance exports
├── capabilities/
│   ├── name-resolution.ts   ← NEW (SF-2): createNameResolution factory + CreateNameResolutionOptions
│   └── index.ts             ← MODIFIED (SF-2): re-export createNameResolution
└── (registration lives one package up — see Change Plan)

packages/adapter-evm/src/profiles/
└── shared.ts                ← MODIFIED (SF-2): add `nameResolution` slot to the eager AND lazy
                                CapabilityFactoryMap, threading an injected PublicClient built from config
```

**Rationale:**

- **Mirrors `erc4626/`.** Domain dir holds the resolution machinery; `src/capabilities/name-resolution.ts` is the thin `createNameResolution` factory, exactly as `src/capabilities/erc4626.ts` wraps `src/erc4626/`. Spec Dev Note: "capability-factory + runtime-registration wiring is the pattern to reuse."
- **`name-validation.ts` is its own file** because `isValidName` is a pure, synchronous, hot-path helper (called by the UIKit on every keystroke, SF-1 design) — separating it keeps it trivially unit-testable and free of the service's client dependency, and `resolveName` reuses it.
- **`provenance.ts` is its own file** to give SF-5's `EnsProvenance` extension a single, obvious slot to grow into (G4) — one construction site for the provenance object across v1 and v2.
- **No `abi.ts` / `onchain-reader.ts`.** `viem`'s `getEnsAddress` owns the Universal-Resolver ABI, namehash, DNS-encode, wildcard traversal, and CCIP-Read. Re-implementing any of it is exactly what the spec's "prefer `viem`" directive forbids (Research: hand-rolled resolution "rejected outright").
- **Registration is in `adapter-evm`, not `adapter-evm-core`.** The EVM `CapabilityFactoryMap` is assembled in `packages/adapter-evm/src/profiles/shared.ts`, where `config` (and its `viemChain`) is in scope — the natural place to build and thread the injected client. `adapter-evm-core` only *exports* the factory (like every other `createX`).

## Core Types

SF-2 introduces **no** result / error / provenance value types — all are owned by UIKit SF-1 and imported from `@openzeppelin/ui-types`. The only new type is the factory's options object.

### Imported from `@openzeppelin/ui-types` (owned by UIKit SF-1 — not modified here)

```ts
// Capability interface (Tier-2, extends RuntimeCapability) and value types.
import type {
  NameResolutionCapability,
  ResolutionResult,
  ResolvedAddress,
  ResolutionProvenance,
  NameResolutionError,   // used only as the return type of the SF-1 mapper/constructors
  NetworkConfig,
} from '@openzeppelin/ui-types';
```

Reproduced for reference (authoritative definition lives in `@openzeppelin/ui-types`):

```ts
interface ResolutionProvenance {
  readonly label: string;               // user-safe, e.g. 'ENS'
  readonly external: boolean;           // went through an off-chain gateway?
  readonly scopedToNetworkId?: string;  // set only for network-scoped results (SF-5)
}

interface ResolvedAddress {
  readonly name: string;                // echoed input
  readonly address: string;             // forward-resolved hex
  readonly provenance: ResolutionProvenance;
}

type ResolutionResult<T> =
  | { readonly ok: true;  readonly value: T }
  | { readonly ok: false; readonly error: NameResolutionError };

interface NameResolutionCapability extends RuntimeCapability {
  isValidName(name: string): boolean;                                       // required, sync
  resolveName?(name: string): Promise<ResolutionResult<ResolvedAddress>>;   // SF-2 supplies it
  resolveAddress?(address: string): Promise<ResolutionResult<ResolvedName>>;// SF-3
}
```

### Imported from SF-1 (`../name-resolution`, this repo — stable signature, code not yet drafted)

```ts
import {
  mapNameResolutionError,   // (error: unknown, ctx?: NameResolutionErrorContext) => NameResolutionError
  nameNotFound,             // (name: string) => NameResolutionError            (NAME_NOT_FOUND)
  unsupportedName,          // (name: string, reason: string) => NameResolutionError  (UNSUPPORTED_NAME)
  unsupportedNetwork,       // (networkId: string) => NameResolutionError        (UNSUPPORTED_NETWORK)
  type NameResolutionErrorContext,   // { networkId?; elapsedMs?; viaGateway? }
} from '../name-resolution';
```

### `CreateNameResolutionOptions` (NEW — SF-2)

```ts
import type { PublicClient } from 'viem';

/**
 * Dependencies injected into {@link createNameResolution}. The client is owned by
 * the composing runtime (see State Ownership) — the capability borrows it and never
 * disposes it.
 */
export interface CreateNameResolutionOptions {
  /**
   * A viem PublicClient whose `chain` carries `contracts.ensUniversalResolver` for
   * ENS-supporting networks. Injected (not constructed here) so the capability
   * inherits the runtime's transport / timeout / CCIP-Read configuration and stays
   * trivially mockable in unit tests. When the bound network's chain has no
   * Universal Resolver, `resolveName` returns a typed `UNSUPPORTED_NETWORK` — it
   * does not throw (see Design Decision D-B).
   */
  readonly publicClient: PublicClient;
}
```

## Public API

### Factory — `src/capabilities/name-resolution.ts`

```ts
import type { NameResolutionCapability, NetworkConfig } from '@openzeppelin/ui-types';

import { asTypedEvmNetworkConfig, guardRuntimeCapability } from './helpers';
import { createEvmNameResolutionService } from '../name-resolution';
import type { CreateNameResolutionOptions } from '../name-resolution';

/**
 * Create the EVM name-resolution capability (forward path — SF-2).
 *
 * Mirrors {@link createERC4626}: narrows the network config, assembles the service
 * over the injected viem client, and wraps it with `guardRuntimeCapability` for the
 * `RuntimeCapability` surface (network context, idempotent `dispose()`, use-after-
 * dispose → `RuntimeDisposedError`, in-flight-promise rejection on dispose).
 *
 * The capability is ALWAYS constructible on EVM: `isValidName` is network-independent,
 * and `resolveName` is always present (it reports `UNSUPPORTED_NETWORK` for a bound
 * network without a Universal Resolver rather than being omitted). Method-omission of
 * the whole capability is reserved for non-EVM adapters (SC-006).
 */
export function createNameResolution(
  config: NetworkConfig,
  options: CreateNameResolutionOptions,
): NameResolutionCapability;
```

### Service — `src/name-resolution/service.ts`

```ts
/**
 * EVM implementation of the NameResolutionCapability forward surface (sans the
 * RuntimeCapability mixin, added by the factory). Holds the injected viem client;
 * owns no other state.
 */
export class EvmNameResolutionService {
  constructor(
    networkConfig: TypedEvmNetworkConfig,
    publicClient: PublicClient,
  );

  /** Synchronous ENSIP-15 shape check. No I/O. See name-validation.ts. */
  isValidName(name: string): boolean;

  /**
   * Forward resolution: name → address. NEVER throws for an expected failure —
   * returns a discriminated `ResolutionResult`. The one sanctioned throw is
   * `RuntimeDisposedError` on use-after-dispose (enforced by the factory's guard
   * proxy, before the body runs).
   */
  resolveName(name: string): Promise<ResolutionResult<ResolvedAddress>>;

  /** No-op beyond a debug log — the injected client's lifecycle is the runtime's. */
  dispose(): void;
}

export function createEvmNameResolutionService(
  networkConfig: TypedEvmNetworkConfig,
  publicClient: PublicClient,
): EvmNameResolutionService;
```

### `resolveName` algorithm (the correctness core)

```ts
async resolveName(name: string): Promise<ResolutionResult<ResolvedAddress>> {
  // 1. Network-scope gate (D-B) — sync, before any I/O. Once past this point, the
  //    network is known to support ENS, so every resolver-level revert below is
  //    NAME-scoped, never network-scoped (this is what unlocks D-C's classification).
  if (!this.supportsEns()) {
    return { ok: false, error: unsupportedNetwork(this.networkConfig.networkId) };
  }

  // 2. Shape gate + normalize (D-D, G3, G6) — deterministic, via the constructor.
  if (!this.isValidName(name)) {
    return { ok: false, error: unsupportedName(name, 'not a well-formed ENS name') };
  }
  let normalized: string;
  try {
    normalized = normalizeName(name);          // ENSIP-15/UTS-46; backstop — isValidName already passed
  } catch (e) {
    return { ok: false, error: unsupportedName(name, describeNormalizeFailure(e)) };
  }

  // 3. The one network call — strict:true (G1, fund-safety).
  const started = performance.now();
  try {
    const address = await this.publicClient.getEnsAddress({ name: normalized, strict: true });
    if (address === null) {
      // structural success, empty record — a NON-throw no-record path
      return { ok: false, error: nameNotFound(name) };
    }
    return { ok: true, value: { name, address, provenance: baseEnsProvenance() } };
  } catch (error) {
    // 4. Classify. ENS resolver-semantic reverts are name-scoped and produced on
    //    THIS control path via SF-1 constructors (preserving SF-1 INV-11: the mapper
    //    never emits a not-found). Everything else → the mapper.
    const errorName = error instanceof BaseError ? extractRevertInfo(error).errorName : undefined;
    switch (errorName) {
      case 'ResolverNotFound':
      case 'ResolverNotContract':
        return { ok: false, error: nameNotFound(name) };                    // 2nd no-record path
      case 'UnsupportedResolverProfile':
        return { ok: false, error: unsupportedName(name,
          'the ENS resolver for this name does not implement address (addr) resolution') };  // D-C
      default:
        return { ok: false, error: mapNameResolutionError(error, {
          networkId: this.networkConfig.networkId,
          elapsedMs: performance.now() - started,   // SF-1 INV-12 caller obligation
          viaGateway: false,                         // base v1 path; SF-5 sets true
        }) };
    }
  }
}

private supportsEns(): boolean {
  // Mirrors what viem's getChainContractAddress reads.
  return Boolean(this.publicClient.chain?.contracts?.ensUniversalResolver?.address);
}
```

### Helpers — `src/name-resolution/name-validation.ts`

```ts
import { normalize } from 'viem/ens';
import { isValidEvmAddress } from '../utils/validation';

/**
 * Synchronous shape check: is `name` a plausibly-resolvable ENS name?
 * No I/O, allocation-light. A `true` is necessary but not sufficient for resolution.
 *   - a raw hex address is NOT a name  → false
 *   - a name must contain a dot (label.tld) → false otherwise
 *   - it must pass ENSIP-15/UTS-46 normalization → false if `normalize` throws
 * ENSIP-15 `normalize` is deliberately used over a TLD regex (the UIKit SF-1 sketch's
 * `/\.(eth|xyz|…)$/` is weaker and hardcodes an allowlist ENS wildcard/DNS names break).
 */
export function isValidName(name: string): boolean;

/** ENSIP-15/UTS-46 normalization. Throws on a structurally invalid name (ox/Ens). */
export function normalizeName(name: string): string;
```

### Helper — `src/name-resolution/provenance.ts`

```ts
import type { ResolutionProvenance } from '@openzeppelin/ui-types';

/**
 * Base provenance for a v1 forward resolution. `external: false` — SF-2 does not (and
 * per G4 cannot cheaply) distinguish incidental CCIP-Read traversal on the v1 path;
 * accurate offchain detection and network-scoping are SF-5's `EnsProvenance` extension,
 * which slots in here. Single construction site for the provenance object across v1/v2.
 */
export function baseEnsProvenance(): ResolutionProvenance {
  return { label: 'ENS', external: false };
}
```

## State Ownership & Boundaries

| Entity | Owner | Lifecycle | Where it lives |
|--------|-------|-----------|----------------|
| `EvmNameResolutionService` instance | Adapter capability | Created per capability instance by `createNameResolution`; disposed via the guard's `dispose()`. | `src/name-resolution/service.ts` |
| viem `PublicClient` | **Composing runtime** (`adapter-evm/profiles/shared.ts`) | Built at factory-invocation time from `config`; borrowed by the service; **not** disposed by the capability. | `adapter-evm` registration layer |
| `isValidName` / `normalizeName` / `baseEnsProvenance` | this module | Pure functions — no state, no I/O. | `name-validation.ts`, `provenance.ts` |
| `NameResolutionErrorContext` value | this service (`resolveName` catch site) | Assembled per call, discarded after mapping. | Caller (SF-2) |
| The mapper + constructors | **SF-1** | Imported; pure; not modified. | `src/name-resolution/error-mapping.ts` |
| The capability type shape + error union | **UIKit SF-1** (`@openzeppelin/ui-types`) | Imported; never modified. | Sibling `openzeppelin-ui` repo |

### Boundary invariants

- **The capability borrows the client; it does not own it.** `dispose()` is a no-op with respect to the injected `PublicClient` — the runtime that built it owns its teardown. `cleanupStage: 'general'` (not `'rpc'`) precisely because SF-2 releases no RPC resource of its own. This is the direct consequence of D-A (inject, don't construct).
- **Network context is bound at factory time** (Tier-2). Switching networks disposes and recreates the capability — inherited from `RuntimeCapability` / `guardRuntimeCapability`.
- **Never throws for expected failures.** Every failure path returns `{ ok: false }`. The sole sanctioned throw is `RuntimeDisposedError` on use-after-dispose, which the guard proxy raises *before* the method body — the mapper is not involved (and would re-throw it anyway per SF-1 INV-9).
- **Stateless resolution.** The service caches nothing; SF-1 assumption "any caching is in-memory and adapter-internal" is honored by holding none (consumer-side caching is the UIKit's SF-2 hooks). This keeps SF-2 trivially deterministic-under-stable-state for the SF-4 conformance harness.

### Dependency injection seams

- **Client injection** (D-A): `createNameResolution(config, { publicClient })`. The registration layer supplies the client; unit tests supply a mock (`{ getEnsAddress, chain }`) with zero network I/O.
- **SF-1 mapper**: imported directly (leaf utility, no injection) — matches SF-1's design.

## Integration Patterns

### Registration into the EVM runtime — `packages/adapter-evm/src/profiles/shared.ts` (SF-2 delivers this)

The client is constructed here (where `config.viemChain` is in scope) and injected — reconciling D-A (inject at the capability boundary) with the existing `createEvmPublicClient` helper (construct at the composition layer):

```ts
import { createNameResolution /* … */ } from '../capabilities';
import { createEvmPublicClient, resolveRpcUrl } from '@openzeppelin/adapter-evm-core';

// helper reused by both the eager and lazy factory maps
const ensClient = (config: TypedEvmNetworkConfig) =>
  createEvmPublicClient(resolveRpcUrl(config), config.viemChain);

// in `capabilityFactories` (eager) and `createRuntimeCapabilityFactories` (lazy):
nameResolution: (config: NetworkConfig) => {
  const typed = toTypedEvmNetworkConfig(config);
  return createNameResolution(typed, { publicClient: ensClient(typed) });
},
```

Notes:
- `config.viemChain` for ENS-supporting networks (mainnet, most L1/L2s viem ships) carries `contracts.ensUniversalResolver`. Where it does not, `createEvmPublicClient` falls back to a minimal chain with no contracts → `supportsEns()` is `false` → `resolveName` returns `UNSUPPORTED_NETWORK` (D-B). This is the correct graceful path, not a crash.
- No `registerRuntimeCapabilityCleanup` is needed — a viem `http` client holds no handle requiring teardown, and the capability does not own it.
- SF-2 relies on viem's **default** CCIP-Read (on unless `ccipRead: false`), which the incidental wildcard/offchain v1 names need. If SF-5 requires custom gateway/`ccipRead` config, it introduces a dedicated ENS client builder here — SF-2 does not.

### Consumer (UIKit SF-3 hook — sketch, not delivered here)

```ts
const cap = runtime?.nameResolution;                 // present on EVM; absent on non-EVM (SC-006)
if (!cap?.resolveName) return { status: 'unsupported' };
if (!cap.isValidName(input)) return { status: 'idle' };      // cheap, no round-trip
const result = await cap.resolveName(input);
if (result.ok) use(result.value.address, result.value.provenance);
else switch (result.error.code) { /* NAME_NOT_FOUND | UNSUPPORTED_NETWORK | … */ }
```

## Error Handling

Style: **discriminated `ResolutionResult`** (never-throw for expected failures) — dictated by the UIKit contract; SF-2 constructs no error classes of its own. Production sites, by code:

| Code | Produced by | Trigger |
|------|-------------|---------|
| `UNSUPPORTED_NETWORK` | `unsupportedNetwork()` (SF-2 control path) | `supportsEns()` false — sync, before I/O (D-B) |
| `UNSUPPORTED_NAME` | `unsupportedName()` (SF-2 control path) | `isValidName` false; `normalizeName` throws (D-D); `UnsupportedResolverProfile` revert (D-C) |
| `NAME_NOT_FOUND` | `nameNotFound()` (SF-2 control path) | `getEnsAddress` returns `null`; **or** `ResolverNotFound`/`ResolverNotContract` revert |
| `EXTERNAL_GATEWAY_ERROR` | `mapNameResolutionError` (SF-1) | `HttpError` / `OffchainLookup*` reverts; `TimeoutError`/`HttpRequestError` when `viaGateway` |
| `RESOLUTION_TIMEOUT` | `mapNameResolutionError` (SF-1) | transport `TimeoutError`, `viaGateway` falsy — `elapsedMs` from ctx |
| `ADAPTER_ERROR` | `mapNameResolutionError` (SF-1) | `ResolverError`, `ReverseAddressMismatch` (unexpected on forward), unclassified — `cause` preserved |

The split honors **SF-1 INV-11** ("the mapper never fabricates a not-found from a caught error"): all `NAME_NOT_FOUND` production is on SF-2's control path (via `nameNotFound`), never inside the mapper — see the Class→Code section for why the resolver-semantic reverts live in SF-2, not SF-1.

## Events / Observability

**None at the SF-2 layer beyond debug logging.** The service emits no metrics/events; per-resolution latency/success telemetry is the consumer's (UIKit SF-2 hooks). If ops wants unclassified-error visibility, it reads `ADAPTER_ERROR.cause` (preserved by SF-1) with its own logger. `dispose()` may emit a single debug log, matching `EvmErc4626Service.dispose`. Deliberately no observability slot on the capability interface (matches UIKit SF-1 and SF-1 designs).

## Finalized Forward-Path Native-Error → Code Classification (D-E — authoritative, self-contained)

> **Purpose.** This is the finalized, verbatim-routable classification table for the forward path, against `viem@2.44.4` under `strict: true`. It supersedes the *provisional* forward-path rows in SF-2 Research's Dev Notes and reconciles them with **SF-1 INV-11** (mapper never emits not-found). Two parts: **Part A** is SF-2-owned (control-path constructors); **Part B** is the SF-1 mapper's authoritative table (what SF-2 delegates via `mapNameResolutionError`). SF-1 Code Draft implements **only Part B** in the mapper.

### Part A — SF-2-owned control-path classification (NOT mapper rows)

| Signal | Code | Construction site | Note |
|--------|------|-------------------|------|
| `getEnsAddress` returns `null` (empty-record decode) | `NAME_NOT_FOUND` | `nameNotFound(name)` | non-throw no-record path |
| `isValidName(name)` is `false` | `UNSUPPORTED_NAME` | `unsupportedName(name, 'not a well-formed ENS name')` | shape gate |
| `normalizeName(name)` throws (ENSIP-15/UTS-46) | `UNSUPPORTED_NAME` | `unsupportedName(name, reason)` | D-D — deterministic, not via mapper needle |
| `supportsEns()` false (no `ensUniversalResolver` on chain) | `UNSUPPORTED_NETWORK` | `unsupportedNetwork(networkId)` | D-B — sync, before I/O |
| revert `errorName` = `ResolverNotFound` | `NAME_NOT_FOUND` | `nameNotFound(name)` | **refines Research** (was `UNSUPPORTED_NETWORK`) — see rationale |
| revert `errorName` = `ResolverNotContract` | `NAME_NOT_FOUND` | `nameNotFound(name)` | name has no usable resolver → no record |
| revert `errorName` = `UnsupportedResolverProfile` | `UNSUPPORTED_NAME` | `unsupportedName(name, 'resolver … does not implement address (addr) resolution')` | **D-C** |

**Rationale for `ResolverNotFound`/`ResolverNotContract` → `NAME_NOT_FOUND` (divergence from Research + INV-11 reconciliation):**
- Research provisionally routed these to `UNSUPPORTED_NETWORK`. Under `strict:true`, an *unregistered* `.eth` name reverts `ResolverNotFound` (it does not return `null`) — reporting that as "this network doesn't support ENS" is user-wrong and fails the spirit of SF-2 acceptance scenario 2 ("no forward record → `NAME_NOT_FOUND`").
- **D-B changes the premise the Research mapping was made under:** the sync UR support-check pre-empts the genuine "no ENS on this network" case *before* the call. So any resolver-level revert that reaches the catch is necessarily **name-scoped**, not network-scoped → `NAME_NOT_FOUND` is correct.
- The mapper **cannot** emit `NAME_NOT_FOUND` (SF-1 INV-11, High). Therefore this classification must live on SF-2's control path via the `nameNotFound` constructor. This is exactly SF-1's own stated intent ("SF-2 will produce `NAME_NOT_FOUND` from both a `null` return *and* a classified revert") and the Research corollary (Open Q1) — realized without any change to SF-1's invariants.

### Part B — SF-1 mapper table (`mapNameResolutionError`) — the rows SF-2 delegates

| `viem` signal (via `BaseError.walk` / `extractRevertInfo` + `instanceof`/needle) | Code | Note |
|---|---|---|
| revert `errorName` = `HttpError` | `EXTERNAL_GATEWAY_ERROR` | CCIP-Read gateway HTTP failure — **unconditional** (not gated on `viaGateway`) |
| `OffchainLookupError` / `OffchainLookupResponseMalformedError` / `OffchainLookupSenderMismatchError` | `EXTERNAL_GATEWAY_ERROR` | CCIP-Read protocol failures — unconditional |
| `TimeoutError` **with** `ctx.viaGateway === true` | `EXTERNAL_GATEWAY_ERROR` | SF-1 INV-10 precedence (gateway dominates); SF-5 path |
| `TimeoutError` with `ctx.viaGateway` falsy | `RESOLUTION_TIMEOUT` | `elapsedMs` from `ctx` (SF-1 INV-12; `-1` sentinel if unmeasured) |
| `HttpRequestError` with `ctx.viaGateway === true` | `EXTERNAL_GATEWAY_ERROR` | SF-5 path |
| `HttpRequestError` with `ctx.viaGateway` falsy | `ADAPTER_ERROR` (cause) | plain RPC transport error |
| `ChainDoesNotSupportContract` | `UNSUPPORTED_NETWORK` | backstop — D-B pre-empts normally (e.g. UR-override missing) |
| revert `errorName` = `ResolverError` | `ADAPTER_ERROR` (cause) | resolver-returned error; SF-5 may reclassify offchain-origin → `EXTERNAL_GATEWAY_ERROR` |
| plain `Error('client chain not configured…')` | `ADAPTER_ERROR` (cause) | should not occur — injected client always carries a chain |
| anything else (incl. non-`Error` throws, `ReverseAddressMismatch` on forward) | `ADAPTER_ERROR` (cause preserved) | closed-union guarantee (SF-1 INV-1 / INV-7) |

**Note on the 6 Universal-Resolver `isNullUniversalResolverError` errorNames** (`HttpError`, `ResolverError`, `ResolverNotContract`, `ResolverNotFound`, `ReverseAddressMismatch`, `UnsupportedResolverProfile`): three are **Part A** (SF-2 constructors: `ResolverNotFound`, `ResolverNotContract`, `UnsupportedResolverProfile`), and three are **Part B** (mapper: `HttpError`, `ResolverError`, and `ReverseAddressMismatch` as the forward-path unexpected → `ADAPTER_ERROR`). **SF-1's mapper does not need `ResolverNotFound`/`ResolverNotContract`/`UnsupportedResolverProfile` rows** — SF-2 pre-classifies them upstream. This corrects the Orchestrator's earlier "leave the UR-revert rows as a marked seam" guidance to SF-1 Code Draft (see Dev Notes → drift note).

## Change Plan (Extension Mode)

- **New files (`adapter-evm-core`):**
  - `src/name-resolution/service.ts` — `EvmNameResolutionService` + `createEvmNameResolutionService`.
  - `src/name-resolution/name-validation.ts` — `isValidName`, `normalizeName`.
  - `src/name-resolution/provenance.ts` — `baseEnsProvenance`.
  - `src/capabilities/name-resolution.ts` — `createNameResolution` + `CreateNameResolutionOptions`.
- **Modified files:**
  - `src/name-resolution/index.ts` (SF-1 barrel) — append `service` / `name-validation` / `provenance` exports.
  - `src/capabilities/index.ts` — add `export { createNameResolution, type CreateNameResolutionOptions } from './name-resolution';`.
  - `packages/adapter-evm/src/profiles/shared.ts` — add the `nameResolution` slot to **both** the eager `capabilityFactories` and the lazy `createRuntimeCapabilityFactories`, threading the injected client.
- **Unchanged:** SF-1's `error-mapping.ts` (imported, not modified); `erc4626`/`addressing`/other capabilities; `shared/revert-info.ts` (reused: `extractRevertInfo`, `BaseError`); `createEvmPublicClient`/`resolveRpcUrl` (reused as-is); every non-EVM adapter (SC-006).
- **API compatibility:** Fully additive — a new optional capability slot + a new factory. Nothing removed/renamed/re-signed. Minor release of `adapter-evm-core` and `adapter-evm`.
- **Migration:** None. `EcosystemRuntime.nameResolution?` and `CapabilityFactoryMap.nameResolution?` are already optional (UIKit SF-1); SF-2 supplies the EVM factory.
- **`viem`:** already a dependency (`^2.33.3`, resolved `2.44.4`); no dependency change. The `strict`/`isNullUniversalResolverError`/UR behavior is `viem >= 2.x`; a `viem` major bump requires re-validating Part B.

## Design Decisions Log

- **D-A — Inject the viem `PublicClient` (not construct internally).** `createNameResolution(config, { publicClient })`. The client is built once at the `adapter-evm` composition layer (`createEvmPublicClient(resolveRpcUrl(config), config.viemChain)`) and injected. *Why:* inherits the runtime's transport/timeout/CCIP-Read config (load-bearing for SF-5), trivially mockable, matches the UIKit sketch. *Rejected:* internal construction — `createEvmPublicClient`'s minimal-chain fallback (id 1, no contracts) would silently break ENS when `viemChain` is absent, and it wires no CCIP-Read config. (Dev-confirmed.)
- **D-B — Sync Universal-Resolver support-check → typed `UNSUPPORTED_NETWORK`.** `resolveName` checks `chain.contracts.ensUniversalResolver` before any I/O; absent → `unsupportedNetwork(networkId)`, never a throw. The capability is always constructible; `isValidName` is network-independent; `resolveName` is always *present* on EVM (whole-capability omission is only for non-EVM adapters). *Why:* satisfies acceptance scenario 2 without leaking viem's `ChainDoesNotSupportContract` throw or the plain-`Error` "no chain configured" path; and it establishes that any resolver-level revert reaching the mapper is name-scoped (unblocking D-C). (Dev-confirmed.)
- **D-C — `UnsupportedResolverProfile` (forward `addr` path) → `UNSUPPORTED_NAME`.** With a precise, user-safe reason ("resolver does not implement address (addr) resolution"), produced by the `unsupportedName` constructor on SF-2's control path. *Why:* the name is well-formed and registered but its resolver lacks the addr profile — a name-property failure, not an adapter bug (`ADAPTER_ERROR`) and not a missing record (`NAME_NOT_FOUND`). (Dev-confirmed.)
- **D-D — Normalize up-front; a normalize throw → `unsupportedName` constructor directly.** Deterministic, off the mapper's fuzzy `ox`-error needle path; SF-1 mapper row 5 remains a backstop for a normalize error that somehow reaches the transport. (Dev-confirmed.)
- **D-E — SF-2 owns the finalized forward-path class→code table** (section above), routed to SF-1 Code Draft as Part B (mapper) + Part A (SF-2 constructors). (Dev-confirmed.)
- **`strict: true` is mandatory (G1).** Drive `getEnsAddress` with `strict:true` so gateway/resolver-absent/no-record don't collapse into one `null`. Corollary (must become an invariant): `NAME_NOT_FOUND` arises from **both** the `null`-return path *and* a classified revert (`ResolverNotFound`/`ResolverNotContract`). (Research Open Q1, load-bearing directive.)
- **`viaGateway: false` on the base v1 path.** The genuinely-gateway reverts (`HttpError`, `OffchainLookup*`) classify to `EXTERNAL_GATEWAY_ERROR` *unconditionally*, so a v1 wildcard/offchain name whose gateway fails is still correct; `viaGateway` only disambiguates a bare `TimeoutError`/`HttpRequestError`, which on the v1 path is honestly the RPC-to-UR call. SF-5 (explicit CCIP-Read/v2) sets `viaGateway: true`.
- **`isValidName` via ENSIP-15 `normalize`, not a TLD regex.** The UIKit SF-1 `/\.(eth|xyz|…)$/` sketch is illustrative and weaker; a normalize-based check is correct for wildcard/DNS names and is the authoritative shape gate. Reject hex (`isValidEvmAddress`) and require a dot as cheap pre-filters.

## Out of Scope

- **Reverse resolution / `resolveAddress` / `forwardVerified` / avatar** — SF-3. (`getEnsName` shares G1/G2 per Research; not designed here.)
- **ENS v2 (CCIP-Read as a first-class path) / Namechain / cross-chain / `coinType` scoping / `EnsProvenance` / `isEnsProvenance` / `scopedToNetworkId`** — SF-5. SF-2 uses the UR's built-in CCIP-Read incidentally (can't be disabled) but designs no v2 provenance surface; `baseEnsProvenance()` is the seam SF-5 extends.
- **The conformance harness** — SF-4.
- **The `NameResolutionError` union + value types** — UIKit SF-1; imported, not modified.
- **The error-mapper module** — SF-1; SF-2 *feeds* it Part B and consumes it, does not redesign it.
- **Batch resolution (`resolveNames`)** — deferred (UIKit SF-1 Decision #7).
- **Persisted resolution cache / consumer-side caching** — UIKit hooks (SF-2 there); SF-2 here holds no cache.
- **A resolution-scoped timeout budget / `AbortController`** — SF-2 relies on transport-level timeout and measures `elapsedMs` caller-side; a per-resolution budget is a possible SF-5/future extension.
- **Non-EVM name systems** — follow-up initiative; non-EVM adapters omit the capability.

## Dev Notes

- **Drift note to route to SF-1 (via Orchestrator) — refines the earlier "marked seam" guidance:** SF-1's mapper should implement **Part B only**. It does **not** need rows for `ResolverNotFound` / `ResolverNotContract` / `UnsupportedResolverProfile` — SF-2 pre-classifies those on its control path (Part A), preserving SF-1 INV-11. SF-1's mapper **does** need: `HttpError` + `OffchainLookup*` → `EXTERNAL_GATEWAY_ERROR` (unconditional); `ChainDoesNotSupportContract` → `UNSUPPORTED_NETWORK`; `ResolverError` → `ADAPTER_ERROR`; plus the existing `TimeoutError`/`HttpRequestError` (viaGateway-gated) and the `ADAPTER_ERROR` catch-all. This is a smaller, cleaner mapper than the seam implied — and it means the SF-1 Code Draft's coupling to this stage's D-C is resolved as "not a mapper row at all."
- SF-2 reuses `shared/revert-info.ts` (`extractRevertInfo`, `includesAny`) and `viem`'s `BaseError` exactly as `erc4626/error-mapping.ts` does — the `errorName` for UR reverts (`ResolverNotFound`, `HttpError`, …) is reachable via `extractRevertInfo(err).errorName`, confirmed by Research against installed `viem@2.44.4` sources.
- The class→code table (Part B) is pinned to `viem@2.44.4`; add a code comment tying it to that version (Research risk: a `viem` major bump requires re-validation).
- Cross-repo HOLD (same as SF-1): `@openzeppelin/ui-types@3.1.0` does not yet export `NameResolutionError`/`ResolvedAddress`/`NameResolutionCapability`; SF-2 imports them as designed and typecheck stays red until UIKit SF-1 types land via local-linking. Do **not** locally redefine any UIKit-owned type.
- `performance.now()` (Node 16+/browser) is the `elapsedMs` clock, matching SF-1's integration sketch — satisfies SF-1 INV-12's caller obligation so `RESOLUTION_TIMEOUT.elapsedMs` is real, not the `-1` sentinel.

## Open Questions

1. **Fork-verify `ResolverNotFound` semantics (Invariants/Tests).** This design maps `ResolverNotFound`/`ResolverNotContract` → `NAME_NOT_FOUND` (refining Research's provisional `UNSUPPORTED_NETWORK`), on the D-B-based rationale that network-scope is pre-checked. Invariants should state the "`NAME_NOT_FOUND` from both `null` and classified-revert" property explicitly; Tests should pin it against a mainnet fork — resolve an unregistered `.eth` name and assert `NAME_NOT_FOUND` (not `UNSUPPORTED_NETWORK`). If a fork shows `ResolverNotFound` genuinely fires only on network/infra absence (never for an unregistered name), revisit this one row.
2. **`ResolverError` offchain-origin reclassification (SF-5).** SF-2 maps `ResolverError` → `ADAPTER_ERROR`. A `ResolverError` originating from a CCIP-Read gateway is arguably `EXTERNAL_GATEWAY_ERROR`, but SF-2 can't cheaply tell (G4). Flagged for SF-5, which owns explicit gateway context (`viaGateway: true`).
3. **`isValidName` dot-requirement.** SF-2 requires a `.` (rejects bare single labels). Confirm no target ENS deployment resolves dotless single-label names via the forward `addr` path; if one does, relax the pre-filter (the `normalize` check would still gate correctness).
