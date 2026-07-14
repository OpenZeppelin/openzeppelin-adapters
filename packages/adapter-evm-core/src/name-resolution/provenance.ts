/**
 * Resolution-provenance construction (SF-2).
 *
 * The single construction site for the {@link ResolutionProvenance} attached to a successful forward
 * resolution — one obvious slot for SF-5's `EnsProvenance` extension (network-scoping, accurate
 * offchain detection) to grow into, across v1 and v2 (Design G4 seam).
 *
 * @module name-resolution/provenance
 */

import type { ResolutionProvenance } from '@openzeppelin/ui-types';

/**
 * Base provenance for a v1 forward resolution: a freshly-allocated `{ label: 'ENS', external: false }`
 * on every call (INV-5).
 *
 * - `label` is the fixed, user-safe literal `'ENS'` — never a URL, gateway host, or keyed identifier
 *   (INV-19; a leak would fail SF-4's `label`-allowlist check). It is a **display** string, not a
 *   discriminant: downstream code must not branch on it.
 * - `external` is `false` on the v1 forward path. SF-2 does not (and per G4 cannot cheaply) detect
 *   incidental CCIP-Read traversal; accurate offchain detection is SF-5's `EnsProvenance` extension.
 * - `scopedToNetworkId` is deliberately **absent** — network-scoping is SF-5's.
 *
 * A fresh object per call (no shared/frozen singleton) so no two success results alias one provenance.
 *
 * @returns A new `ResolutionProvenance` for a canonical ENS v1 forward result.
 */
export function baseEnsProvenance(): ResolutionProvenance {
  return { label: 'ENS', external: false };
}

/**
 * Provenance for a **non-mainnet bound-local** reverse hit (002 SF-1 / D-R7). Marks the name as
 * network-local via `scopedToNetworkId` so chain-agnostic consumers can gate display without EVM
 * imports (INV-5 / INV-28). Mainnet-bound hits keep {@link baseEnsProvenance} (absent scope).
 */
export function boundReverseProvenance(networkId: string): ResolutionProvenance {
  return { label: 'ENS', external: false, scopedToNetworkId: networkId };
}
