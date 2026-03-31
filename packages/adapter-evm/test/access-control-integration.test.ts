import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  EvmAccessControlService,
  TypedEvmNetworkConfig,
} from '@openzeppelin/adapter-evm-core';
import type {
  AccessControlService,
  ContractFunction,
  ContractSchema,
  ExecutionConfig,
} from '@openzeppelin/ui-types';

import { createAccessControl } from '../src/capabilities/access-control';

const mockReadContract = vi.fn();
const mockGetBlockNumber = vi.fn();
const mockSignAndBroadcast = vi.fn();

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

vi.mock('../src/capabilities/execution', () => ({
  createExecution: vi.fn(() => ({
    signAndBroadcast: mockSignAndBroadcast,
  })),
}));

const mockFetch = vi.fn();

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

const TEST_NETWORK_CONFIG = {
  id: 'ethereum-sepolia',
  exportConstName: 'ethereumSepolia',
  name: 'Sepolia',
  ecosystem: 'evm',
  network: 'ethereum',
  type: 'testnet',
  isTestnet: true,
  chainId: 11155111,
  rpcUrl: 'https://rpc.sepolia.example.com',
  explorerUrl: 'https://sepolia.etherscan.io',
  apiUrl: 'https://api.etherscan.io/v2/api',
  primaryExplorerApiIdentifier: 'etherscan-v2',
  supportsEtherscanV2: true,
  nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
  accessControlIndexerUrl: 'https://openzeppelin-ethereum-sepolia.graphql.subquery.network/',
} as TypedEvmNetworkConfig;

const CONTRACT_ADDRESS = '0x1234567890123456789012345678901234567890';
const OWNER_ADDRESS = '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa';
const NEW_OWNER_ADDRESS = '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const OWNABLE_TWO_STEP_FUNCTIONS = [
  createFunction('owner', []),
  createFunction('pendingOwner', []),
  { ...createFunction('transferOwnership', ['address']), modifiesState: true },
  { ...createFunction('acceptOwnership', []), modifiesState: true },
  { ...createFunction('renounceOwnership', []), modifiesState: true },
];

describe('EVM Access Control Capability Integration', () => {
  let service: EvmAccessControlService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = createAccessControl(TEST_NETWORK_CONFIG) as EvmAccessControlService;
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    });
    vi.stubGlobal('fetch', mockFetch);
    mockSignAndBroadcast.mockResolvedValue({ txHash: '0xmocktxhash123' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('exposes the access control service contract', () => {
    const typedService: AccessControlService = service;

    expect(typedService).toBeDefined();
    expect(typeof typedService.registerContract).toBe('function');
    expect(typeof typedService.getCapabilities).toBe('function');
    expect(typeof typedService.transferOwnership).toBe('function');
    expect(service.networkConfig).toBe(TEST_NETWORK_CONFIG);
    expect(typeof service.dispose).toBe('function');
  });

  it('registers a contract and detects Ownable2Step capabilities', async () => {
    const schema = createSchema(OWNABLE_TWO_STEP_FUNCTIONS);

    await service.registerContract(CONTRACT_ADDRESS, schema);
    const capabilities = await service.getCapabilities(CONTRACT_ADDRESS);

    expect(capabilities.hasOwnable).toBe(true);
    expect(capabilities.hasTwoStepOwnable).toBe(true);
    expect(capabilities.hasAccessControl).toBe(false);
    expect(capabilities.hasEnumerableRoles).toBe(false);
    expect(capabilities.hasTwoStepAdmin).toBe(false);
  });

  it('queries ownership state with mocked RPC responses', async () => {
    const schema = createSchema(OWNABLE_TWO_STEP_FUNCTIONS);

    await service.registerContract(CONTRACT_ADDRESS, schema);
    mockReadContract.mockResolvedValueOnce(OWNER_ADDRESS).mockResolvedValueOnce(ZERO_ADDRESS);
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({}),
    });

    const ownership = await service.getOwnership(CONTRACT_ADDRESS);

    expect(ownership.owner).toBe(OWNER_ADDRESS);
    expect(ownership.state).toBe('owned');
  });

  it('routes write operations through the execution capability callback', async () => {
    const schema = createSchema(OWNABLE_TWO_STEP_FUNCTIONS);
    const executionConfig: ExecutionConfig = {
      method: 'eoa',
      allowAny: true,
    };

    await service.registerContract(CONTRACT_ADDRESS, schema);
    const result = await service.transferOwnership(
      CONTRACT_ADDRESS,
      NEW_OWNER_ADDRESS,
      undefined,
      executionConfig
    );

    expect(mockSignAndBroadcast).toHaveBeenCalledTimes(1);
    const [transactionData, passedExecutionConfig] = mockSignAndBroadcast.mock.calls[0];
    expect(transactionData).toHaveProperty('functionName', 'transferOwnership');
    expect(transactionData).toHaveProperty('address', CONTRACT_ADDRESS);
    expect(passedExecutionConfig).toEqual(executionConfig);
    expect(result).toEqual({ id: '0xmocktxhash123' });
  });
});
