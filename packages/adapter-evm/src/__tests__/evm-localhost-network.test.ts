import { NetworkEthereum } from '@web3icons/react';
import { describe, expect, it } from 'vitest';

import { createExplorer } from '../capabilities/explorer';
import { createNetworkCatalog } from '../capabilities/network-catalog';
import * as networksEntry from '../networks';
import {
  evmLocalhost,
  evmMainnetNetworks,
  evmNetworks,
  evmTestnetNetworks,
  networks,
} from '../networks';

/**
 * SF-1 evm-localhost-network-config.
 *
 * Invariants (from 04-code-draft.md / 00-specify.md):
 *  - INV-A  Config content: chain 31337, default local RPC, testnet, no explorer.
 *  - INV-B  Opt-in isolation: never present in any shared list / catalog / ecosystem definition
 *           (SC-003). A contributor appending it to a list must fail these tests.
 *  - INV-C  Export surface: reachable from both the networks entry and the package root, as the
 *           same object.
 *  - INV-D  Explorer links resolve to "no link", never throw.
 */

const LOCAL_ID = 'evm-localhost';
const LOCAL_CHAIN_ID = 31337;

function sharedListSnapshots() {
  return {
    evmMainnetNetworks,
    evmTestnetNetworks,
    evmNetworks,
    'networks alias': networks,
    'catalog.getNetworks()': createNetworkCatalog().getNetworks(),
  } as const;
}

describe('evmLocalhost — config content (INV-A)', () => {
  it('INV-A: identifies as EVM chain 31337', () => {
    expect(evmLocalhost.ecosystem).toBe('evm');
    expect(evmLocalhost.id).toBe(LOCAL_ID);
    expect(evmLocalhost.chainId).toBe(LOCAL_CHAIN_ID);
    expect(evmLocalhost.viemChain?.id).toBe(LOCAL_CHAIN_ID);
  });

  it('INV-A: carries the Ethereum icon so network pickers do not fall back to a grey dot', () => {
    expect(evmLocalhost.iconComponent).toBe(NetworkEthereum);
  });

  it('INV-A: is flagged as a testnet in both flag fields', () => {
    expect(evmLocalhost.isTestnet).toBe(true);
    expect(evmLocalhost.type).toBe('testnet');
  });

  it('INV-A: points at the default local RPC and is a valid loopback http URL', () => {
    expect(evmLocalhost.rpcUrl).toBe('http://127.0.0.1:8545');
    const url = new URL(evmLocalhost.rpcUrl);
    expect(url.protocol).toBe('http:');
    expect(['127.0.0.1', 'localhost']).toContain(url.hostname);
  });

  it('INV-A (boundary): has no explorer fields and no placeholder explorer', () => {
    expect(evmLocalhost.explorerUrl).toBeUndefined();
    expect(evmLocalhost.apiUrl).toBeUndefined();
    expect(evmLocalhost.supportsEtherscanV2).toBeUndefined();
  });

  it('INV-A: carries a native currency consistent with its viem chain', () => {
    expect(evmLocalhost.nativeCurrency).toEqual({ name: 'Ether', symbol: 'ETH', decimals: 18 });
    expect(evmLocalhost.nativeCurrency).toEqual(evmLocalhost.viemChain?.nativeCurrency);
  });
});

describe('evmLocalhost — opt-in isolation (INV-B)', () => {
  it.each(Object.entries(sharedListSnapshots()))(
    'INV-B: %s contains neither chain 31337 nor the localhost id',
    (_label, list) => {
      expect(list.map((n) => n.id)).not.toContain(LOCAL_ID);
      expect(
        list.filter((n) => 'chainId' in n && (n as { chainId?: number }).chainId === LOCAL_CHAIN_ID)
      ).toHaveLength(0);
      expect(list).not.toContain(evmLocalhost);
    }
  );

  it('INV-B: the combined list is exactly mainnets + testnets (no third source)', () => {
    expect(evmNetworks).toEqual([...evmMainnetNetworks, ...evmTestnetNetworks]);
    expect(networks).toBe(evmNetworks);
  });

  it('INV-B: every id in the shared list is unique and none is a localhost-flavoured network', () => {
    const ids = evmNetworks.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(evmNetworks.every((n) => (n as { chainId?: number }).chainId !== LOCAL_CHAIN_ID)).toBe(
      true
    );
  });

  it('INV-B: the wagmi-relevant chain set (viemChain ids of the shared list) excludes 31337', () => {
    // Mirrors wagmi-implementation's getSupportedChainsFromNetworks, which reads only evmNetworks.
    const chainIds = evmNetworks.filter((n) => n.viemChain).map((n) => n.viemChain!.id);
    expect(chainIds).not.toContain(LOCAL_CHAIN_ID);
  });
});

describe('evmLocalhost — export surface (INV-C)', () => {
  // The package root (src/index.ts) needs build-time defines (__OZ_PEER_MINIMUMS__), so the root
  // export and ecosystemDefinition.networks are verified against built dist by the proof script.
  it('INV-C: networks-entry namespace export is the same object as the named export', () => {
    expect(networksEntry.evmLocalhost).toBe(evmLocalhost);
  });

  it('INV-C: networks entry adds exactly one new named export for it, nothing else list-shaped', () => {
    const listLikeExports = Object.entries(networksEntry)
      .filter(([, v]) => Array.isArray(v))
      .map(([k]) => k)
      .sort();
    expect(listLikeExports).toEqual(
      ['evmMainnetNetworks', 'evmNetworks', 'evmTestnetNetworks', 'networks'].sort()
    );
  });
});

describe('evmLocalhost — explorer behaviour (INV-D)', () => {
  const address = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
  const txHash = `0x${'ab'.repeat(32)}`;

  it('INV-D: address and tx links resolve to null instead of throwing', () => {
    const explorer = createExplorer(evmLocalhost);
    expect(explorer.getExplorerUrl(address)).toBeNull();
    expect(explorer.getExplorerTxUrl?.(txHash)).toBeNull();
  });

  it('INV-D (regression): a network WITH an explorer still produces links (the null is not global)', () => {
    const explorer = createExplorer(networksEntry.ethereumSepolia);
    expect(explorer.getExplorerUrl(address)).toContain(address);
  });
});
