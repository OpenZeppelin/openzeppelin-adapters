/**
 * Resolve an ENS name and read its ENS v2 provenance through the EVM name-resolution capability.
 *
 * ENS v2 is NOT a separate method — v2 names resolve through the same `resolveName` call. What
 * SF-5 adds is truthful provenance on every forward success: narrow the result's `provenance`
 * with `isEnsProvenance`, then read the OBSERVED `external` (was a CCIP-Read gateway traversed?),
 * the `coinType`, and — for a chain-scoped result — `scopedToNetworkId`.
 *
 * Run (mainnet-bound):
 *   ENS_RPC_URL=https://your-mainnet-rpc pnpm tsx resolve.ts vitalik.eth
 *
 * If ENS_RPC_URL is unset, viem's default public mainnet transport is used (rate-limited).
 * A CCIP-Read (offchain / wildcard) name — e.g. one served by an off-chain gateway — will show
 * `external=true`; a plain on-chain name shows `external=false`. Both narrow under isEnsProvenance.
 */
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

import { createNameResolution, isEnsProvenance } from '@openzeppelin/adapter-evm-core';

// A minimal EVM network config. In a real adapter this comes from the runtime; here we hand-build
// the two fields the capability reads (`id` for error payloads + scopedToNetworkId; the client
// carries the chain).
const networkConfig = {
  id: 'ethereum-mainnet',
  // …the rest of your adapter's NetworkConfig fields…
} as never;

async function main(): Promise<void> {
  const name = process.argv[2] ?? 'vitalik.eth';

  // The bound viem client whose `chain` (mainnet) carries `contracts.ensUniversalResolver`.
  const publicClient = createPublicClient({
    chain: mainnet,
    transport: http(process.env.ENS_RPC_URL),
  });

  // Mainnet-bound: `ensL1Client` is not needed here (the bound chain already has a UR). See the
  // L1 cross-chain wiring block below for the L2-bound case.
  const cap = createNameResolution(networkConfig, { publicClient });

  if (!cap.isValidName(name)) {
    console.log(`${name}: not a resolvable ENS name (shape check failed)`);
    return;
  }

  const result = await cap.resolveName(name);

  if (!result.ok) {
    // A CCIP-Read gateway failure surfaces here as EXTERNAL_GATEWAY_ERROR — never a silent
    // fallback to a stale on-chain result.
    console.log(`${name}: ${result.error.code}`);
    return;
  }

  const { address, provenance } = result.value;
  console.log(`${name} → ${address}`);

  // Narrow on the `system` discriminant — NEVER on provenance.label.
  if (isEnsProvenance(provenance)) {
    console.log(`  system:           ${provenance.system}`); // always 'ens'
    console.log(`  external:         ${provenance.external}`); // OBSERVED CCIP-Read traversal
    console.log(`  coinType:         ${provenance.coinType}`); // 60 mainnet-bound; chain-specific when scoped
    console.log(`  scopedToNetworkId: ${provenance.scopedToNetworkId ?? '(unscoped mainnet)'}`);
    console.log(`  label:            ${provenance.label}`); // display only — do not branch on it
  }
}

void main();

/*
 * ── L1 cross-chain wiring (L2-bound runtime) ────────────────────────────────────────────────────
 *
 * ENS v2 is L1-only. To resolve ENS names from a runtime bound to an L2 (e.g. Base), wire the
 * optional `ensL1Client` — a dedicated MAINNET client. The capability then resolves the name on L1
 * with `coinType = toCoinType(boundChainId)`, and the success provenance carries `scopedToNetworkId`
 * so you can bind the address to the correct chain:
 *
 *   import { base, mainnet } from 'viem/chains';
 *
 *   const boundClient  = createPublicClient({ chain: base,    transport: http(BASE_RPC_URL) });
 *   const ensL1Client  = createPublicClient({ chain: mainnet, transport: http(MAINNET_RPC_URL) });
 *
 *   const cap = createNameResolution(baseNetworkConfig, {
 *     publicClient: boundClient,   // bound L2 client — has no Universal Resolver
 *     ensL1Client,                 // SF-5 — resolve chain-scoped on L1
 *   });
 *
 *   const r = await cap.resolveName('alice.eth');
 *   if (r.ok && isEnsProvenance(r.value.provenance)) {
 *     r.value.provenance.coinType;          // 2147492101 (Base's ENSIP-11 coinType)
 *     r.value.provenance.scopedToNetworkId; // your Base networkId — bind the address to Base
 *   }
 *
 * Omit `ensL1Client` and the same L2-bound resolve returns UNSUPPORTED_NETWORK (SF-2 parity) — the
 * L1 path is additive and gated.
 */
