import { afterEach, describe, expect, it, vi } from 'vitest';

import * as evmCore from '@openzeppelin/adapter-evm-core';

import { getPolkadotDefaultServiceConfig } from '../evm/configuration/network-services';
import type { TypedPolkadotNetworkConfig } from '../types';

vi.mock('@openzeppelin/adapter-evm-core', async (importOriginal) => {
  const actual = await importOriginal<typeof evmCore>();
  return {
    ...actual,
    resolveExplorerApiKeyFromAppConfig: vi.fn(() => undefined),
  };
});

const mockResolveApiKey = vi.mocked(evmCore.resolveExplorerApiKeyFromAppConfig);

describe('getPolkadotDefaultServiceConfig', () => {
  const createMockNetworkConfig = (
    overrides: Partial<TypedPolkadotNetworkConfig> = {}
  ): TypedPolkadotNetworkConfig => ({
    id: 'moonbeam',
    exportConstName: 'moonbeam',
    name: 'Moonbeam',
    ecosystem: 'polkadot',
    network: 'moonbeam',
    type: 'mainnet',
    isTestnet: false,
    chainId: 1284,
    rpcUrl: 'https://rpc.api.moonbeam.network',
    explorerUrl: 'https://moonbeam.moonscan.io',
    apiUrl: 'https://api.etherscan.io/v2/api',
    supportsEtherscanV2: true,
    networkCategory: 'parachain',
    executionType: 'evm',
    relayChain: 'polkadot',
    nativeCurrency: {
      name: 'Glimmer',
      symbol: 'GLMR',
      decimals: 18,
    },
    ...overrides,
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('rpc service', () => {
    it('should return RPC config when rpcUrl is present', () => {
      const networkConfig = createMockNetworkConfig();

      const result = getPolkadotDefaultServiceConfig(networkConfig, 'rpc');

      expect(result).toEqual({
        rpcUrl: 'https://rpc.api.moonbeam.network',
      });
    });

    it('should return null when rpcUrl is missing', () => {
      const networkConfig = createMockNetworkConfig({
        rpcUrl: undefined,
      });

      const result = getPolkadotDefaultServiceConfig(networkConfig, 'rpc');

      expect(result).toBeNull();
    });
  });

  describe('explorer service', () => {
    it('should return explorer config with explorerUrl and apiUrl when present', () => {
      const networkConfig = createMockNetworkConfig();

      const result = getPolkadotDefaultServiceConfig(networkConfig, 'explorer');

      expect(result).toEqual({
        explorerUrl: 'https://moonbeam.moonscan.io',
        apiUrl: 'https://api.etherscan.io/v2/api',
      });
    });

    it('should include API key when resolveExplorerApiKeyFromAppConfig returns one', () => {
      mockResolveApiKey.mockReturnValue('test-v2-api-key');

      const networkConfig = createMockNetworkConfig({
        supportsEtherscanV2: true,
        primaryExplorerApiIdentifier: 'etherscan-v2',
      });

      const result = getPolkadotDefaultServiceConfig(networkConfig, 'explorer');

      expect(result).toEqual({
        explorerUrl: 'https://moonbeam.moonscan.io',
        apiUrl: 'https://api.etherscan.io/v2/api',
        apiKey: 'test-v2-api-key',
      });
      expect(mockResolveApiKey).toHaveBeenCalledWith(networkConfig);
    });

    it('should include API key for Hub networks', () => {
      mockResolveApiKey.mockReturnValue('test-routescan-key');

      const networkConfig = createMockNetworkConfig({
        supportsEtherscanV2: false,
        primaryExplorerApiIdentifier: 'routescan',
        networkCategory: 'hub',
      });

      const result = getPolkadotDefaultServiceConfig(networkConfig, 'explorer');

      expect(result).toEqual({
        explorerUrl: 'https://moonbeam.moonscan.io',
        apiUrl: 'https://api.etherscan.io/v2/api',
        apiKey: 'test-routescan-key',
      });
    });

    it('should omit apiKey when resolver returns undefined', () => {
      mockResolveApiKey.mockReturnValue(undefined);

      const networkConfig = createMockNetworkConfig({
        supportsEtherscanV2: false,
        primaryExplorerApiIdentifier: 'blockscout',
      });

      const result = getPolkadotDefaultServiceConfig(networkConfig, 'explorer');

      expect(result).toEqual({
        explorerUrl: 'https://moonbeam.moonscan.io',
        apiUrl: 'https://api.etherscan.io/v2/api',
      });
    });

    it('should return null when explorerUrl is missing and no API key configured', () => {
      const networkConfig = createMockNetworkConfig({
        explorerUrl: undefined,
        apiUrl: undefined,
      });

      const result = getPolkadotDefaultServiceConfig(networkConfig, 'explorer');

      expect(result).toBeNull();
    });

    it('should return config with API key when explorerUrl is missing but API key is available', () => {
      mockResolveApiKey.mockReturnValue('test-api-key-only');

      const networkConfig = createMockNetworkConfig({
        explorerUrl: undefined,
        apiUrl: undefined,
        supportsEtherscanV2: true,
        primaryExplorerApiIdentifier: 'etherscan-v2',
      });

      const result = getPolkadotDefaultServiceConfig(networkConfig, 'explorer');

      expect(result).toEqual({
        explorerUrl: undefined,
        apiUrl: undefined,
        apiKey: 'test-api-key-only',
      });
    });
  });

  describe('contract-definitions service', () => {
    it('should return null for contract-definitions service', () => {
      const networkConfig = createMockNetworkConfig();

      const result = getPolkadotDefaultServiceConfig(networkConfig, 'contract-definitions');

      expect(result).toBeNull();
    });
  });

  describe('unknown service', () => {
    it('should return null for unknown service IDs', () => {
      const networkConfig = createMockNetworkConfig();

      expect(getPolkadotDefaultServiceConfig(networkConfig, 'indexer')).toBeNull();
      expect(getPolkadotDefaultServiceConfig(networkConfig, 'unknown')).toBeNull();
    });
  });
});
