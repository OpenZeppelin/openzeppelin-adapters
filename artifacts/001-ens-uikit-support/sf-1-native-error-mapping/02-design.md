---
stage: design
project: ens-uikit-support
sub_feature: sf-1-native-error-mapping
repo: openzeppelin-adapters
mode: extension
extends: packages/adapter-evm-core/src
status: draft
timestamp: 2026-07-03
author: aleksandr.pasevin
previous_stage: artifacts/001-ens-uikit-support/00-specify.md
tags: [ens, name-resolution, error-mapping, viem, evm, adapter, service]
---

# SF-1 · Native-error → NameResolutionError mapping — Design Document

## Summary

Adds a reusable, **stateless** error-mapping module to `@openzeppelin/adapter-evm-core` that converts the native failures raised by the underlying resolution transport (`viem` client / RPC / CCIP-Read gateway / timeouts) into the **closed seven-code `NameResolutionError` union** locked and exported by UIKit SF-1 in `@openzeppelin/ui-types`. It is the single place the "never throw for expected failures" contract is centralized: the forward (SF-2), reverse (SF-3), and ENS v2 (SF-5) paths all route their caught native errors through one total function, `mapNameResolutionError`, and construct the "resolved-to-nothing" variants through a small set of typed constructors. The module owns **classification and union construction only** — it holds no state, performs no I/O, and does not implement any resolution itself.

## Module Structure

Follows the existing `erc4626` domain-directory pattern: the feature's implementation lives in its own `src/<domain>/` directory (with `error-mapping.ts` as one file among several), and a thin capability factory under `src/capabilities/<domain>.ts` wires it up. SF-1 delivers the first file in that directory; SF-2 / SF-5 build the rest into the same dir.

```
packages/adapter-evm-core/src/
├── name-resolution/
│   ├── error-mapping.ts     ← NEW (SF-1): mapNameResolutionError + typed constructors + classification
│   └── index.ts             ← NEW (SF-1): domain barrel (re-exports error-mapping; SF-2/SF-5 add exports)
├── capabilities/
│   └── name-resolution.ts   ← (SF-2, not this SF): createNameResolution factory
└── index.ts                 ← MODIFIED (SF-1): re-export the name-resolution barrel
```

**Rationale:**

- **Mirrors `erc4626/`.** `src/erc4626/` holds `error-mapping.ts` alongside `service.ts` / `actions.ts` / `abi.ts` / `onchain-reader.ts`, all re-exported through `src/erc4626/index.ts`, while `src/capabilities/erc4626.ts` is a thin `createERC4626` factory. Name resolution is the same shape: a domain dir for the machinery, a capability file for the seam. Dev-confirmed: "use existing pattern."
- **The mapper is an internal helper, not a capability.** It does not belong under `src/capabilities/` — that dir holds capability factories (`createAddressing`, `createERC4626`, …). Placing the mapper in `src/name-resolution/` also gives SF-2's forward/reverse service and SF-5's v2 logic a natural, co-located home.
- **A dedicated `index.ts` barrel now** keeps SF-2/SF-5 additive: they append exports rather than restructuring. SF-1's public surface is re-exported from the package root so the conformance harness (SF-4) and tests can import the constructors and the mapper by the package name.

## Core Types

SF-1 **does not define** any of the result / error value types — they are owned by UIKit SF-1 and imported from `@openzeppelin/ui-types`. The only type SF-1 introduces is the mapper's context object.

### Imported from `@openzeppelin/ui-types` (owned by UIKit SF-1 — not modified here)

```ts
// The closed seven-code taxonomy this module maps INTO. Reproduced here for
// reference only; the authoritative definition lives in @openzeppelin/ui-types.
type NameResolutionError =
  | { readonly code: 'NAME_NOT_FOUND';         readonly name: string }
  | { readonly code: 'ADDRESS_NOT_FOUND';      readonly address: string }
  | { readonly code: 'UNSUPPORTED_NETWORK';    readonly networkId: string }
  | { readonly code: 'UNSUPPORTED_NAME';       readonly name: string;    readonly reason: string }
  | { readonly code: 'RESOLUTION_TIMEOUT';     readonly elapsedMs: number }
  | { readonly code: 'EXTERNAL_GATEWAY_ERROR'; readonly detail: string }
  | { readonly code: 'ADAPTER_ERROR';          readonly message: string; readonly cause?: unknown };
```

