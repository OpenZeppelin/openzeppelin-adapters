/**
 * Mocked-execution write tests for the ERC-3643 capability (US3).
 *
 * Verifies each write assembles correct T-REX calldata and submits via the injected
 * `signAndBroadcast`, that known reverts map to typed errors (EC-5), and that a malformed
 * amount is rejected with `InvalidAmount` before any submission (FR-003a). No live chain.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ERC3643Capability, ExecutionConfig } from '@openzeppelin/ui-types';

import { createERC3643, type CreateERC3643Options } from '../../capabilities/erc3643';

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
const TOKEN = '0x1111111111111111111111111111111111111111';
const HOLDER = '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa';
const TO = '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB';

function makeCapability(
  signImpl: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ txHash: '0xtx' })
): { capability: ERC3643Capability; signAndBroadcast: ReturnType<typeof vi.fn> } {
  const options: CreateERC3643Options = { signAndBroadcast: signImpl, tokenAddress: TOKEN };
  const capability = createERC3643(
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

describe('ERC-3643 writes', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('mint assembles mint(to, amount) calldata and returns the tx id', async () => {
    const { capability, signAndBroadcast } = makeCapability();
    const result = await capability.mint({ to: TO, amount: '1000' }, EXEC_CONFIG);

    expect(result).toEqual({ id: '0xtx' });
    const action = signAndBroadcast.mock.calls[0][0];
    expect(action.functionName).toBe('mint');
    expect(action.address).toBe(TOKEN);
    expect(action.args).toEqual([TO, 1000n]);
  });

  it('burn assembles burn(from, amount) calldata', async () => {
    const { capability, signAndBroadcast } = makeCapability();
    await capability.burn({ from: HOLDER, amount: '500' }, EXEC_CONFIG);

    const action = signAndBroadcast.mock.calls[0][0];
    expect(action.functionName).toBe('burn');
    expect(action.args).toEqual([HOLDER, 500n]);
  });

  it('transfer assembles forcedTransfer(from, to, amount) calldata', async () => {
    const { capability, signAndBroadcast } = makeCapability();
    await capability.transfer({ from: HOLDER, to: TO, amount: '42' }, EXEC_CONFIG);

    const action = signAndBroadcast.mock.calls[0][0];
    expect(action.functionName).toBe('forcedTransfer');
    expect(action.args).toEqual([HOLDER, TO, 42n]);
  });

  it('freeze and unfreeze assemble setAddressFrozen with the right boolean', async () => {
    const { capability, signAndBroadcast } = makeCapability();

    await capability.freeze({ holder: HOLDER }, EXEC_CONFIG);
    expect(signAndBroadcast.mock.calls[0][0]).toMatchObject({
      functionName: 'setAddressFrozen',
      args: [HOLDER, true],
    });

    await capability.unfreeze({ holder: HOLDER }, EXEC_CONFIG);
    expect(signAndBroadcast.mock.calls[1][0]).toMatchObject({
      functionName: 'setAddressFrozen',
      args: [HOLDER, false],
    });
  });

  describe('revert → typed-error mapping (EC-5)', () => {
    it('maps an unverified-recipient revert to RecipientNotVerified', async () => {
      const sign = vi.fn().mockRejectedValue(new Error('Identity is not verified.'));
      const { capability } = makeCapability(sign);

      await expect(capability.mint({ to: TO, amount: '1' }, EXEC_CONFIG)).rejects.toMatchObject({
        code: 'RECIPIENT_NOT_VERIFIED',
        holder: TO,
      });
    });

    it('maps a frozen-wallet revert to HolderFrozen', async () => {
      const sign = vi.fn().mockRejectedValue(new Error('wallet is frozen'));
      const { capability } = makeCapability(sign);

      await expect(
        capability.transfer({ from: HOLDER, to: TO, amount: '1' }, EXEC_CONFIG)
      ).rejects.toMatchObject({ code: 'HOLDER_FROZEN', holder: HOLDER });
    });

    it('maps an insufficient-balance revert to InsufficientBalance', async () => {
      const sign = vi.fn().mockRejectedValue(new Error('transfer amount exceeds balance'));
      const { capability } = makeCapability(sign);

      await expect(
        capability.burn({ from: HOLDER, amount: '999' }, EXEC_CONFIG)
      ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE', holder: HOLDER, requested: '999' });
    });

    it('maps the forcedTransfer "sender balance too low" revert to InsufficientBalance', async () => {
      const sign = vi.fn().mockRejectedValue(new Error('sender balance too low'));
      const { capability } = makeCapability(sign);

      await expect(
        capability.transfer({ from: HOLDER, to: TO, amount: '999' }, EXEC_CONFIG)
      ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE', holder: HOLDER });
    });

    it('maps the burn "cannot burn more than balance" revert to InsufficientBalance', async () => {
      const sign = vi.fn().mockRejectedValue(new Error('cannot burn more than balance'));
      const { capability } = makeCapability(sign);

      await expect(
        capability.burn({ from: HOLDER, amount: '999' }, EXEC_CONFIG)
      ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE', holder: HOLDER });
    });

    it('maps the mint "Compliance not followed" revert to ComplianceModuleRejected', async () => {
      const sign = vi.fn().mockRejectedValue(new Error('Compliance not followed'));
      const { capability } = makeCapability(sign);

      await expect(capability.mint({ to: TO, amount: '1' }, EXEC_CONFIG)).rejects.toMatchObject({
        code: 'COMPLIANCE_MODULE_REJECTED',
      });
    });

    it('maps a compliance revert to ComplianceModuleRejected', async () => {
      const sign = vi.fn().mockRejectedValue(new Error('Transfer not possible'));
      const { capability } = makeCapability(sign);

      await expect(
        capability.transfer({ from: HOLDER, to: TO, amount: '1' }, EXEC_CONFIG)
      ).rejects.toMatchObject({ code: 'COMPLIANCE_MODULE_REJECTED' });
    });

    it('falls back to RICapabilityOperationFailed for an unmapped revert', async () => {
      const sign = vi.fn().mockRejectedValue(new Error('some unknown chain error'));
      const { capability } = makeCapability(sign);

      await expect(capability.mint({ to: TO, amount: '1' }, EXEC_CONFIG)).rejects.toMatchObject({
        code: 'OPERATION_FAILED',
        operation: 'mint',
      });
    });
  });

  describe('amount validation (FR-003a)', () => {
    it('rejects a fractional amount with InvalidAmount before submission', async () => {
      const { capability, signAndBroadcast } = makeCapability();

      await expect(capability.mint({ to: TO, amount: '1.5' }, EXEC_CONFIG)).rejects.toMatchObject({
        code: 'INVALID_AMOUNT',
      });
      expect(signAndBroadcast).not.toHaveBeenCalled();
    });

    it('rejects a negative amount with InvalidAmount before submission', async () => {
      const { capability, signAndBroadcast } = makeCapability();

      await expect(
        capability.burn({ from: HOLDER, amount: '-1' }, EXEC_CONFIG)
      ).rejects.toMatchObject({ code: 'INVALID_AMOUNT' });
      expect(signAndBroadcast).not.toHaveBeenCalled();
    });
  });
});
