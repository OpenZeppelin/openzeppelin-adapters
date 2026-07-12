import { describe, expect, it, vi } from 'vitest';

import type { CapabilityFactoryMap, NetworkConfig } from '@openzeppelin/ui-types';

import { createRuntimeFromFactories } from '../profile-runtime';
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

/**
 * Follow-on regression to a3d5f82 (live ENS end-to-end): a3d5f82 fixed the CONSUMER
 * (`createRuntimeFromFactories`), but the lazy PRODUCER here dropped the `nameResolution` creator,
 * so `factories.nameResolution` was undefined on the composer runtime. These tests exercise the
 * LAZY producer AND the real composer assembly end to end (NOT a hand-built factory map), guarding
 * both surfaces together — the earlier smoke passed only because it bypassed this lazy layer.
 */
describe('nameResolution is wired through the lazy producer + composer assembly (a3d5f82 follow-on)', () => {
  const ENS_CAP = asCapability<'nameResolution'>({
    __sentinel: 'ens',
    isValidName: () => true,
    networkConfig: mockNetworkConfig,
  });

  // Every capability the composer profile requires, as trivial stubs, so real composer assembly
  // succeeds; `extra` layers on the capability under test (e.g. a nameResolution creator).
  const composerCreators = (
    extra: RuntimeCapabilityCreatorMap<NetworkConfig> = {}
  ): RuntimeCapabilityCreatorMap<NetworkConfig> => ({
    addressing: () => asCapability<'addressing'>({ isValidAddress: () => true }),
    explorer: () => asCapability<'explorer'>({ getExplorerUrl: () => null }),
    networkCatalog: () => asCapability<'networkCatalog'>({ getNetworks: () => [] }),
    uiLabels: () => asCapability<'uiLabels'>({ getUiLabels: () => ({}) }),
    contractLoading: () => asCapability<'contractLoading'>({ dispose() {} }),
    schema: () => asCapability<'schema'>({ dispose() {} }),
    typeMapping: () => asCapability<'typeMapping'>({ dispose() {} }),
    query: () => asCapability<'query'>({ dispose() {} }),
    execution: () => asCapability<'execution'>({ dispose() {} }),
    wallet: () => asCapability<'wallet'>({ dispose() {} }),
    uiKit: () => asCapability<'uiKit'>({ dispose() {} }),
    relayer: () => asCapability<'relayer'>({ dispose() {} }),
    ...extra,
  });

  it('unit: lazy producer surfaces nameResolution as a function when a creator is provided', () => {
    const factories = createLazyRuntimeCapabilityFactories(mockNetworkConfig, {
      nameResolution: () => ENS_CAP,
    });

    expect(typeof factories.nameResolution).toBe('function');
    expect(factories.nameResolution!(mockNetworkConfig)).toBe(ENS_CAP);
  });

  it('unit: lazy producer omits nameResolution when no creator is provided', () => {
    const factories = createLazyRuntimeCapabilityFactories(mockNetworkConfig, {});

    expect(factories.nameResolution).toBeUndefined();
  });

  it('e2e composer: lazy map → createRuntimeFromFactories exposes the built nameResolution capability', () => {
    const factories = createLazyRuntimeCapabilityFactories(
      mockNetworkConfig,
      composerCreators({ nameResolution: () => ENS_CAP })
    );

    const runtime = createRuntimeFromFactories('composer', mockNetworkConfig, factories);

    expect(runtime.nameResolution).toBeDefined();
    expect(runtime.nameResolution).toBe(ENS_CAP);
  });

  it('e2e composer: without a nameResolution creator, runtime.nameResolution is undefined and assembly does not throw', () => {
    const factories = createLazyRuntimeCapabilityFactories(mockNetworkConfig, composerCreators());

    let runtime: ReturnType<typeof createRuntimeFromFactories> | undefined;
    expect(() => {
      runtime = createRuntimeFromFactories('composer', mockNetworkConfig, factories);
    }).not.toThrow();

    expect(runtime?.nameResolution).toBeUndefined();
  });
});