### `NameResolutionErrorContext` (NEW — SF-1)

```ts
/**
 * Payload details the mapper cannot recover from a caught error alone and that
 * the calling resolution path (SF-2 / SF-3 / SF-5) supplies. All fields optional
 * so a bare `mapNameResolutionError(error)` is always valid; each field only
 * refines the mapped result when its corresponding classification fires.
 */
export interface NameResolutionErrorContext {
  /**
   * The active network id (this repo's `NetworkConfig.networkId` namespace).
   * Used to populate `UNSUPPORTED_NETWORK.networkId` when a chain-scope error
   * is classified. Omitted → the code still maps, with an empty networkId that
   * the caller may backfill.
   */
  readonly networkId?: string;

  /**
   * Elapsed milliseconds, measured by the caller's timeout wrapper, used to
   * populate `RESOLUTION_TIMEOUT.elapsedMs`. The mapper cannot measure elapsed
   * time from a caught error, so this is caller-supplied. See Open Questions.
   */
  readonly elapsedMs?: number;

  /**
   * Whether the failing call went through an external / off-chain gateway
   * (CCIP-Read, Namechain L2 path — SF-5). Biases classification of otherwise
   * ambiguous transport failures toward `EXTERNAL_GATEWAY_ERROR`, and resolves
   * the timeout-vs-gateway precedence (see Design Decisions §6).
   */
  readonly viaGateway?: boolean;
}
```

## Public API

### The mapper

```ts
import type { NameResolutionError } from '@openzeppelin/ui-types';

/**
 * Convert a native failure raised by the resolution transport into a typed
 * `NameResolutionError`. **Total over expected failures** — always returns a
 * member of the closed union; never throws for a transport / RPC / gateway /
 * timeout failure. Any native error that cannot be classified maps to
 * `ADAPTER_ERROR` carrying the original value as an opaque `cause`, so no
 * failure is ever silently swallowed and no invented code escapes the union.
 *
 * The **one** exception to totality: genuine programmer / lifecycle errors are
 * re-thrown, not classified — currently `RuntimeDisposedError` (use-after-
 * dispose of the capability). These signal a bug in the caller, not an expected
 * resolution outcome, and masking them as `ADAPTER_ERROR` would hide the defect.
 * This is the type-level guarantee behind UIKit INV-8 ("expected failures return
 * ok:false and never throw; only genuine programmer errors MAY throw").
 *
 * @param error   - The caught native value (typed `unknown` — the caller catches
 *                  from `viem`, whose thrown values extend `BaseError`, but any
 *                  value is accepted and non-Error values fall through to
 *                  `ADAPTER_ERROR`).
 * @param context - Payload details the error itself cannot supply. Optional.
 * @throws {RuntimeDisposedError} when `error` is a lifecycle/programmer error.
 */
export function mapNameResolutionError(
  error: unknown,
  context?: NameResolutionErrorContext,
): NameResolutionError;
```

### Typed constructors (for the non-throw control paths)

viem returns `null` for a structurally-successful lookup that found no record — it does **not** throw. Those outcomes (`NAME_NOT_FOUND`, `ADDRESS_NOT_FOUND`) and the client-side rejections (`UNSUPPORTED_NAME` when a name fails `isValidName`, `UNSUPPORTED_NETWORK` when the caller knows the active network has no resolver) are therefore built on the caller's normal control flow, not from a caught error. SF-1 exports one tiny constructor per such code so union construction stays centralized here and payload shapes live in exactly one place.

```ts
/** Forward lookup succeeded structurally but no record exists for this name. */
export const nameNotFound = (name: string): NameResolutionError => ({
  code: 'NAME_NOT_FOUND',
  name,
});

/** Reverse lookup succeeded structurally but no name maps back to this address. */
export const addressNotFound = (address: string): NameResolutionError => ({
  code: 'ADDRESS_NOT_FOUND',
  address,
});

/** Input is syntactically not a name in this system (wrong TLD, failed UTS-46, …). */
export const unsupportedName = (name: string, reason: string): NameResolutionError => ({
  code: 'UNSUPPORTED_NAME',
  name,
  reason,
});

/** The active network does not support name resolution at all. */
export const unsupportedNetwork = (networkId: string): NameResolutionError => ({
  code: 'UNSUPPORTED_NETWORK',
  networkId,
});
```

