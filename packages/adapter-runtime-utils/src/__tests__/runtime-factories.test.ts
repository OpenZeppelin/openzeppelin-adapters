import { describe, expect, it, vi } from 'vitest';

import type { CapabilityFactoryMap, NetworkConfig } from '@openzeppelin/ui-types';

import {
  createLazyRuntimeCapabilityFactories,
  type RuntimeCapabilityCreatorMap,
} from '../runtime-factories';

const mockNetworkConfig = {
  id: 'evm-testnet',
  exportConstName: 'evmTestnet',
  name: 'EVM Testnet',
  ecosystem: 'evm',
  network: 'ethereum',
  type: 'testnet',
  isTestnet: true,
  chainId: 11155111,
  rpcUrl: 'https://rpc.example.com',
  nativeCurrency: { name: 'Test Ether', symbol: 'TETH', decimals: 18 },
} as unknown as NetworkConfig;

function asCapability<K extends keyof CapabilityFactoryMap>(
  value: unknown
): ReturnType<NonNullable<CapabilityFactoryMap[K]>> {
  return value as ReturnType<NonNullable<CapabilityFactoryMap[K]>>;
}

describe('runtime-factories utilities', () => {
  it('caches tier-1 capabilities regardless of the optional config argument', () => {
    const creators: RuntimeCapabilityCreatorMap<NetworkConfig> = {
      addressing: vi.fn(() =>
        asCapability<'addressing'>({
          isValidAddress: () => true,
        })
      ),
    };

    const factories = createLazyRuntimeCapabilityFactories(mockNetworkConfig, creators);

    const first = factories.addressing!();
    const second = factories.addressing!(mockNetworkConfig);

    expect(first).toBe(second);
    expect(creators.addressing).toHaveBeenCalledTimes(1);
  });

  it('reuses cached dependencies between runtime capability creators', async () => {
    const creators: RuntimeCapabilityCreatorMap<NetworkConfig> = {
      contractLoading: vi.fn(() =>
        asCapability<'contractLoading'>({
          dispose: vi.fn(),
          getContractDefinitionInputs: () => [],
          loadContract: vi.fn().mockResolvedValue({ contractAddress: '0x1234' }),
        })
      ),
      query: vi.fn((_config: NetworkConfig, getCapability) =>
        asCapability<'query'>({
          contractLoading: getCapability('contractLoading'),
          dispose: vi.fn(),
          formatFunctionResult: (value: unknown) => value,
          getCurrentBlock: vi.fn().mockResolvedValue(1),
          queryViewFunction: vi.fn().mockResolvedValue('ok'),
        })
      ),
    };

    const factories = createLazyRuntimeCapabilityFactories(mockNetworkConfig, creators);

    const contractLoading = factories.contractLoading!(mockNetworkConfig);
    const query = factories.query!(mockNetworkConfig) as unknown as {
      contractLoading: typeof contractLoading;
    };

    expect(query.contractLoading).toBe(contractLoading);
    expect(creators.contractLoading).toHaveBeenCalledTimes(1);
    expect(creators.query).toHaveBeenCalledTimes(1);
  });

  it('returns undefined for capabilities that are not provided', () => {
    const factories = createLazyRuntimeCapabilityFactories(mockNetworkConfig, {});

    expect(factories.wallet).toBeUndefined();
    expect(factories.query).toBeUndefined();
    expect(factories.uiKit).toBeUndefined();
  });
});
