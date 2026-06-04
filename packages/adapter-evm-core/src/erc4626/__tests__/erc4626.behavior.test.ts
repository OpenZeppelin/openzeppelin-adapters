/**
 * Mocked-RPC read + mocked-execution write tests for the ERC-4626 capability (US4).
 *
 * Reads (`convertToAssets`/`convertToShares`/`totalAssets`) decode mocked RPC into base-unit
 * strings; writes (`deposit`/`withdraw`) assemble correct ERC-4626 calldata and submit via the
 * injected `signAndBroadcast`; insufficient funds map to `InsufficientBalance` (deposit) /
 * `InsufficientShares` (withdraw); a malformed amount is rejected with `InvalidAmount` before
 * any RPC/submission. No live chain.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ERC4626Capability, ExecutionConfig } from '@openzeppelin/ui-types';

import { createERC4626, type CreateERC4626Options } from '../../capabilities/erc4626';

const mockReadContract = vi.fn();

vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem');
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({ readContract: mockReadContract })),
    http: vi.fn((url: string) => ({ url, type: 'http' })),
  };
});

const EXEC_CONFIG = { method: 'eoa' } as unknown as ExecutionConfig;
const VAULT = '0x1111111111111111111111111111111111111111';
const HOLDER = '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa';

function makeCapability(
  signImpl: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ txHash: '0xtx' })
): { capability: ERC4626Capability; signAndBroadcast: ReturnType<typeof vi.fn> } {
  const options: CreateERC4626Options = { signAndBroadcast: signImpl, vaultAddress: VAULT };
  const capability = createERC4626(
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
  return { capability, signAndBroadcast: signImpl };
}

describe('ERC-4626 reads (VC-1)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('convertToAssets decodes a uint256 into a base-unit string', async () => {
    const { capability } = makeCapability();
    mockReadContract.mockResolvedValueOnce(1000000000000000000n);

    await expect(capability.convertToAssets('500')).resolves.toBe('1000000000000000000');
    expect(mockReadContract.mock.calls[0][0]).toMatchObject({
      functionName: 'convertToAssets',
      args: [500n],
    });
  });

  it('convertToShares decodes a uint256 into a base-unit string', async () => {
    const { capability } = makeCapability();
    mockReadContract.mockResolvedValueOnce(250n);

    await expect(capability.convertToShares('1000')).resolves.toBe('250');
    expect(mockReadContract.mock.calls[0][0]).toMatchObject({
      functionName: 'convertToShares',
      args: [1000n],
    });
  });

  it('totalAssets decodes a uint256 into a base-unit string', async () => {
    const { capability } = makeCapability();
    mockReadContract.mockResolvedValueOnce(42n);

    await expect(capability.totalAssets()).resolves.toBe('42');
    expect(mockReadContract.mock.calls[0][0]).toMatchObject({ functionName: 'totalAssets' });
  });

  it('wraps an RPC failure in RICapabilityOperationFailed', async () => {
    const { capability } = makeCapability();
    mockReadContract.mockRejectedValueOnce(new Error('rpc down'));

    await expect(capability.totalAssets()).rejects.toMatchObject({ code: 'OPERATION_FAILED' });
  });

  it('rejects a malformed read amount with InvalidAmount before any RPC', async () => {
    const { capability } = makeCapability();

    await expect(capability.convertToShares('1.5')).rejects.toMatchObject({
      code: 'INVALID_AMOUNT',
    });
    expect(mockReadContract).not.toHaveBeenCalled();
  });
});

describe('ERC-4626 writes (VC-2)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('deposit assembles deposit(assets, receiver) calldata and returns the tx id', async () => {
    const { capability, signAndBroadcast } = makeCapability();
    const result = await capability.deposit({ from: HOLDER, amount: '1000' }, EXEC_CONFIG);

    expect(result).toEqual({ id: '0xtx' });
    const action = signAndBroadcast.mock.calls[0][0];
    expect(action.functionName).toBe('deposit');
    expect(action.address).toBe(VAULT);
    expect(action.args).toEqual([1000n, HOLDER]);
  });

  it('withdraw assembles redeem(shares, receiver, owner) calldata', async () => {
    const { capability, signAndBroadcast } = makeCapability();
    await capability.withdraw({ from: HOLDER, shares: '500' }, EXEC_CONFIG);

    const action = signAndBroadcast.mock.calls[0][0];
    expect(action.functionName).toBe('redeem');
    expect(action.args).toEqual([500n, HOLDER, HOLDER]);
  });

  describe('revert → typed-error mapping (VC-4)', () => {
    it('maps an insufficient-balance deposit revert to InsufficientBalance', async () => {
      const sign = vi.fn().mockRejectedValue(new Error('ERC20: transfer amount exceeds balance'));
      const { capability } = makeCapability(sign);

      await expect(
        capability.deposit({ from: HOLDER, amount: '999' }, EXEC_CONFIG)
      ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE', holder: HOLDER, requested: '999' });
    });

    it('maps an OZ ERC4626ExceededMaxWithdraw revert to InsufficientShares', async () => {
      const sign = vi.fn().mockRejectedValue(new Error('ERC4626ExceededMaxRedeem'));
      const { capability } = makeCapability(sign);

      await expect(
        capability.withdraw({ from: HOLDER, shares: '999' }, EXEC_CONFIG)
      ).rejects.toMatchObject({ code: 'INSUFFICIENT_SHARES', holder: HOLDER, requested: '999' });
    });

    it('falls back to RICapabilityOperationFailed for an unmapped revert', async () => {
      const sign = vi.fn().mockRejectedValue(new Error('some unknown chain error'));
      const { capability } = makeCapability(sign);

      await expect(
        capability.deposit({ from: HOLDER, amount: '1' }, EXEC_CONFIG)
      ).rejects.toMatchObject({ code: 'OPERATION_FAILED', operation: 'deposit' });
    });
  });

  describe('amount validation (FR-003a)', () => {
    it('rejects a fractional deposit amount with InvalidAmount before submission', async () => {
      const { capability, signAndBroadcast } = makeCapability();

      await expect(
        capability.deposit({ from: HOLDER, amount: '1.5' }, EXEC_CONFIG)
      ).rejects.toMatchObject({ code: 'INVALID_AMOUNT' });
      expect(signAndBroadcast).not.toHaveBeenCalled();
    });

    it('rejects a negative withdraw shares with InvalidAmount before submission', async () => {
      const { capability, signAndBroadcast } = makeCapability();

      await expect(
        capability.withdraw({ from: HOLDER, shares: '-1' }, EXEC_CONFIG)
      ).rejects.toMatchObject({ code: 'INVALID_AMOUNT' });
      expect(signAndBroadcast).not.toHaveBeenCalled();
    });
  });
});