There are deliberately **no** exported constructors for `RESOLUTION_TIMEOUT`, `EXTERNAL_GATEWAY_ERROR`, or `ADAPTER_ERROR`: those three are only ever produced by classifying a caught error, so `mapNameResolutionError` is their sole construction site. `mapNameResolutionError` reuses `unsupportedNetwork` internally when it classifies a chain-scope error.

### Classification strategy

Native errors are inspected with viem's `BaseError.walk(predicate)` (the same idiom `shared/revert-info.ts` uses to reach a nested `ContractFunctionRevertedError`). Classification is **`instanceof`-primary with a `.name` / message-needle fallback** — `instanceof` is exact but brittle across duplicate-copy / bundling scenarios where two `viem` instances coexist, so a lowercased-name/message needle check backstops it (the same defense-in-depth `erc4626/error-mapping.ts` applies with its `searchText` needles). First match in this precedence order wins:

| # | Detected native error (via `walk` / `instanceof` + needle) | Mapped code | Payload source |
|---|-------------------------------------------------------------|-------------|----------------|
| 0 | `RuntimeDisposedError` | *(re-thrown — not classified)* | — |
| 1 | `ctx.viaGateway` **and** a `TimeoutError` / gateway failure | `EXTERNAL_GATEWAY_ERROR` | `detail` from error message |
| 2 | `TimeoutError` (plain RPC) | `RESOLUTION_TIMEOUT` | `elapsedMs` from `ctx` (fallback: configured budget) |
| 3 | `OffchainLookupError` / `OffchainLookupResponseMalformedError` / `OffchainLookupSenderMismatchError`; `HttpRequestError` when `ctx.viaGateway` | `EXTERNAL_GATEWAY_ERROR` | `detail` from error message |
| 4 | `EnsInvalidChainIdError` / `ChainNotConfiguredError` / `ClientChainNotConfiguredError` | `UNSUPPORTED_NETWORK` | `ctx.networkId` |
| 5 | UTS-46 `normalize()` throw (malformed name reached the transport) | `UNSUPPORTED_NAME` | name + `reason` from error |
| 6 | anything else (unclassified) | `ADAPTER_ERROR` | `message: error.message ?? String(error)`, `cause: error` |

> **Boundary note.** The precise `viem`-class → code table is formally an output of **SF-2 Research** (v1 forward/reverse native-error shapes) and **SF-5 Research** (ENS v2 / CCIP-Read gateway error shapes), per the spec's binding "prefer `viem`" research directive. SF-1 fixes the *mapper's contract, signature, precedence order, and classification strategy*; the internal predicate table can be refined by those Research stages without changing the exported signature or the closed union. Rows 1–6 are the design's best-grounded starting table against `viem@2.44.4`.

## State Ownership & Boundaries

| Entity | Owner | Lifecycle | Where it lives |
|--------|-------|-----------|----------------|
| `mapNameResolutionError` | this module | Pure function — no state, no I/O, no allocation retained. | `src/name-resolution/error-mapping.ts` |
| Typed constructors | this module | Pure functions returning fresh immutable literals. | `src/name-resolution/error-mapping.ts` |
| `NameResolutionErrorContext` value | Caller (SF-2 / SF-3 / SF-5 resolution path) | Assembled per call at the catch site; discarded after mapping. | Caller |
| The `NameResolutionError` union | **UIKit SF-1** (`@openzeppelin/ui-types`) | Imported; never modified here. | Sibling `openzeppelin-ui` repo |
| `viem` client / gateway / RPC transport | Adapter capability (SF-2) | Owned by the capability; SF-1 never touches it. | `src/capabilities/name-resolution.ts` (SF-2) |

### Boundary invariants

