import { describe, expect, it, vi } from 'vitest';

import type { CapabilityFactoryMap, NetworkConfig } from '@openzeppelin/ui-types';
import { UnsupportedProfileError } from '@openzeppelin/ui-types';

import {
  createRuntimeFromFactories,
  isProfileName,
  PROFILE_REQUIREMENTS,
} from '../profile-runtime';

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

function createFactories(overrides: Partial<CapabilityFactoryMap> = {}) {
  const contractLoadingDispose = vi.fn();
  const queryDispose = vi.fn();
  const walletDispose = vi.fn();
  const uiKitConfigure = vi.fn().mockResolvedValue(undefined);
  const uiKitDispose = vi.fn();

  const factories: CapabilityFactoryMap = {
    addressing: vi.fn(() =>
      asCapability<'addressing'>({
        isValidAddress: () => true,
      })
    ),
    explorer: vi.fn(() =>
      asCapability<'explorer'>({
        getExplorerUrl: () => null,
      })
    ),
    networkCatalog: vi.fn(() =>
      asCapability<'networkCatalog'>({
        getNetworks: () => [mockNetworkConfig],
      })
    ),
    uiLabels: vi.fn(() =>
      asCapability<'uiLabels'>({
        getUiLabels: () => ({}),
      })
    ),
    contractLoading: vi.fn(() =>
      asCapability<'contractLoading'>({
        dispose: contractLoadingDispose,
        getContractDefinitionInputs: () => [],
        loadContract: vi.fn().mockResolvedValue({}),
      })
    ),
    schema: vi.fn(() =>
      asCapability<'schema'>({
        dispose: vi.fn(),
        getWritableFunctions: () => [],
        isViewFunction: () => true,
      })
    ),
    typeMapping: vi.fn(() =>
      asCapability<'typeMapping'>({
        dispose: vi.fn(),
        generateDefaultField: () => null,
        getCompatibleFieldTypes: () => [],
        getTypeMappingInfo: () => [],
        mapParameterTypeToFieldType: () => ({ type: 'text' }),
      })
    ),
    query: vi.fn(() =>
      asCapability<'query'>({
        dispose: queryDispose,
        formatFunctionResult: (value: unknown) => value,
        getCurrentBlock: vi.fn().mockResolvedValue(1),
        queryViewFunction: vi.fn().mockResolvedValue('ok'),
      })
    ),
    execution: vi.fn(() =>
      asCapability<'execution'>({
        dispose: vi.fn(),
        formatTransactionData: vi.fn().mockResolvedValue({}),
        getSupportedExecutionMethods: vi.fn().mockResolvedValue([]),
        signAndBroadcast: vi.fn().mockResolvedValue({ txHash: '0x1' }),
        validateExecutionConfig: () => true,
      })
    ),
    wallet: vi.fn(() =>
      asCapability<'wallet'>({
        dispose: walletDispose,
        connectWallet: vi.fn().mockResolvedValue(undefined),
        disconnectWallet: vi.fn().mockResolvedValue(undefined),
        getAvailableConnectors: vi.fn().mockResolvedValue([]),
        getWalletConnectionStatus: () => ({ isConnected: false }),
        supportsWalletConnection: () => true,
      })
    ),
    uiKit: vi.fn(() =>
      asCapability<'uiKit'>({
        configureUiKit: uiKitConfigure,
        dispose: uiKitDispose,
        getAvailableUiKits: vi.fn().mockResolvedValue([]),
      })
    ),
    relayer: vi.fn(() =>
      asCapability<'relayer'>({
        dispose: vi.fn(),
        getDefaultServiceConfig: () => ({}),
        getNetworkServiceForms: () => [],
        getRelayer: vi.fn().mockResolvedValue(null),
        getRelayers: vi.fn().mockResolvedValue([]),
      })
    ),
    accessControl: vi.fn(() =>
      asCapability<'accessControl'>({
        dispose: vi.fn(),
        grantRole: vi.fn().mockResolvedValue({ id: '0x1' }),
        registerContract: vi.fn(),
      })
    ),
    ...overrides,
  };

  return {
    contractLoadingDispose,
    factories,
    queryDispose,
    uiKitConfigure,
    uiKitDispose,
    walletDispose,
  };
}

describe('profile-runtime utilities', () => {
  it('exposes the expected capability matrix', () => {
    expect(PROFILE_REQUIREMENTS.declarative).toEqual([
      'addressing',
      'explorer',
      'networkCatalog',
      'uiLabels',
    ]);
    expect(PROFILE_REQUIREMENTS.operator).toContain('accessControl');
  });

  it('recognizes valid profile names', () => {
    expect(isProfileName('composer')).toBe(true);
    expect(isProfileName('not-a-profile')).toBe(false);
  });

  it('throws an UnsupportedProfileError when required capabilities are missing', () => {
    const { factories } = createFactories({ query: undefined });

    expect(() => createRuntimeFromFactories('viewer', mockNetworkConfig, factories)).toThrow(
      UnsupportedProfileError
    );
  });

  it('disposes only instantiated capabilities and stays idempotent', () => {
    const { contractLoadingDispose, factories, queryDispose } = createFactories();
    const runtime = createRuntimeFromFactories('viewer', mockNetworkConfig, factories);

    runtime.dispose();
    runtime.dispose();

    expect(contractLoadingDispose).toHaveBeenCalledTimes(1);
    expect(queryDispose).toHaveBeenCalledTimes(1);
  });

  it('configures the selected ui kit when options are provided', () => {
    const { factories, uiKitConfigure, uiKitDispose } = createFactories();
    const runtime = createRuntimeFromFactories('composer', mockNetworkConfig, factories, {
      uiKit: 'custom',
    });

    expect(uiKitConfigure).toHaveBeenCalledWith({
      kitName: 'custom',
      kitConfig: {},
    });

    runtime.dispose();
    expect(uiKitDispose).toHaveBeenCalledTimes(1);
  });
});
