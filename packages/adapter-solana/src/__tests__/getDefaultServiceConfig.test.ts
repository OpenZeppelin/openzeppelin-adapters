import { describe, expect, it } from 'vitest';

import type { SolanaNetworkConfig } from '@openzeppelin/ui-types';

import { createRelayer } from '../capabilities/relayer';

describe('createRelayer().getDefaultServiceConfig', () => {
  const createMockNetworkConfig = (
    overrides: Partial<SolanaNetworkConfig> = {}
  ): SolanaNetworkConfig =>
    ({
      id: 'solana-mainnet',
      exportConstName: 'solanaMainnet',
      name: 'Solana Mainnet',
      ecosystem: 'solana',
      network: 'mainnet-beta',
      type: 'mainnet',
      isTestnet: false,
      rpcEndpoint: 'https://api.mainnet-beta.solana.com',
      ...overrides,
    }) as SolanaNetworkConfig;

  describe('rpc service', () => {
    it('should return RPC config when rpcEndpoint is present', () => {
      const networkConfig = createMockNetworkConfig();
      const relayer = createRelayer(networkConfig);

      const result = relayer.getDefaultServiceConfig('rpc');

      expect(result).toEqual({
        rpcEndpoint: 'https://api.mainnet-beta.solana.com',
      });
    });

    it('should return null when rpcEndpoint is missing', () => {
      const networkConfig = createMockNetworkConfig({
        rpcEndpoint: undefined,
      });
      const relayer = createRelayer(networkConfig);

      const result = relayer.getDefaultServiceConfig('rpc');

      expect(result).toBeNull();
    });
  });

  describe('unknown service', () => {
    it('should return null for unknown service IDs', () => {
      const networkConfig = createMockNetworkConfig();
      const relayer = createRelayer(networkConfig);

      expect(relayer.getDefaultServiceConfig('explorer')).toBeNull();
      expect(relayer.getDefaultServiceConfig('indexer')).toBeNull();
      expect(relayer.getDefaultServiceConfig('unknown')).toBeNull();
    });
  });
});