- **Stateless & pure.** SF-1 holds no cache, connection, or counter. Given the same `(error, context)` it returns a structurally-equal result (modulo the identity of the preserved `cause` on `ADAPTER_ERROR`, which is the original object by reference). This purity is what lets the SF-4 conformance harness treat the never-throw contract as deterministic.
- **No I/O.** The mapper never dereferences the network, reads a clock, or logs. `elapsedMs` is caller-supplied precisely because reading a clock would break purity.
- **Total, with one carve-out.** Every input either returns a union member or re-throws `RuntimeDisposedError`. There is no third outcome.
- **`cause` is opaque.** On `ADAPTER_ERROR`, `cause` is passed through as `unknown`; SF-1 does not narrow it and downstream chain-agnostic code must not either (UIKit contract).

### Dependency injection seams

None required. SF-1 is a leaf utility: the resolution paths import the mapper and constructors directly. No logger, clock, or transport is injected — keeping the module a pure function is the design choice (see Design Decisions §5). If SF-2 later wants the unclassified-error signal for ops telemetry, it logs the `cause` off the returned `ADAPTER_ERROR` with its own logger; SF-1 does not grow a logging seam.

## Integration Patterns

### SF-2 forward path (consumer sketch — not delivered by SF-1)

```ts
// @openzeppelin/adapter-evm-core — src/capabilities/name-resolution.ts (SF-2)
import {
  mapNameResolutionError,
  nameNotFound,
  unsupportedName,
} from '../name-resolution';

async resolveName(name: string): Promise<ResolutionResult<ResolvedAddress>> {
  if (!this.isValidName(name)) {
    return { ok: false, error: unsupportedName(name, 'not a well-formed ENS name') };
  }
  const started = performance.now();
  try {
    const address = await this.client.getEnsAddress({ name: normalize(name) });
    if (address === null) {
      // structural success, no record — NOT a thrown error → use the constructor
      return { ok: false, error: nameNotFound(name) };
    }
    return { ok: true, value: { name, address, provenance: /* SF-2 */ } };
  } catch (error) {
    // every genuine throw funnels through the one mapper
    return {
      ok: false,
      error: mapNameResolutionError(error, {
        networkId: this.networkConfig.networkId,
        elapsedMs: performance.now() - started,
      }),
    };
  }
}
```

### SF-5 v2 / CCIP-Read path (consumer sketch — not delivered by SF-1)

```ts
// gateway-backed resolution flags viaGateway so timeouts/HTTP failures
// classify as EXTERNAL_GATEWAY_ERROR rather than RESOLUTION_TIMEOUT / ADAPTER_ERROR
catch (error) {
  return {
    ok: false,
    error: mapNameResolutionError(error, {
      networkId: this.networkConfig.networkId,
      elapsedMs: performance.now() - started,
      viaGateway: true,
    }),
  };
}
```

### Barrel

```ts
// src/name-resolution/index.ts  (SF-1)
export * from './error-mapping';
// SF-2 adds: export { createNameResolution } from '...';  (or via capabilities barrel)
// SF-5 adds: export type { EnsProvenance }, export { isEnsProvenance };

// src/index.ts  (MODIFIED, SF-1)
export * from './name-resolution';
```

## Error Handling

This module *is* the error-handling layer, so its own style is fixed by its purpose:

- **Returns the discriminated union.** Both the mapper and the constructors return `NameResolutionError` values; they do not throw to signal an expected failure.
- **Re-throws only genuine bugs.** `RuntimeDisposedError` (and any future lifecycle/programmer-error class the team designates) propagates unchanged. This is the single, explicit exception to totality.
- **Never invents a code.** The `ADAPTER_ERROR` fallback guarantees the output is always one of the seven locked codes; an unrecognized native error is captured (with `cause`) rather than dropped or surfaced as an out-of-union value.
- **Preserves the cause.** `ADAPTER_ERROR.cause` carries the original thrown value verbatim for diagnosis; `EXTERNAL_GATEWAY_ERROR.detail` and `UNSUPPORTED_NAME.reason` carry adapter-supplied, log-safe free text.

## Events / Observability

