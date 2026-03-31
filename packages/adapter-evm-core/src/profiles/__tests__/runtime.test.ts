import { describe, expect, it, vi } from 'vitest';

import type {
  CapabilityFactoryMap,
  ContractLoadingCapability,
  ExecutionCapability,
  NetworkConfig,
  QueryCapability,
  SchemaCapability,
  TypeMappingCapability,
  UiKitCapability,
  WalletCapability,
} from '@openzeppelin/ui-types';
import { RuntimeDisposedError, UnsupportedProfileError } from '@openzeppelin/ui-types';

import { createRuntime } from '..';
import {
  registerRuntimeCapabilityCleanup,
  withRuntimeCapability,
} from '../../capabilities/helpers';
import type { TypedEvmNetworkConfig } from '../../types';

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
} as const satisfies TypedEvmNetworkConfig;

function createDeferredPromise<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, reject, resolve };
}

function createMockFactories(
  overrides: Partial<CapabilityFactoryMap> = {},
  hooks?: {
    cleanupSpies?: Partial<Record<'query' | 'wallet', ReturnType<typeof vi.fn>>>;
    configureUiKit?: ReturnType<typeof vi.fn>;
  }
): CapabilityFactoryMap {
  const networkConfig = mockNetworkConfig as unknown as NetworkConfig;

  const contractLoading = Object.assign(
    withRuntimeCapability(mockNetworkConfig, 'contractLoading'),
    {
      loadContract: vi.fn().mockResolvedValue({ functions: [] }),
      getContractDefinitionInputs: vi.fn(() => []),
    }
  ) as ContractLoadingCapability;

  const schema = Object.assign(withRuntimeCapability(mockNetworkConfig, 'schema'), {
    getWritableFunctions: vi.fn(() => []),
    isViewFunction: vi.fn(() => true),
  }) as SchemaCapability;

  const typeMapping = Object.assign(withRuntimeCapability(mockNetworkConfig, 'typeMapping'), {
    mapParameterTypeToFieldType: vi.fn(() => ({ type: 'text' })),
    getCompatibleFieldTypes: vi.fn(() => []),
    generateDefaultField: vi.fn(() => null),
    getTypeMappingInfo: vi.fn(() => []),
  }) as TypeMappingCapability;

  const query = Object.assign(withRuntimeCapability(mockNetworkConfig, 'query'), {
    queryViewFunction: vi.fn().mockResolvedValue('result'),
    formatFunctionResult: vi.fn((value) => value),
    getCurrentBlock: vi.fn().mockResolvedValue(123),
  }) as QueryCapability;

  const execution = Object.assign(withRuntimeCapability(mockNetworkConfig, 'execution'), {
    formatTransactionData: vi.fn().mockResolvedValue({}),
    signAndBroadcast: vi.fn().mockResolvedValue({ txHash: '0x1' }),
    getSupportedExecutionMethods: vi.fn().mockResolvedValue([]),
    validateExecutionConfig: vi.fn(() => true),
  }) as ExecutionCapability;

  const wallet = Object.assign(withRuntimeCapability(mockNetworkConfig, 'wallet'), {
    supportsWalletConnection: vi.fn(() => true),
    getAvailableConnectors: vi.fn().mockResolvedValue([]),
    connectWallet: vi.fn().mockResolvedValue(undefined),
    disconnectWallet: vi.fn().mockResolvedValue(undefined),
    getWalletConnectionStatus: vi.fn(() => ({ isConnected: false })),
  }) as WalletCapability;

  const uiKit = Object.assign(withRuntimeCapability(mockNetworkConfig, 'uiKit'), {
    configureUiKit: hooks?.configureUiKit ?? vi.fn().mockResolvedValue(undefined),
    getAvailableUiKits: vi.fn().mockResolvedValue([]),
  }) as UiKitCapability;

  if (hooks?.cleanupSpies?.query) {
    registerRuntimeCapabilityCleanup(query, hooks.cleanupSpies.query, 'rpc');
  }

  if (hooks?.cleanupSpies?.wallet) {
    registerRuntimeCapabilityCleanup(wallet, hooks.cleanupSpies.wallet, 'wallet');
  }

  return {
    addressing: vi.fn(() => ({
      isValidAddress: () => true,
    })),
    explorer: vi.fn(() => ({
      getExplorerUrl: () => null,
    })),
    networkCatalog: vi.fn(() => ({
      getNetworks: () => [networkConfig],
    })),
    uiLabels: vi.fn(() => ({
      getUiLabels: () => ({}),
    })),
    contractLoading: vi.fn(() => contractLoading),
    schema: vi.fn(() => schema),
    typeMapping: vi.fn(() => typeMapping),
    query: vi.fn(() => query),
    execution: vi.fn(() => execution),
    wallet: vi.fn(() => wallet),
    uiKit: vi.fn(() => uiKit),
    relayer: vi.fn(() =>
      Object.assign(withRuntimeCapability(mockNetworkConfig, 'relayer'), {
        getRelayers: vi.fn().mockResolvedValue([]),
        getRelayer: vi.fn().mockResolvedValue(null),
        getNetworkServiceForms: vi.fn(() => []),
        getDefaultServiceConfig: vi.fn(() => ({})),
      })
    ),
    accessControl: vi.fn(() =>
      Object.assign(withRuntimeCapability(mockNetworkConfig, 'accessControl'), {
        registerContract: vi.fn(),
        grantRole: vi.fn().mockResolvedValue({ id: '0x1' }),
      })
    ),
    ...overrides,
  };
}

