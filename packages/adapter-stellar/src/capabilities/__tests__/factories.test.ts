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
import { stellarTestnet } from '../../networks';

const { connectStellarWalletMock, disconnectStellarWalletMock } = vi.hoisted(() => ({
  connectStellarWalletMock: vi.fn(),
  disconnectStellarWalletMock: vi.fn(),
}));

vi.mock('../../wallet', () => {
  const mockWalletImplementation = {
    getWalletConnectionStatus: () => ({
      isConnected: false,
      isConnecting: false,
      isDisconnected: true,
      isReconnecting: false,
      status: 'disconnected' as const,
      address: undefined,
      walletId: undefined,
      chainId: 'stellar-testnet',
    }),
    onWalletConnectionChange: () => () => {},
  };

  return {
    connectStellarWallet: connectStellarWalletMock,
    disconnectStellarWallet: disconnectStellarWalletMock,
    generateStellarWalletsKitExportables: vi.fn().mockResolvedValue({}),
    getInitializedStellarWalletImplementation: vi.fn(() => mockWalletImplementation),
    getResolvedWalletComponents: vi.fn(() => undefined),
    getStellarAvailableConnectors: vi.fn().mockResolvedValue([]),
    loadInitialConfigFromAppService: vi.fn(() => ({ kitName: 'custom', kitConfig: {} })),
    resolveFullUiKitConfiguration: vi.fn(async (config) => config),
    stellarFacadeHooks: {},
    stellarUiKitManager: {
      configure: vi.fn().mockResolvedValue(undefined),
      getState: vi.fn(() => ({ networkConfig: { id: 'stellar-testnet' } })),
      setNetworkConfig: vi.fn(),
    },
    StellarWalletUiRoot: () => null,
    supportsStellarWalletConnection: vi.fn(() => true),
  };
});

vi.mock('@creit.tech/stellar-wallets-kit', () => ({
  allowAllModules: vi.fn(() => []),
  StellarWalletsKit: class {
    async getSupportedWallets() {
      return [];
    }

    setWallet() {}

    async getAddress() {
      return { address: 'GBRPYHIL2C5UUPM7OQ6P6LON5AS7LQW7SWNN7LE6JQ2J6JQ5KTYJZVQY' };
    }

    async signTransaction() {
      return { signedTxXdr: 'signed-xdr' };
    }
  },
  WalletNetwork: {
    PUBLIC: 'PUBLIC',
    TESTNET: 'TESTNET',
  },
}));

describe('Stellar capability factories', () => {
  it('disposes standalone wallet capabilities safely', async () => {
    disconnectStellarWalletMock.mockResolvedValue(undefined);

    const capability: WalletCapability = createWallet(stellarTestnet);

    capability.dispose();

    expect(() => capability.disconnectWallet()).toThrow(RuntimeDisposedError);
    expect(() => capability.networkConfig).toThrow(RuntimeDisposedError);
    expect(disconnectStellarWalletMock).toHaveBeenCalledTimes(1);
  });

  it('creates an addressing capability', () => {
    const capability: AddressingCapability = createAddressing();
    expect(typeof capability.isValidAddress).toBe('function');
  });

  it('creates an explorer capability', () => {
    const capability: ExplorerCapability = createExplorer(stellarTestnet);
    expect(typeof capability.getExplorerUrl).toBe('function');
  });

  it('creates a network catalog capability', () => {
    const capability: NetworkCatalogCapability = createNetworkCatalog();
    expect(capability.getNetworks().length).toBeGreaterThan(0);
  });

  it('creates a ui labels capability', () => {
    const capability: UiLabelsCapability = createUiLabels();
    expect(typeof capability.getUiLabels).toBe('function');
  });

  it('creates a contract loading capability', () => {
    const capability: ContractLoadingCapability = createContractLoading(stellarTestnet);
    expect(typeof capability.loadContract).toBe('function');
  });

  it('creates a schema capability', () => {
    const capability: SchemaCapability = createSchema(stellarTestnet);
    expect(typeof capability.isViewFunction).toBe('function');
  });

  it('creates a type mapping capability', () => {
    const capability: TypeMappingCapability = createTypeMapping(stellarTestnet);
    expect(typeof capability.getTypeMappingInfo).toBe('function');
  });

  it('creates a query capability', () => {
    const capability: QueryCapability = createQuery(stellarTestnet);
    expect(typeof capability.queryViewFunction).toBe('function');
  });

  it('creates an execution capability', () => {
    const capability: ExecutionCapability = createExecution(stellarTestnet);
    expect(typeof capability.signAndBroadcast).toBe('function');
  });

  it('creates a wallet capability', () => {
    const capability: WalletCapability = createWallet(stellarTestnet);
    expect(typeof capability.connectWallet).toBe('function');
  });

  it('creates a ui kit capability', () => {
    const capability: UiKitCapability = createUiKit(stellarTestnet);
    expect(typeof capability.getAvailableUiKits).toBe('function');
  });

  it('creates a relayer capability', () => {
    const capability: RelayerCapability = createRelayer(stellarTestnet);
    expect(typeof capability.getRelayers).toBe('function');
  });

  it('creates an access control capability', () => {
    const capability: AccessControlCapability = createAccessControl(stellarTestnet);
    expect(typeof capability.registerContract).toBe('function');
  });
});
