import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  collectStaticDependencyGraph,
  findRestrictedDependencies,
} from '../../../../tests/helpers/tierIsolation';
import * as capabilities from '../capabilities';
import { stellarTestnet } from '../networks';
import { createRuntime } from '../profiles/shared-state';

vi.mock('../wallet', () => {
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
    connectStellarWallet: vi.fn(),
    disconnectStellarWallet: vi.fn(),
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

const packageRoot = process.cwd();
const workspaceRoot = resolve(packageRoot, '../..');
const restrictedPathPatterns = [
  'wallet/',
  'transaction/',
  'access-control/',
  'query/',
  'proxy/',
  'abi/',
  'contract/',
  'mapping/',
  'transform/',
  'configuration/rpc',
];
const tierOneEntries = [
  {
    publicSpecifier: '@openzeppelin/adapter-stellar/addressing',
    sourceFile: resolve(packageRoot, 'src/capabilities/addressing.ts'),
    factoryName: 'createAddressing',
  },
  {
    publicSpecifier: '@openzeppelin/adapter-stellar/explorer',
    sourceFile: resolve(packageRoot, 'src/capabilities/explorer.ts'),
    factoryName: 'createExplorer',
  },
  {
    publicSpecifier: '@openzeppelin/adapter-stellar/network-catalog',
    sourceFile: resolve(packageRoot, 'src/capabilities/network-catalog.ts'),
    factoryName: 'createNetworkCatalog',
  },
  {
    publicSpecifier: '@openzeppelin/adapter-stellar/ui-labels',
    sourceFile: resolve(packageRoot, 'src/capabilities/ui-labels.ts'),
    factoryName: 'createUiLabels',
  },
] as const;

const deferredFactoryCreators = {
  contractLoading: 'createContractLoading',
  schema: 'createSchema',
  typeMapping: 'createTypeMapping',
  query: 'createQuery',
  execution: 'createExecution',
  wallet: 'createWallet',
  uiKit: 'createUiKit',
  relayer: 'createRelayer',
  accessControl: 'createAccessControl',
} as const;

function spyOnDeferredFactories() {
  const spies = new Map<string, ReturnType<typeof vi.spyOn>>();

  for (const [key, creatorName] of Object.entries(deferredFactoryCreators)) {
    const spy = vi.spyOn(capabilities, creatorName);
    spies.set(key, spy);
  }

  return {
    spies,
    restore() {
      for (const spy of spies.values()) {
        spy.mockRestore();
      }
    },
  };
}

describe('Stellar Tier 1 isolation', () => {
  it.each(tierOneEntries)(
    'loads $publicSpecifier without Tier 2 or Tier 3 source dependencies',
    async ({ factoryName, publicSpecifier, sourceFile }) => {
      const importedModule = (await import(publicSpecifier)) as Record<string, unknown>;

      expect(importedModule[factoryName]).toEqual(expect.any(Function));

      const graph = collectStaticDependencyGraph({
        entryFile: sourceFile,
      });
      const { offendingFiles } = findRestrictedDependencies(graph, {
        workspaceRoot,
        restrictedPathPatterns,
      });

      expect(offendingFiles).toEqual([]);
    }
  );

  it('creates a declarative runtime without initializing deferred capabilities', () => {
    const trackedFactories = spyOnDeferredFactories();

    try {
      const runtime = createRuntime('declarative', stellarTestnet);

      expect(runtime.networkConfig).toBe(stellarTestnet);
      expect(runtime.addressing).toBeDefined();
      expect(runtime.explorer).toBeDefined();
      expect(runtime.networkCatalog).toBeDefined();
      expect(runtime.uiLabels).toBeDefined();
      expect(runtime.contractLoading).toBeUndefined();
      expect(runtime.schema).toBeUndefined();
      expect(runtime.typeMapping).toBeUndefined();
      expect(runtime.query).toBeUndefined();
      expect(runtime.execution).toBeUndefined();
      expect(runtime.wallet).toBeUndefined();
      expect(runtime.uiKit).toBeUndefined();
      expect(runtime.relayer).toBeUndefined();
      expect(runtime.accessControl).toBeUndefined();

      for (const key of Object.keys(deferredFactoryCreators)) {
        expect(trackedFactories.spies.get(key)).not.toHaveBeenCalled();
      }

      runtime.dispose();
    } finally {
      trackedFactories.restore();
    }
  });
});