describe('EVM core profile runtime lifecycle', () => {
  it('throws for invalid profile names', () => {
    expect(() =>
      createRuntime('invalid-profile' as never, mockNetworkConfig, createMockFactories())
    ).toThrow(TypeError);
  });

  it('throws when a required capability is missing', () => {
    const factories = createMockFactories({ query: undefined });

    expect(() => createRuntime('viewer', mockNetworkConfig, factories)).toThrow(
      UnsupportedProfileError
    );
  });

  it('configures the requested UI kit for profiles that expose one', () => {
    const configureUiKit = vi.fn().mockResolvedValue(undefined);
    const runtime = createRuntime(
      'composer',
      mockNetworkConfig,
      createMockFactories(
        {},
        {
          configureUiKit,
        }
      ),
      {
        uiKit: 'rainbowkit',
      }
    );

    expect(runtime.uiKit).toBeDefined();
    expect(configureUiKit).toHaveBeenCalledWith({
      kitName: 'rainbowkit',
      kitConfig: {},
    });
  });

  it('disposes runtimes idempotently and blocks capability access afterward', () => {
    const queryCleanup = vi.fn();
    const walletCleanup = vi.fn();
    const runtime = createRuntime(
      'operator',
      mockNetworkConfig,
      createMockFactories({}, { cleanupSpies: { query: queryCleanup, wallet: walletCleanup } })
    );

    runtime.dispose();
    runtime.dispose();

    expect(queryCleanup).toHaveBeenCalledTimes(1);
    expect(walletCleanup).toHaveBeenCalledTimes(1);
    expect(() => runtime.query?.getCurrentBlock()).toThrow(RuntimeDisposedError);
    expect(() => runtime.wallet?.networkConfig).toThrow(RuntimeDisposedError);
  });

  it('rejects pending capability work when the runtime is disposed', async () => {
    const deferred = createDeferredPromise<string>();
    const query = Object.assign(withRuntimeCapability(mockNetworkConfig, 'query'), {
      queryViewFunction: vi.fn(() => deferred.promise),
      formatFunctionResult: vi.fn((value) => value),
      getCurrentBlock: vi.fn().mockResolvedValue(123),
    }) as QueryCapability;
    const factories = createMockFactories({
      query: vi.fn(() => query),
    });

    const runtime = createRuntime('viewer', mockNetworkConfig, factories);
    const pendingQuery = runtime.query!.queryViewFunction('0x1234', 'balanceOf', []);

    runtime.dispose();

    await expect(pendingQuery).rejects.toBeInstanceOf(RuntimeDisposedError);
    deferred.reject(new Error('should be ignored after disposal'));
  });
});
