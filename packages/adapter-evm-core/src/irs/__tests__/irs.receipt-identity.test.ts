/**
 * Receipt-sourced identity resolution for `deployOnchainId` (regression guard).
 *
 * MUST fail when `deployOnchainId` falls back to a post-submit `getIdentity` eth_call:
 * the eth_call mock is configured to return zero / throw even though the receipt carries
 * `WalletLinked`.
 */
import { encodeEventTopics } from 'viem';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExecutionConfig, IRSCapability } from '@openzeppelin/ui-types';
import { IdentityOperationFailed } from '@openzeppelin/ui-types';

import { createIRS, type CreateIRSOptions } from '../../capabilities/irs';
import { ID_FACTORY_EVENTS_ABI } from '../abis';

const mockReadContract = vi.fn();
const mockGetTransactionReceipt = vi.fn();

vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem');
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      readContract: mockReadContract,
      getTransactionReceipt: mockGetTransactionReceipt,
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
const ONCHAINID = '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB';
const TX_HASH = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

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
  capability: IRSCapability;
  signAndBroadcast: ReturnType<typeof vi.fn>;
} {
  const signAndBroadcast = vi.fn().mockResolvedValue({ txHash: TX_HASH });
  const options: CreateIRSOptions = { signAndBroadcast, addresses: { ...ADDRESSES } };
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

describe('deployOnchainId receipt resolution', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('resolves onchainId from WalletLinked in the receipt — NOT from getIdentity eth_call', async () => {
    mockGetTransactionReceipt.mockResolvedValueOnce(walletLinkedReceipt());
    // If deployOnchainId still eth_calls getIdentity, this poisoned return would win.
    mockReadContract.mockResolvedValueOnce('0x0000000000000000000000000000000000000000');

    const { capability, signAndBroadcast } = makeCapability();

    const result = await capability.deployOnchainId({ holder: HOLDER }, EXEC_CONFIG);

    expect(result).toEqual({ id: TX_HASH, onchainId: ONCHAINID });
    expect(signAndBroadcast).toHaveBeenCalledOnce();
    expect(mockGetTransactionReceipt).toHaveBeenCalledWith({ hash: TX_HASH });
    expect(mockReadContract).not.toHaveBeenCalled();
  });

  it('throws when the receipt is successful but carries no WalletLinked for the holder', async () => {
    mockGetTransactionReceipt.mockResolvedValueOnce({ status: 'success', logs: [] });

    const { capability } = makeCapability();

    await expect(
      capability.deployOnchainId({ holder: HOLDER }, EXEC_CONFIG)
    ).rejects.toBeInstanceOf(IdentityOperationFailed);
    expect(mockReadContract).not.toHaveBeenCalled();
  });
});
