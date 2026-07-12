/**
 * EVM ENS-provenance extension (SF-5).
 *
 * SF-2 attaches a chain-agnostic {@link ResolutionProvenance} to a forward result. SF-5 upgrades the
 * forward path to carry an EVM-specific {@link EnsProvenance} — the same object plus the *observable*
 * facts a downstream needs to reason about a v2 (or cross-chain) resolution: an always-present
 * `system: 'ens'` discriminant, the ENSIP-9/11 `coinType` the lookup was performed for, and — only
 * for a chain-scoped result — the network the address is scoped to. The rule is **observe, don't
 * infer**: every field here is a fact the adapter can substantiate from the call it actually made,
 * never a claim it merely asserts (Research G4).
 *
 * Design decisions this file implements:
 * - **D-V3 / INV-3–7** — observable facts only. No `version: 'v1'|'v2'` (not observable from viem's
 *   `Address | null`) and no `via` mechanism enum (that boundary is UIKit SF-6's, Open Q1); `system`
 *   is the discriminant instead.
 * - **D-V4 / INV-5, INV-10** — `isEnsProvenance` narrows on the always-present `system`, never on
 *   `label` string-matching (SC-005). It is the sole sanctioned narrowing path for a consumer.
 * - **INV-4** — `EnsProvenance` is a strict *superset* of an UNCHANGED base `ResolutionProvenance`
 *   (imported, never redefined): no SF-1 capability-contract change.
 * - **INV-6** — `coinType` is stored as a JS `number` (safe-integer by ENSIP-11 construction) so a
 *   `JSON.stringify(provenance)` never throws on a `bigint`.
 * - **INV-7 / D-V6** — `scopedToNetworkId` present **iff** `coinType !== 60` (a chain-scoped result),
 *   equal to the bound network's own repo `networkId` (no coinType→chainId inverse is needed because
 *   the target chain *is* the bound network — D-V2).
 *
 * viem coupling is pinned to `2.44.4`: `toCoinType` (ENSIP-9/11 forward map) and its
 * `EnsInvalidChainIdError` throw are the only viem surface here — a viem major bump re-validates both.
 *
 * @module name-resolution/ens-provenance
 */

import { toCoinType } from 'viem';

import type { ResolutionProvenance } from '@openzeppelin/ui-types';

/**
 * The `coinType` for ETH / Ethereum mainnet (ENSIP-9). A resolution performed for this coinType is
 * **unscoped** — its result is a plain mainnet address and carries no `scopedToNetworkId` (INV-7).
 */
const ETH_COIN_TYPE = 60n;

/**
 * EVM-specific provenance carried on **every** ENS forward-resolution success — the mainnet-bound
 * CCIP-Read case (the primary v2 case) *and* the L1 cross-chain path (revised D-V9). Extends the
 * chain-agnostic {@link ResolutionProvenance} with facts the adapter can OBSERVE; never a claim the
 * resolution cannot substantiate (Research G4). Narrow to it downstream via {@link isEnsProvenance} —
 * never by string-matching `label`.
 */
export interface EnsProvenance extends ResolutionProvenance {
  /**
   * Discriminant — ALWAYS the literal `'ens'`. The sole sanctioned narrowing key for
   * {@link isEnsProvenance} (INV-5). Chosen over the stale `version: 'v1' | 'v2'` sketch because
   * v1/v2 is not reliably observable from viem's `Address | null` return (the Universal Resolver is
   * one entry point for both — G4). SF-5 sets it on every forward result.
   */
  readonly system: 'ens';

  /**
   * The ENSIP-9/11 `coinType` the resolution was performed for: `60` for a mainnet-bound (unscoped)
   * resolution, or a chain-specific value (e.g. Base → `2147492101`) for a chain-scoped one. A JS
   * `number` — ENSIP-11 EVM coinTypes are `< 2^32`, well within safe-integer range (INV-6). Always set.
   */
  readonly coinType: number;

  // Inherited from ResolutionProvenance, set by SF-5 on every forward result:
  //  - label:  'ENS'  |  'ENS via external gateway'  (curated literals; never a URL — INV-8)
  //  - external: observed via the ccipRead.request hook — TRUE iff an OffchainLookup was followed (INV-9)
  //  - scopedToNetworkId?: the bound network's repo networkId, set ONLY when coinType !== 60 (INV-7)
}

/**
 * Narrow a base {@link ResolutionProvenance} to the EVM ENS extension (SC-005). Total, pure, and
 * sound: checks the always-present `system` discriminant (INV-10) — never `label`. Returns `true` for
 * every SF-5 forward result, `false` for SF-3's reverse base provenance (no `system`) and any non-EVM
 * adapter's provenance. After a `true`, `p.external` / `p.coinType` / `p.scopedToNetworkId` are safe
 * to read.
 */
export function isEnsProvenance(p: ResolutionProvenance): p is EnsProvenance {
  return (p as Partial<EnsProvenance>).system === 'ens';
}

/**
 * The bound network's `networkId` **iff** the resolution is chain-scoped (`coinType !== 60`), else
 * `undefined` (INV-7 / D-V6). Single source of the "scoped iff not mainnet" rule that
 * {@link buildEnsProvenance} spreads — no coinType→chainId inverse is needed because the target chain
 * *is* the bound network (D-V2). A mainnet-bound result therefore omits the key entirely (key-absent,
 * not `undefined`), matching the base-type convention.
 */
export function scopedNetworkId(coinType: bigint, networkId: string): string | undefined {
  return coinType !== ETH_COIN_TYPE ? networkId : undefined;
}

/**
 * Build the {@link EnsProvenance} for a forward resolution from observed facts (INV-3). `external`
 * comes from the per-call ccipRead observation (INV-9); `coinType` from the bound network (60 for
 * mainnet-bound); `scopedToNetworkId` is added **iff** the result is chain-scoped (INV-7). `label` is
 * a curated literal chosen from `external` — one of `'ENS'` / `'ENS via external gateway'`, never a
 * URL (INV-8). Freshly allocated on every call — never a shared/frozen singleton.
 */
export function buildEnsProvenance(args: {
  readonly external: boolean;
  readonly coinType: bigint;
  readonly networkId: string;
}): EnsProvenance {
  const scoped = scopedNetworkId(args.coinType, args.networkId);
  return {
    system: 'ens',
    label: args.external ? 'ENS via external gateway' : 'ENS',
    external: args.external,
    coinType: Number(args.coinType),
    ...(scoped !== undefined ? { scopedToNetworkId: scoped } : {}),
  };
}

/**
 * ENSIP-9/11 forward map: a bound EVM chainId → its `coinType`. A thin wrapper over viem's
 * `toCoinType` (mainnet → `60n`). Throws viem's `EnsInvalidChainIdError` for a non-EVM / out-of-range
 * chainId — the service catches that synchronously and returns `UNSUPPORTED_NETWORK` (INV-16). No
 * coinType→chainId inverse is needed (Research G3 / D-V6): the target chain *is* the bound network.
 *
 * @throws {import('viem').EnsInvalidChainIdError} for a chainId outside the ENSIP-11 addressable range.
 */
export function deriveCoinType(chainId: number): bigint {
  return toCoinType(chainId);
}
