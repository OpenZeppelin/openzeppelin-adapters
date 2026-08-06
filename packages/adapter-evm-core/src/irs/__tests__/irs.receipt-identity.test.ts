/**
 * Receipt-sourced identity resolution for `deployOnchainId` (regression guard).
 *
 * Two defects are pinned here, and each test is built to FAIL if the implementation regresses:
 *
 * 1. Falling back to a post-submit `getIdentity` eth_call — the `readContract` mock is poisoned
 *    (returns zero) so it would win if it were consulted at all.
 * 2. Using a POINT-IN-TIME `getTransactionReceipt` instead of WAITING. `getTransactionReceipt` is
 *    mocked to REJECT exactly as it does while a tx is pending, while `waitForTransactionReceipt`
 *    resolves. An implementation that checks instead of waits therefore fails these tests, which
 *    is the whole point: "a receipt only exists once mined" is only a confirmation gate if you
 *    actually wait for it.
 */
import { encodeEventTopics } from 'viem';
import { afterEach, assert, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExecutionConfig, IRSCapability } from '@openzeppelin/ui-types';
import { IdentityOperationFailed } from '@openzeppelin/ui-types';

import { createIRS, type CreateIRSOptions } from '../../capabilities/irs';
import { ID_FACTORY_EVENTS_ABI } from '../abis';

const mockReadContract = vi.fn();
/**
 * Rejects the way viem does for a pending tx. If `deployOnchainId` ever calls this instead of
 * waiting, every test in this file fails — that is the regression guard for the point-in-time bug.
 */
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

describe('deployOnchainId receipt resolution', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('resolves onchainId from WalletLinked in the receipt — NOT from factory getIdentity eth_call', async () => {
    mockWaitForTransactionReceipt.mockResolvedValueOnce(walletLinkedReceipt());
    mockReadContract.mockResolvedValueOnce(true); // operator MANAGEMENT probe on identity

    const { capability, signAndBroadcast } = makeCapability();

    const result = await capability.deployOnchainId({ holder: HOLDER }, EXEC_CONFIG);

    expect(result).toEqual({ id: TX_HASH, onchainId: ONCHAINID, completion: 'confirmed' });
    expect(signAndBroadcast).toHaveBeenCalledOnce();
    expect(mockReadContract).toHaveBeenCalledOnce();
    expect(mockReadContract.mock.calls[0]?.[0]).toMatchObject({
      functionName: 'keyHasPurpose',
      address: ONCHAINID,
    });
  });

  it('WAITS for confirmation — never a point-in-time getTransactionReceipt', async () => {
    // getTransactionReceipt rejects (pending), waitForTransactionReceipt resolves. A
    // check-instead-of-wait implementation cannot pass this.
    mockWaitForTransactionReceipt.mockResolvedValueOnce(walletLinkedReceipt());
    mockReadContract.mockResolvedValueOnce(true);

    const { capability } = makeCapability();
    const result = await capability.deployOnchainId({ holder: HOLDER }, EXEC_CONFIG);

    // EXEC_CONFIG is eoa, so this is the confirmed arm — narrow before reading `onchainId`,
    // which only exists there (the submit-only arm has no such property).
    assert(result.completion === 'confirmed', 'expected the confirmed deploy arm');
    expect(result.onchainId).toBe(ONCHAINID);
    expect(mockWaitForTransactionReceipt).toHaveBeenCalledOnce();
    expect(mockGetTransactionReceipt).not.toHaveBeenCalled();
  });

  it('bounds the wait — passes a confirmations count AND a finite timeout', async () => {
    mockWaitForTransactionReceipt.mockResolvedValueOnce(walletLinkedReceipt());
    mockReadContract.mockResolvedValueOnce(true);

    const { capability } = makeCapability();
    await capability.deployOnchainId({ holder: HOLDER }, EXEC_CONFIG);

    const args = mockWaitForTransactionReceipt.mock.calls[0]?.[0];
    expect(args).toMatchObject({ hash: TX_HASH });
    expect(args.confirmations).toBeGreaterThanOrEqual(1);
    // An unbounded wait inside a server-side route is an outage, not a slow response.
    expect(args.timeout).toBeGreaterThan(0);
    expect(Number.isFinite(args.timeout)).toBe(true);
  });

  it('reports a wait TIMEOUT as INDETERMINATE — never as a plain failure', async () => {
    mockWaitForTransactionReceipt.mockRejectedValueOnce(
      new Error('WaitForTransactionReceiptTimeoutError: timed out')
    );

    const { capability } = makeCapability();
    const error = await capability
      .deployOnchainId({ holder: HOLDER }, EXEC_CONFIG)
      .then(() => undefined)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(IdentityOperationFailed);
    const message = (error as Error).message;
    // The tx may still land, so the message must say so and must warn against a blind retry.
    expect(message).toContain('INDETERMINATE');
    expect(message).toContain('MAY STILL LAND');
    expect(message).toMatch(/do NOT retry blind/i);
    expect(message).toContain('wallet already linked to an identity');
    expect(message).toContain(TX_HASH);
  });

  it('reports a REVERT explicitly — not as "no identity was resolvable"', async () => {
    mockWaitForTransactionReceipt.mockResolvedValueOnce({ status: 'reverted', logs: [] });

    const { capability } = makeCapability();
    const error = await capability
      .deployOnchainId({ holder: HOLDER }, EXEC_CONFIG)
      .then(() => undefined)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(IdentityOperationFailed);
    const message = (error as Error).message;
    expect(message).toContain('REVERTED');
    // Reverted means nothing was created, so a retry is safe — the OPPOSITE of the
    // landed-but-unresolvable case. Conflating them tells the caller to do the dangerous thing.
    expect(message).toMatch(/retry is\s+safe/i);
    expect(message).not.toContain('no identity was resolvable');
    expect(mockReadContract).not.toHaveBeenCalled();
  });

  it('a SUCCESSFUL receipt with no WalletLinked warns that a retry is NOT safe', async () => {
    mockWaitForTransactionReceipt.mockResolvedValueOnce({ status: 'success', logs: [] });

    const { capability } = makeCapability();
    const error = await capability
      .deployOnchainId({ holder: HOLDER }, EXEC_CONFIG)
      .then(() => undefined)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(IdentityOperationFailed);
    const message = (error as Error).message;
    expect(message).toContain('SUCCEEDED');
    expect(message).toContain('LIKELY EXISTS');
    expect(message).toMatch(/do NOT retry blind/i);
    expect(mockReadContract).not.toHaveBeenCalled();
  });
});
