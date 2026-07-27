/**
 * ONCHAINID dual-management onboarding (deploy operator key, then grant holder key).
 *
 * RED-FIRST: these tests fail against `createIdentity` deploy calldata and against the
 * absence of `grantHolderManagementKey` until the management-key layout is implemented.
 */
import { encodeAbiParameters, encodeEventTopics, keccak256 } from 'viem';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExecutionConfig } from '@openzeppelin/ui-types';
import { IdentityOperationFailed } from '@openzeppelin/ui-types';

import { createIRS, type CreateIRSOptions, type EvmIRSCapability } from '../../capabilities/irs';
import { ID_FACTORY_EVENTS_ABI } from '../abis';
import { IDENTITY_KEY_PURPOSE_MANAGEMENT } from '../identity-keys';
import { InvalidOperatorManagementKeyError } from '../management-key';

const mockReadContract = vi.fn();
const mockGetTransactionReceipt = vi.fn(() =>
  Promise.reject(new Error('TransactionReceiptNotFoundError: not mined yet'))
);
const mockWaitForTransactionReceipt = vi.fn();

vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem');
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      readContract: mockReadContract,
      getTransactionReceipt: mockGetTransactionReceipt,
      waitForTransactionReceipt: mockWaitForTransactionReceipt,
    })),
    http: vi.fn((url: string) => ({ url, type: 'http' })),
  };
});

const EXEC_CONFIG = { method: 'eoa' } as unknown as ExecutionConfig;

const ADDRESSES = {
  identityRegistry: '0x1111111111111111111111111111111111111111',
  identityFactory: '0x2222222222222222222222222222222222222222',
  trustedIssuersRegistry: '0x3333333333333333333333333333333333333333',
} as const;

const HOLDER = '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa';
const OPERATOR = '0xDD601cb1dDb4471e88C51A5f64A9d54294179142';
const ONCHAINID = '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB';
const TX_HASH = '0xtx';

function addressKeyHash(address: string): `0x${string}` {
  return keccak256(encodeAbiParameters([{ type: 'address' }], [address as `0x${string}`]));
}

function walletLinkedReceipt() {
  const topics = encodeEventTopics({
    abi: ID_FACTORY_EVENTS_ABI,
    eventName: 'WalletLinked',
    args: { wallet: HOLDER, identity: ONCHAINID },
  });
  return {
    status: 'success' as const,
    logs: [
      {
        address: ADDRESSES.identityFactory,
        topics,
        data: '0x' as const,
        blockHash: '0x0',
        blockNumber: 1n,
        logIndex: 0,
        transactionHash: TX_HASH,
        transactionIndex: 0,
        removed: false,
      },
    ],
  };
}

function makeCapability(): {
  capability: EvmIRSCapability;
  signAndBroadcast: ReturnType<typeof vi.fn>;
} {
  const signAndBroadcast = vi.fn().mockResolvedValue({ txHash: TX_HASH });
  const options: CreateIRSOptions = {
    signAndBroadcast,
    addresses: { ...ADDRESSES },
    operatorManagementKey: OPERATOR,
  };
  const capability = createIRS(
    {
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
    } as never,
    options
  );
  return { capability, signAndBroadcast };
}

describe('operatorManagementKey construction', () => {
  it('rejects a missing operatorManagementKey at construction', () => {
    expect(() =>
      createIRS(
        {
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
        } as never,
        {
          signAndBroadcast: vi.fn(),
          addresses: { ...ADDRESSES },
        } as CreateIRSOptions
      )
    ).toThrow(InvalidOperatorManagementKeyError);
  });

  it('rejects a malformed operatorManagementKey at construction', () => {
    expect(() =>
      createIRS(
        {
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
        } as never,
        {
          signAndBroadcast: vi.fn(),
          addresses: { ...ADDRESSES },
          operatorManagementKey: 'not-an-address',
        }
      )
    ).toThrow(InvalidOperatorManagementKeyError);
  });
});

