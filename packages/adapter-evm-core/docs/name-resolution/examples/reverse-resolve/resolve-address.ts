/**
 * Reverse-resolve an address to its verified ENS name (and avatar) through the EVM
 * name-resolution capability.
 *
 * Demonstrates the display-path consumer loop against a REAL viem client on Ethereum mainnet:
 *   feature-detect → async `resolveAddress` → switch on error.code
 *
 * The load-bearing property: a returned `name` is ALWAYS forward-verified (Approach A), so it is
 * safe to render directly. A forward-mismatch (a spoofed reverse record) is suppressed and comes
 * back as ADDRESS_NOT_FOUND — you never receive a mismatched name to guard against.
 *
 * Run:
 *   ENS_RPC_URL=https://your-mainnet-rpc pnpm tsx resolve-address.ts 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
 *
 * If ENS_RPC_URL is unset, viem's default public mainnet transport is used (rate-limited;
 * fine for a demo, not for production).
 */
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

import { createNameResolution } from '@openzeppelin/adapter-evm-core';

// A minimal EVM network config. In a real adapter this comes from the runtime; here we hand-build
// the one field the capability reads for error payloads (`id`); the client carries the chain.
const networkConfig = {
  id: 'ethereum-mainnet',
  // …the rest of your adapter's NetworkConfig fields…
} as never;

// vitalik.eth's address — has a well-known, forward-consistent reverse record.
const DEFAULT_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

async function main(): Promise<void> {
  const address = process.argv[2] ?? DEFAULT_ADDRESS;

  // The viem client whose `chain` (mainnet) carries `contracts.ensUniversalResolver`.
  const publicClient = createPublicClient({
    chain: mainnet,
    transport: http(process.env.ENS_RPC_URL),
  });

  const cap = createNameResolution(networkConfig, { publicClient });

  // resolveAddress is optional on the interface — feature-detect before calling.
  if (!cap.resolveAddress) {
    console.log('this adapter does not implement reverse resolution');
    return;
  }

  // The one async call — never throws for an expected failure.
  const result = await cap.resolveAddress(address);

  if (result.ok) {
    // result.value.name is already forward-verified (forwardVerified === true) — safe to render.
    console.log(`${address} → ${result.value.name}`);
    console.log(`  forwardVerified: ${result.value.forwardVerified}`); // always true on this adapter
    console.log(
      `  avatarUrl: ${result.value.avatarUrl ?? '(none — best-effort, absent is normal)'}`
    );
    console.log(
      `  provenance: label=${result.value.provenance.label} external=${result.value.provenance.external}`
    );
    return;
  }

  // switch on the code, never the message. Every reverse failure means "no verified name".
  switch (result.error.code) {
    case 'ADDRESS_NOT_FOUND':
      // No reverse record, OR a suppressed forward-mismatch — indistinguishable by design.
      console.log(`${address}: no verified ENS name — render truncated hex`);
      break;
    case 'UNSUPPORTED_NETWORK':
      console.log(`network ${result.error.networkId} has no ENS Universal Resolver`);
      break;
    case 'RESOLUTION_TIMEOUT':
      console.log(`${address}: reverse lookup timed out after ${result.error.elapsedMs}ms`);
      break;
    case 'EXTERNAL_GATEWAY_ERROR':
      console.log(`${address}: CCIP-Read gateway error — ${result.error.detail}`);
      break;
    case 'ADAPTER_ERROR':
      console.error(`${address}: unclassified error — ${result.error.message}`, result.error.cause);
      break;
    // 'NAME_NOT_FOUND' / 'UNSUPPORTED_NAME' are unreachable from resolveAddress (name-input codes)
  }
}

void main();
