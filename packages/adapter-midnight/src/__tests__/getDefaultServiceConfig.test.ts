import { describe, expect, it } from 'vitest';

import type { MidnightNetworkConfig } from '@openzeppelin/ui-types';

import { createRelayer } from '../capabilities/relayer';

describe('createRelayer().getDefaultServiceConfig', () => {
  const createMockNetworkConfig = (
    overrides: Partial<MidnightNetworkConfig> = {}
  ): MidnightNetworkConfig => ({
    id: 'midnight-testnet',
    exportConstName: 'midnightTestnet',
    name: 'Midnight Testnet',
    ecosystem: 'midnight',
    network: 'midnight-testnet',
    type: 'testnet',
    isTestnet: true,
    networkId: { 2: 'TestNet' },
    rpcEndpoints: { default: 'https://rpc.testnet.midnight.network' },
    indexerUri: 'https://indexer.testnet.midnight.network/api/v1/graphql',
    indexerWsUri: 'wss://indexer.testnet.midnight.network/api/v1/graphql/ws',
    ...overrides,
  });

  describe('indexer service', () => {
    it('should return indexer config when both URLs are present', () => {
      const networkConfig = createMockNetworkConfig();
      const relayer = createRelayer(networkConfig);

      const result = relayer.getDefaultServiceConfig('indexer');

      expect(result).toEqual({
        httpUrl: 'https://indexer.testnet.midnight.network/api/v1/graphql',
        wsUrl: 'wss://indexer.testnet.midnight.network/api/v1/graphql/ws',
      });
    });

    it('should return null when indexerUri is missing', () => {
      const networkConfig = createMockNetworkConfig({
        indexerUri: undefined,
      });
      const relayer = createRelayer(networkConfig);

      const result = relayer.getDefaultServiceConfig('indexer');

      expect(result).toBeNull();
    });

    it('should return null when indexerWsUri is missing', () => {
      const networkConfig = createMockNetworkConfig({
        indexerWsUri: undefined,
      });
      const relayer = createRelayer(networkConfig);

      const result = relayer.getDefaultServiceConfig('indexer');

      expect(result).toBeNull();
    });
  });

  describe('unknown service', () => {
    it('should return null for unknown service IDs', () => {
      const networkConfig = createMockNetworkConfig();
      const relayer = createRelayer(networkConfig);

      expect(relayer.getDefaultServiceConfig('rpc')).toBeNull();
      expect(relayer.getDefaultServiceConfig('explorer')).toBeNull();
      expect(relayer.getDefaultServiceConfig('unknown')).toBeNull();
    });
  });
});
