/**
 * Access Control Integration Tests for Polkadot Adapter
 *
 * Tests the full integration path: createAccessControl() → registerContract()
 * → getCapabilities() → getOwnership() → transferOwnership() with mocked RPC and indexer.
 *
 * Verifies:
 * - Lazy initialization: first call creates service, second returns same instance
 * - Service interface: all AccessControlService methods are exposed
 * - Callback wiring: executeTransaction wraps signAndBroadcast correctly
 * - Full flow: register → detect → read → write with mocked infrastructure
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EvmAccessControlService } from '@openzeppelin/adapter-evm-core';
import type {
  AccessControlCapability,
  AccessControlService,
  ContractFunction,
  ContractSchema,
  ExecutionConfig,
} from '@openzeppelin/ui-types';

import { createAccessControl } from '../capabilities/access-control';
import * as executionCapabilities from '../capabilities/execution';
import type { TypedPolkadotNetworkConfig } from '../types';

// ---------------------------------------------------------------------------
// Mock viem for RPC calls (shared by adapter-evm-core)
// ---------------------------------------------------------------------------

const mockReadContract = vi.fn();
const mockGetBlockNumber = vi.fn();

vi.mock('viem', async () => {
  const actual = await vi.importActual('viem');
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      readContract: mockReadContract,
      getBlockNumber: mockGetBlockNumber,
    })),
    http: vi.fn((url: string) => ({ url, type: 'http' })),
  };
});

// ---------------------------------------------------------------------------
// Mock wallet and UI modules to avoid real wallet/React dependencies
// ---------------------------------------------------------------------------

vi.mock('../wallet/hooks', () => ({
  loadInitialConfigFromAppService: () => ({ kitName: 'custom' }),
  polkadotFacadeHooks: {},
}));

vi.mock('../wallet/implementation', () => ({
  getPolkadotWalletImplementation: () => ({
    isReady: () => true,
    writeContract: vi.fn().mockResolvedValue('0xmocktxhash'),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: 'success' }),
  }),
}));

vi.mock('../wallet/polkadotUiKitManager', () => ({
  polkadotUiKitManager: {
    getState: () => ({ currentFullUiKitConfig: null }),
    configure: vi.fn(),
  },
}));

vi.mock('../wallet/PolkadotWalletUiRoot', () => ({
  PolkadotWalletUiRoot: undefined,
}));

vi.mock('../wallet/utils', () => ({
  polkadotSupportsWalletConnection: () => false,
  getPolkadotWalletConnectionStatus: () => ({
    isConnected: false,
    isConnecting: false,
    isDisconnected: true,
    isReconnecting: false,
    status: 'disconnected',
    address: undefined,
    chainId: undefined,
  }),
  getPolkadotAvailableConnectors: vi.fn().mockResolvedValue([]),
  connectAndEnsureCorrectNetwork: vi.fn(),
  disconnectPolkadotWallet: vi.fn(),
  onPolkadotWalletConnectionChange: vi.fn(),
  getResolvedWalletComponents: () => undefined,
}));

// ---------------------------------------------------------------------------
// Mock global fetch for indexer GraphQL calls
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createFunction(name: string, inputTypes: string[] = []): ContractFunction {
  return {
    id: name,
    name,
    displayName: name,
    type: 'function',
    inputs: inputTypes.map((type, i) => ({ name: `param${i}`, type })),
    outputs: [],
    modifiesState: false,
    stateMutability: 'view',
  };
}

function createSchema(functions: ContractFunction[]): ContractSchema {
  return {
    name: 'TestContract',
    ecosystem: 'evm',
    address: '0x1234567890123456789012345678901234567890',
    functions,
    events: [],
  };
}

/** Network config for integration tests */
const TEST_NETWORK_CONFIG: TypedPolkadotNetworkConfig = {
  id: 'polkadot-hub-testnet',
  exportConstName: 'polkadotHubTestnet',
  name: 'Polkadot Testnet',
  ecosystem: 'polkadot',
  network: 'polkadot-hub-testnet',
  type: 'testnet',
  isTestnet: true,
  chainId: 420420417,
  rpcUrl: 'https://services.polkadothub-rpc.com/testnet',
  explorerUrl: 'https://polkadot.testnet.routescan.io',
  apiUrl: 'https://api.routescan.io/v2/network/testnet/evm/420420417/etherscan/api',
  supportsEtherscanV2: false,
  nativeCurrency: { name: 'Paseo', symbol: 'PAS', decimals: 18 },
  executionType: 'evm',
  networkCategory: 'hub',
  relayChain: 'polkadot',
  accessControlIndexerUrl: 'https://test-indexer.example.com/graphql',
};

const CONTRACT_ADDRESS = '0x1234567890123456789012345678901234567890';
const OWNER_ADDRESS = '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const NEW_OWNER_ADDRESS = '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB';

