/**
 * Forward-resolve an ENS name to an address through the EVM name-resolution capability.
 *
 * Demonstrates the full consumer loop against a REAL viem client on Ethereum mainnet:
 *   feature-detect → sync pre-check (`isValidName`) → async `resolveName` → switch on error.code
 *
 * Run:
 *   ENS_RPC_URL=https://your-mainnet-rpc pnpm tsx resolve.ts vitalik.eth
 *
 * If ENS_RPC_URL is unset, viem's default public mainnet transport is used (rate-limited;
 * fine for a demo, not for production).
 */
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

import { createNameResolution } from '@openzeppelin/adapter-evm-core';

// A minimal EVM network config. In a real adapter this comes from the runtime; here we hand-build
// the two fields the capability reads (`id` for error payloads; the client carries the chain).
const networkConfig = {
  id: 'ethereum-mainnet',
  // …the rest of your adapter's NetworkConfig fields…
} as never;

async function main(): Promise<void> {
  const name = process.argv[2] ?? 'vitalik.eth';

  // The viem client whose `chain` (mainnet) carries `contracts.ensUniversalResolver`.
  const publicClient = createPublicClient({
    chain: mainnet,
    transport: http(process.env.ENS_RPC_URL),
  });

  const cap = createNameResolution(networkConfig, { publicClient });

  // (1) cheap synchronous pre-check — no network round-trip
  if (!cap.isValidName(name)) {
    console.log(`${name}: not a resolvable ENS name (shape check failed)`);
    return;
  }

  // (2) the one async call — never throws for an expected failure
  const result = await cap.resolveName(name);

  if (result.ok) {
    console.log(`${name} → ${result.value.address}`);
    console.log(
      `  provenance: label=${result.value.provenance.label} external=${result.value.provenance.external}`
    );
    return;
  }

  // (3) switch on the code, never the message
  switch (result.error.code) {
    case 'NAME_NOT_FOUND':
      console.log(`${name}: no forward record`);
      break;
    case 'UNSUPPORTED_NETWORK':
      console.log(`network ${result.error.networkId} has no ENS Universal Resolver`);
      break;
    case 'UNSUPPORTED_NAME':
      console.log(`${name}: ${result.error.reason}`);
      break;
    case 'RESOLUTION_TIMEOUT':
      console.log(`${name}: timed out after ${result.error.elapsedMs}ms`);
      break;
    case 'EXTERNAL_GATEWAY_ERROR':
      console.log(`${name}: CCIP-Read gateway error — ${result.error.detail}`);
      break;
    case 'ADAPTER_ERROR':
      console.error(`${name}: unclassified error — ${result.error.message}`, result.error.cause);
      break;
    // 'ADDRESS_NOT_FOUND' is unreachable from resolveName (reverse-only, SF-3)
  }
}

void main();