**None at the SF-1 layer.** The module is a set of pure functions — it emits no events, logs, or metrics, and injects no logger (see Design Decisions §5). Observability of resolution attempts (latency, success/failure counters, unclassified-error alerts) belongs to SF-2's capability service, which can log `ADAPTER_ERROR.cause` with its own logger. Deliberately reserving no observability slot here keeps the mapper pure and avoids leaking an adapter logging choice into a leaf utility.

## Change Plan (Extension Mode)

- **New files:**
  - `packages/adapter-evm-core/src/name-resolution/error-mapping.ts` — the mapper, the four typed constructors, `NameResolutionErrorContext`, and the internal classification table.
  - `packages/adapter-evm-core/src/name-resolution/index.ts` — domain barrel re-exporting `error-mapping`.
- **Modified files:**
  - `packages/adapter-evm-core/src/index.ts` — one added line re-exporting the `name-resolution` barrel so the mapper/constructors are importable from the package root.
- **Unchanged:**
  - Every existing capability (`addressing.ts`, `erc4626`, `wallet.ts`, …) and its error mapping (`erc4626/error-mapping.ts`, `shared/revert-info.ts`) — SF-1 reuses the `.walk()` idiom and `includesAny` helper but does not modify them.
  - `@openzeppelin/adapter-runtime-utils` — the SF-4 conformance harness will consume SF-1's exports later, but SF-1 adds nothing there.
  - Every non-EVM adapter — unaffected (SC-006).
- **API compatibility:** Fully additive. Nothing removed, renamed, or re-signed. A minor package release.
- **Migration:** None.

## Design Decisions Log

1. **Split classifier + constructors (dev-confirmed, Q1).** viem returns `null` for a no-record lookup rather than throwing, but the spec routes `NAME_NOT_FOUND` "through the mapping layer." Rather than force a success-shaped `null` outcome to masquerade as a caught error, SF-1 provides `mapNameResolutionError` for genuine throws **and** typed constructors (`nameNotFound`, `addressNotFound`, `unsupportedName`, `unsupportedNetwork`) for the caller's normal control paths. This keeps union construction centralized in SF-1 (honoring the spec's intent) while keeping the mapper honest about what is actually a thrown error. *Rejected:* a single `mapOutcome(value | error, direction)` entry point — it conflates "resolved to nothing" with "transport threw" and forces a `direction` discriminator into an otherwise error-only function.

2. **Re-throw genuine programmer errors (dev-confirmed, Q2).** The mapper re-throws `RuntimeDisposedError` instead of folding it into `ADAPTER_ERROR`. Masking a use-after-dispose bug as an expected failure code would hide a real defect and violate the spirit of UIKit INV-8. *Rejected:* total-including-bugs — simpler contract, but swallows programmer errors.

3. **Domain directory, erc4626 pattern (dev-confirmed, Q3).** `src/name-resolution/error-mapping.ts` + barrel, with SF-2's `createNameResolution` factory later at `src/capabilities/name-resolution.ts`. Mirrors how `src/erc4626/` holds the machinery and `src/capabilities/erc4626.ts` is the thin factory. *Rejected:* placing the mapper directly under `src/capabilities/` — it is an internal helper, not a capability, and v2 logic (SF-5) would then have no natural home.

4. **Constructors only for caller-built codes.** Exported constructors exist for the four codes produced on non-throw control paths (`NAME_NOT_FOUND`, `ADDRESS_NOT_FOUND`, `UNSUPPORTED_NAME`, `UNSUPPORTED_NETWORK`). The three throw-derived codes (`RESOLUTION_TIMEOUT`, `EXTERNAL_GATEWAY_ERROR`, `ADAPTER_ERROR`) have no public constructor — `mapNameResolutionError` is their sole construction site, so there is exactly one way to produce each code and no redundant surface.

5. **Pure function, no injected logger / clock.** Keeping the mapper pure makes the SF-4 conformance harness's determinism check tractable and avoids leaking an adapter's logging/timing choices into a leaf utility. Consequence: `elapsedMs` is caller-supplied (the caller owns the clock), and unclassified-error telemetry is the caller's job via the preserved `cause`.

