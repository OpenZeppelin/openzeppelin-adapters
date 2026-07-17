/**
 * Mocked 003 SF-3 reverse miss-fallback + SF-2 triplet: Sepolia bound-empty → L1 primary.
 *
 * Run (from this directory):
 *   pnpm tsx resolve-miss-fallback.ts
 */
import type { PublicClient } from 'viem';

import { createEvmNameResolutionService, isEnsProvenance } from '@openzeppelin/adapter-evm-core';
import type { ResolutionProvenance } from '@openzeppelin/ui-types';

const VITALIK = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

const sepoliaConfig = {
  id: 'ethereum-sepolia',
  chainId: 11155111,
} as never;

function isCrossNetworkFallback(
  provenance: Pick<ResolutionProvenance, 'resolvedViaNetworkFallback'>
): boolean {
  return provenance.resolvedViaNetworkFallback === true;
}

function visibleOnRow(scopedToNetworkId: string | undefined, rowNetworkId: string): boolean {
  if (scopedToNetworkId === undefined) return true;
  return scopedToNetworkId === rowNetworkId;
}

async function main(): Promise<void> {
  let l1Calls = 0;

  const boundClient = {
    chain: {
      id: 11155111,
      contracts: {
        ensUniversalResolver: { address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' },
      },
    },
    getEnsName: async () => null,
    getEnsAvatar: async () => null,
  } as unknown as PublicClient;

  const l1Client = {
    chain: {
      id: 1,
      contracts: {
        ensUniversalResolver: { address: '0x0000000000000000000000000000000000000001' },
      },
    },
    getEnsName: async () => {
      l1Calls += 1;
      return 'vitalik.eth';
    },
    getEnsAvatar: async () => 'https://example.com/avatar.png',
  } as unknown as PublicClient;

  const service = createEvmNameResolutionService(sepoliaConfig, boundClient, l1Client, {
    enableMainnetL1MissFallback: true,
  });
  const result = await service.resolveAddress(VITALIK);

  if (!result.ok) {
    console.error('unexpected failure', result.error);
    return;
  }

  const { name, provenance } = result.value;
  console.log(`Sepolia miss-fallback: ${VITALIK} → ${name}`);
  console.log(`  L1 getEnsName calls: ${l1Calls} (expect 1)`);
  console.log(`  scopedToNetworkId: ${provenance.scopedToNetworkId ?? '(absent — global gate)'}`);
  console.log(`  resolvedViaNetworkFallback: ${provenance.resolvedViaNetworkFallback}`);
  console.log(`  queriedOnNetworkId: ${provenance.queriedOnNetworkId}`);
  console.log(`  resolvedOnNetworkId: ${provenance.resolvedOnNetworkId}`);
  console.log(`  isCrossNetworkFallback: ${isCrossNetworkFallback(provenance)}`);
  console.log(`  isEnsProvenance: ${isEnsProvenance(provenance)} (enrichment only)`);
  console.log(`  show on Base row: ${visibleOnRow(provenance.scopedToNetworkId, 'base-mainnet')}`);
  console.log(
    `  show on Sepolia row: ${visibleOnRow(provenance.scopedToNetworkId, 'ethereum-sepolia')}`
  );
}

void main();