describe('deployOnchainId management keys', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('deploys via createIdentityWithManagementKeys with the configured operator key', async () => {
    mockWaitForTransactionReceipt.mockResolvedValueOnce(walletLinkedReceipt());
    mockReadContract.mockResolvedValueOnce(true);
    const { capability, signAndBroadcast } = makeCapability();

    await capability.deployOnchainId({ holder: HOLDER }, EXEC_CONFIG);

    const action = signAndBroadcast.mock.calls[0][0];
    expect(action.functionName).toBe('createIdentityWithManagementKeys');
    expect(action.address.toLowerCase()).toBe(ADDRESSES.identityFactory);
    expect(action.args[0]).toBe(HOLDER);
    expect(action.args[2]).toEqual([addressKeyHash(OPERATOR)]);
  });

  it('gives the operator MANAGEMENT on the deployed identity (keyHasPurpose)', async () => {
    mockWaitForTransactionReceipt.mockResolvedValueOnce(walletLinkedReceipt());
    mockReadContract.mockResolvedValueOnce(true);
    const { capability } = makeCapability();

    await capability.deployOnchainId({ holder: HOLDER }, EXEC_CONFIG);

    expect(mockReadContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: ONCHAINID,
        functionName: 'keyHasPurpose',
        args: [addressKeyHash(OPERATOR), BigInt(IDENTITY_KEY_PURPOSE_MANAGEMENT)],
      })
    );
  });

  it('maps post-deploy keyHasPurpose RPC failure to IdentityOperationFailed with onchainId', async () => {
    mockWaitForTransactionReceipt.mockResolvedValueOnce(walletLinkedReceipt());
    mockReadContract.mockRejectedValueOnce(new Error('rpc down'));
    const { capability } = makeCapability();

    const error = await capability
      .deployOnchainId({ holder: HOLDER }, EXEC_CONFIG)
      .then(() => undefined)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(IdentityOperationFailed);
    expect((error as IdentityOperationFailed).message).toContain(ONCHAINID);
    expect((error as IdentityOperationFailed).message).toMatch(/could not verify/i);
  });
});

describe('grantHolderManagementKey', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('submits addKey(holder, MANAGEMENT) on the identity', async () => {
    mockReadContract.mockResolvedValueOnce(true);
    const { capability, signAndBroadcast } = makeCapability();

    await capability.grantHolderManagementKey(
      { onchainId: ONCHAINID, holder: HOLDER },
      EXEC_CONFIG
    );

    const action = signAndBroadcast.mock.calls[0][0];
    expect(action.functionName).toBe('addKey');
    expect(action.address).toBe(ONCHAINID);
    expect(action.args).toEqual([
      addressKeyHash(HOLDER),
      BigInt(IDENTITY_KEY_PURPOSE_MANAGEMENT),
      1n,
    ]);
  });

  it('gives the holder MANAGEMENT on the identity after grant (keyHasPurpose)', async () => {
    mockReadContract.mockResolvedValueOnce(true);
    const { capability } = makeCapability();

    await capability.grantHolderManagementKey(
      { onchainId: ONCHAINID, holder: HOLDER },
      EXEC_CONFIG
    );

    expect(mockReadContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: ONCHAINID,
        functionName: 'keyHasPurpose',
        args: [addressKeyHash(HOLDER), BigInt(IDENTITY_KEY_PURPOSE_MANAGEMENT)],
      })
    );
  });

  it('maps post-grant keyHasPurpose RPC failure to IdentityOperationFailed with onchainId', async () => {
    mockReadContract.mockRejectedValueOnce(new Error('rpc down'));
    const { capability } = makeCapability();

    const error = await capability
      .grantHolderManagementKey({ onchainId: ONCHAINID, holder: HOLDER }, EXEC_CONFIG)
      .then(() => undefined)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(IdentityOperationFailed);
    expect((error as IdentityOperationFailed).message).toContain(ONCHAINID);
    expect((error as IdentityOperationFailed).message).toMatch(/could not verify/i);
  });
});