/** Ownable2Step ABI functions for feature detection */
const OWNABLE_TWO_STEP_FUNCTIONS = [
  createFunction('owner', []),
  createFunction('pendingOwner', []),
  { ...createFunction('transferOwnership', ['address']), modifiesState: true },
  { ...createFunction('acceptOwnership', []), modifiesState: true },
  { ...createFunction('renounceOwnership', []), modifiesState: true },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Polkadot access control capability integration', () => {
  let accessControl: AccessControlCapability;

  beforeEach(() => {
    vi.clearAllMocks();
    accessControl = createAccessControl(TEST_NETWORK_CONFIG);

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    });
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // -------------------------------------------------------------------------
  // Lazy Initialization
  // -------------------------------------------------------------------------

  function getEvmService(): EvmAccessControlService {
    return accessControl as EvmAccessControlService;
  }

  describe('access control capability', () => {
    it('should return an AccessControlService with expected methods', () => {
      const service = getEvmService();

      expect(service).toBeDefined();
      expect(typeof service.registerContract).toBe('function');
      expect(typeof service.getCapabilities).toBe('function');
      expect(typeof service.getOwnership).toBe('function');
      expect(typeof service.transferOwnership).toBe('function');
    });

    it('should create distinct instances for distinct createAccessControl calls', () => {
      const first = createAccessControl(TEST_NETWORK_CONFIG);
      const second = createAccessControl(TEST_NETWORK_CONFIG);
      expect(first).not.toBe(second);
    });
  });

  // -------------------------------------------------------------------------
  // Service Interface Completeness
  // -------------------------------------------------------------------------

  describe('service interface', () => {
    it('should expose all AccessControlService methods', () => {
      const service = getEvmService();
      const expectedMethods = [
        'registerContract',
        'addKnownRoleIds',
        'getCapabilities',
        'getOwnership',
        'getAdminInfo',
        'getCurrentRoles',
        'getCurrentRolesEnriched',
        'transferOwnership',
        'acceptOwnership',
        'renounceOwnership',
        'transferAdminRole',
        'acceptAdminTransfer',
        'cancelAdminTransfer',
        'changeAdminDelay',
        'rollbackAdminDelay',
        'grantRole',
        'revokeRole',
        'renounceRole',
        'getHistory',
        'exportSnapshot',
        'discoverKnownRoleIds',
        'dispose',
      ];

      for (const method of expectedMethods) {
        expect(
          typeof (service as unknown as Record<string, unknown>)[method],
          `Expected method '${method}' to be a function`
        ).toBe('function');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Full Flow: Register → Detect → Read
  // -------------------------------------------------------------------------

  describe('full flow: register → capabilities → ownership', () => {
    it('should register a contract and detect Ownable2Step capabilities', async () => {
      const service = getEvmService();
      const schema = createSchema(OWNABLE_TWO_STEP_FUNCTIONS);

      await service.registerContract(CONTRACT_ADDRESS, schema);

      const capabilities = await service.getCapabilities(CONTRACT_ADDRESS);

      expect(capabilities).toBeDefined();
      expect(capabilities.hasOwnable).toBe(true);
      expect(capabilities.hasTwoStepOwnable).toBe(true);
      expect(capabilities.hasAccessControl).toBe(false);
      expect(capabilities.hasEnumerableRoles).toBe(false);
      expect(capabilities.hasTwoStepAdmin).toBe(false);
    });

    it('should query ownership state with mocked RPC', async () => {
      const service = getEvmService();
      const schema = createSchema(OWNABLE_TWO_STEP_FUNCTIONS);

      await service.registerContract(CONTRACT_ADDRESS, schema);

      mockReadContract
        .mockResolvedValueOnce(OWNER_ADDRESS) // owner()
        .mockResolvedValueOnce(ZERO_ADDRESS); // pendingOwner()

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({}),
      });

      const ownership = await service.getOwnership(CONTRACT_ADDRESS);

      expect(ownership).toBeDefined();
      expect(ownership.owner).toBe(OWNER_ADDRESS);
      expect(ownership.state).toBe('owned');
    });

    it('should detect renounced ownership (zero address)', async () => {
      const service = getEvmService();
      const schema = createSchema(OWNABLE_TWO_STEP_FUNCTIONS);

      await service.registerContract(CONTRACT_ADDRESS, schema);

      mockReadContract
        .mockResolvedValueOnce(ZERO_ADDRESS) // owner()
        .mockResolvedValueOnce(ZERO_ADDRESS); // pendingOwner()

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({}),
      });

      const ownership = await service.getOwnership(CONTRACT_ADDRESS);

      expect(ownership.state).toBe('renounced');
    });
  });

  // -------------------------------------------------------------------------
  // Execute Transaction Callback Wiring
  // -------------------------------------------------------------------------

  describe('executeTransaction callback', () => {
    it('should wire signAndBroadcast as the transaction executor', async () => {
      const innerExecution = executionCapabilities.createExecution(TEST_NETWORK_CONFIG);
      const signAndBroadcastSpy = vi
        .spyOn(innerExecution, 'signAndBroadcast')
        .mockResolvedValue({ txHash: '0xmocktxhash123' });

      const createExecutionSpy = vi
        .spyOn(executionCapabilities, 'createExecution')
        .mockReturnValue(innerExecution);

      const localAccess = createAccessControl(TEST_NETWORK_CONFIG);
      const service = localAccess as EvmAccessControlService;
      const schema = createSchema(OWNABLE_TWO_STEP_FUNCTIONS);

      await service.registerContract(CONTRACT_ADDRESS, schema);

      const mockExecutionConfig: ExecutionConfig = {
        method: 'eoa',
        allowAny: true,
      };

      const result = await service.transferOwnership(
        CONTRACT_ADDRESS,
        NEW_OWNER_ADDRESS,
        undefined,
        mockExecutionConfig
      );

      expect(signAndBroadcastSpy).toHaveBeenCalledTimes(1);
      const callArgs = signAndBroadcastSpy.mock.calls[0];
      expect(callArgs[0]).toHaveProperty('functionName', 'transferOwnership');
      expect(callArgs[0]).toHaveProperty('address', CONTRACT_ADDRESS);
      expect(callArgs[1]).toEqual(mockExecutionConfig);

      expect(result).toEqual({ id: '0xmocktxhash123' });

      createExecutionSpy.mockRestore();
      signAndBroadcastSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // AccessControlService type compatibility
  // -------------------------------------------------------------------------

  describe('type compatibility', () => {
    it('should be assignable to AccessControlService interface', () => {
      const service: AccessControlService = accessControl;
      expect(service).toBeDefined();
    });
  });
});
