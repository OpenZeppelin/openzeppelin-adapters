import { describe, expect, it, vi } from 'vitest';

import type {
  AccessControlCapability,
  AddressingCapability,
  ContractLoadingCapability,
  ExecutionCapability,
  ExplorerCapability,
  NetworkCatalogCapability,
  QueryCapability,
  RelayerCapability,
  SchemaCapability,
  TypeMappingCapability,
  UiKitCapability,
  UiLabelsCapability,
  WalletCapability,
} from '@openzeppelin/ui-types';
import { RuntimeDisposedError } from '@openzeppelin/ui-types';

import {
  createAccessControl,
  createAddressing,
  createContractLoading,
  createExecution,
  createExplorer,
  createNetworkCatalog,
  createQuery,
  createRelayer,
  createSchema,
  createTypeMapping,
  createUiKit,
  createUiLabels,
  createWallet,
} from '..';

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
} as const;

function createDeferredPromise<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, reject, resolve };
}

describe('EVM core capability factories', () => {
  it('creates an addressing capability', () => {
    const capability: AddressingCapability = createAddressing();
    expect(typeof capability.isValidAddress).toBe('function');
  });

  it('creates an explorer capability', () => {
    const capability: ExplorerCapability = createExplorer(mockNetworkConfig);
    expect(typeof capability.getExplorerUrl).toBe('function');
  });

  it('creates a network catalog capability', () => {
    const capability: NetworkCatalogCapability = createNetworkCatalog([mockNetworkConfig]);
    expect(capability.getNetworks()).toHaveLength(1);
  });

  it('creates a ui labels capability', () => {
    const capability: UiLabelsCapability = createUiLabels();
    expect(typeof capability.getUiLabels).toBe('function');
  });

  it('creates a contract loading capability', () => {
    const capability: ContractLoadingCapability = createContractLoading(mockNetworkConfig);
    expect(typeof capability.loadContract).toBe('function');
    expect(typeof capability.getContractDefinitionInputs).toBe('function');
  });

  it('creates a schema capability', () => {
    const capability: SchemaCapability = createSchema(mockNetworkConfig);
    expect(typeof capability.isViewFunction).toBe('function');
  });

  it('creates a type mapping capability', () => {
    const capability: TypeMappingCapability = createTypeMapping(mockNetworkConfig);
    expect(typeof capability.getTypeMappingInfo).toBe('function');
  });

  it('creates a query capability', () => {
    const capability: QueryCapability = createQuery(mockNetworkConfig, {
      loadContract: vi.fn().mockResolvedValue({ functions: [], events: [] }),
    });
    expect(typeof capability.queryViewFunction).toBe('function');
  });

  it('creates an execution capability', () => {
    const capability: ExecutionCapability = createExecution(mockNetworkConfig, {
      getWalletImplementation: vi.fn().mockResolvedValue({}),
      getWalletConnectionStatus: vi.fn().mockReturnValue({ isConnected: false }),
    });
    expect(typeof capability.signAndBroadcast).toBe('function');
  });

  it('creates a wallet capability', () => {
    const capability: WalletCapability = createWallet(mockNetworkConfig, {
      connectWallet: vi.fn().mockResolvedValue({ connected: true }),
      disconnectWallet: vi.fn().mockResolvedValue({ disconnected: true }),
      getAvailableConnectors: vi.fn().mockResolvedValue([]),
      getWalletConnectionStatus: vi.fn().mockReturnValue({ isConnected: false }),
    });
    expect(typeof capability.connectWallet).toBe('function');
  });

  it('creates a ui kit capability', () => {
    const capability: UiKitCapability = createUiKit(mockNetworkConfig);
    expect(typeof capability.getAvailableUiKits).toBe('function');
  });

  it('initializes a ui kit from partial defaults', async () => {
    const onConfigureUiKit = vi.fn().mockResolvedValue(undefined);
    const capability: UiKitCapability = createUiKit(mockNetworkConfig, {
      loadCurrentUiKitConfig: () => ({
        kitName: 'custom',
        kitConfig: {
          showInjectedConnector: false,
        },
      }),
      onConfigureUiKit,
    });

    await capability.configureUiKit?.({});

    expect(onConfigureUiKit).toHaveBeenCalledWith({
      kitName: 'custom',
      kitConfig: {
        showInjectedConnector: false,
      },
      customCode: undefined,
    });
  });

  it('merges partial ui kit overrides with the active defaults', async () => {
    const onConfigureUiKit = vi.fn().mockResolvedValue(undefined);
    const capability: UiKitCapability = createUiKit(mockNetworkConfig, {
      loadCurrentUiKitConfig: () => ({
        kitName: 'custom',
        kitConfig: {
          showInjectedConnector: false,
        },
      }),
      onConfigureUiKit,
    });

    await capability.configureUiKit?.({
      kitConfig: {
        showInjectedConnector: true,
      },
    });

    expect(onConfigureUiKit).toHaveBeenCalledWith({
      kitName: 'custom',
      kitConfig: {
        showInjectedConnector: true,
      },
      customCode: undefined,
    });
  });

  it('creates a relayer capability', () => {
    const capability: RelayerCapability = createRelayer(mockNetworkConfig);
    expect(typeof capability.getRelayers).toBe('function');
    expect(typeof capability.getNetworkServiceForms).toBe('function');
  });

  it('creates an access control capability', () => {
    const capability: AccessControlCapability = createAccessControl(mockNetworkConfig, {
      signAndBroadcast: vi.fn().mockResolvedValue({ txHash: '0x1' }),
    });
    expect(typeof capability.registerContract).toBe('function');
    expect(typeof capability.dispose).toBe('function');
  });

  it('disposes standalone wallet capabilities safely', async () => {
    const connectDeferred = createDeferredPromise<{ connected: boolean }>();
    const disconnectWallet = vi.fn().mockResolvedValue({ disconnected: true });
    const capability: WalletCapability = createWallet(mockNetworkConfig, {
      connectWallet: vi.fn(() => connectDeferred.promise),
      disconnectWallet,
      getAvailableConnectors: vi.fn().mockResolvedValue([]),
      getWalletConnectionStatus: vi.fn().mockReturnValue({ isConnected: false }),
    });

    const pendingConnection = capability.connectWallet('injected');

    capability.dispose();

    await expect(pendingConnection).rejects.toBeInstanceOf(RuntimeDisposedError);
    expect(() => capability.networkConfig).toThrow(RuntimeDisposedError);
    expect(disconnectWallet).toHaveBeenCalledTimes(1);
    connectDeferred.reject(new Error('ignored after disposal'));
  });
});