6. **Timeout-vs-gateway precedence via `ctx.viaGateway`.** A CCIP-Read gateway call that times out is both a timeout and a gateway failure. The mapper resolves the ambiguity from context: `viaGateway: true` → `EXTERNAL_GATEWAY_ERROR` wins (row 1 precedes row 2); a plain RPC timeout with no gateway flag → `RESOLUTION_TIMEOUT`. This keeps `EXTERNAL_GATEWAY_ERROR` distinct from `NAME_NOT_FOUND` and prevents a v2 gateway failure from being reported as a canonical timeout (Edge Case: "gateway unreachable vs name-not-found"). Carried to Invariants for formalization.

7. **`instanceof`-primary + needle fallback classification.** `instanceof BaseError` subclass checks are exact but brittle when two `viem` copies coexist; a lowercased `.name`/message-needle backstop mirrors the defense `erc4626/error-mapping.ts` already uses. The `.walk()` traversal reaches the classifying error even when it is nested in a wrapper chain.

## Out of Scope

- **The `NameResolutionError` union / value types** — owned by UIKit SF-1 (`@openzeppelin/ui-types`); imported, never modified here.
- **The capability scaffold, `isValidName`, forward `resolveName`** — SF-2.
- **Reverse `resolveAddress`, `forwardVerified`, avatar** — SF-3.
- **ENS v2 / CCIP-Read / Namechain resolution, `EnsProvenance`, `isEnsProvenance`** — SF-5. SF-1 only maps v2 *gateway errors* into the union (via `ctx.viaGateway`); it does not resolve v2 names.
- **The conformance harness** — SF-4 (it consumes SF-1's exports; SF-1 adds nothing to `adapter-runtime-utils`).
- **Avatar-fetch failure handling.** viem's `EnsAvatar*Error` classes are **not** mapped to a top-level `NameResolutionError` — an avatar is best-effort/optional (SF-3), so an avatar failure must degrade to "no avatar," never fail the whole resolution. Handling it is SF-3's concern at the point it fetches the avatar; the mapper deliberately has no avatar row.
- **Finalizing the exact `viem`-class → code table** — SF-2 / SF-5 Research per the spec's viem directive. SF-1 fixes the contract and the starting table only.
- **Logging / metrics / event slots** — adapter-side (SF-2) and consumer-side (UIKit SF-2); no SF-1 surface.
- **Non-EVM name systems** — follow-up initiative; non-EVM adapters omit the capability entirely.

## Dev Notes

- The dev directed "use existing pattern" for the module home — that is the `erc4626` domain-dir + thin-capability-factory shape, confirmed against `src/erc4626/index.ts` and `src/capabilities/erc4626.ts`.
- `mapNameResolutionError` is written to accept `unknown` (not `Error`) so a caught non-Error throw (a rejected primitive, a stringly-typed reject) still lands cleanly on `ADAPTER_ERROR` rather than needing a guard at every call site.
- The four typed constructors double as the canonical construction surface the SF-4 conformance harness and the SF-5 v2 path build on — one authoritative shape per code.

## Open Questions

1. **`RESOLUTION_TIMEOUT` vs `EXTERNAL_GATEWAY_ERROR` precedence** — resolved provisionally via `ctx.viaGateway` (Design Decisions §6): gateway flag wins over a bare timeout. Invariants should formalize this as a stated precedence invariant and decide whether a gateway timeout should *also* preserve the elapsed time somewhere (currently `EXTERNAL_GATEWAY_ERROR` carries only `detail`, no `elapsedMs`).
2. **`elapsedMs` provenance / fallback** — the mapper cannot measure elapsed time from a caught error, so it is `ctx`-supplied. Provisional fallback when a bare `TimeoutError` arrives without `ctx.elapsedMs`: the configured timeout budget. Invariants should decide whether `elapsedMs` becomes effectively mandatory on any path where a timeout is possible, or whether a sentinel (`-1` / `0`) is acceptable.
3. **Which classes count as "genuine programmer errors" to re-throw** — SF-1 names `RuntimeDisposedError`. Invariants should confirm whether other lifecycle/assertion classes (e.g. a future invariant-violation error) join that carve-out, and whether a plain `TypeError` from a bug should re-throw or fall to `ADAPTER_ERROR`. Current design: only `RuntimeDisposedError` re-throws; a `TypeError` falls to `ADAPTER_ERROR` with its `cause` preserved.
