/**
 * Mocked-RPC read tests for the ERC-3643 on-chain reader (US3, SC-002/SC-004).
 *
 * Exercises balance/frozen/jurisdiction decode and both `simulateTransfer` shapes
 * (allowed + blocked, including blocking-module resolution) against a mocked viem
 * public client. No live chain.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  balanceOf,
  getJurisdiction,
  isFrozen,
  isVerified,
  simulateTransfer,
} from '../onchain-reader';

const mockReadContract = vi.fn();

vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem');
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({ readContract: mockReadContract })),
    http: vi.fn((url: string) => ({ url, type: 'http' })),
  };
});

const RPC = 'https://rpc.example.com';
const TOKEN = '0x1111111111111111111111111111111111111111';
const REGISTRY = '0x4444444444444444444444444444444444444444';
const COMPLIANCE = '0x5555555555555555555555555555555555555555';
const MODULE_A = '0x6666666666666666666666666666666666666666';
const MODULE_B = '0x7777777777777777777777777777777777777777';
const HOLDER = '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa';
const TO = '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB';

describe('ERC-3643 reads', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  describe('balanceOf', () => {
    it('decodes a uint256 balance into a base-unit decimal string', async () => {
      mockReadContract.mockResolvedValueOnce(1000000000000000000n);
      await expect(balanceOf(RPC, TOKEN, HOLDER)).resolves.toBe('1000000000000000000');
    });

    it('throws RICapabilityOperationFailed on RPC failure', async () => {
      mockReadContract.mockRejectedValueOnce(new Error('rpc down'));
      await expect(balanceOf(RPC, TOKEN, HOLDER)).rejects.toMatchObject({
        code: 'OPERATION_FAILED',
      });
    });
  });

  describe('isFrozen', () => {
    it('returns the boolean freeze status', async () => {
      mockReadContract.mockResolvedValueOnce(true);
      await expect(isFrozen(RPC, TOKEN, HOLDER)).resolves.toBe(true);
    });
  });

  describe('isVerified', () => {
    it('resolves the registry then returns its verification result', async () => {
      mockReadContract.mockResolvedValueOnce(REGISTRY); // identityRegistry()
      mockReadContract.mockResolvedValueOnce(true); // isVerified()
      await expect(isVerified(RPC, TOKEN, HOLDER)).resolves.toBe(true);
    });

    it('returns false (never throws) for an unregistered holder', async () => {
      mockReadContract.mockResolvedValueOnce(REGISTRY);
      mockReadContract.mockRejectedValueOnce(new Error('not registered'));
      await expect(isVerified(RPC, TOKEN, HOLDER)).resolves.toBe(false);
    });
  });

  describe('getJurisdiction', () => {
    it('returns the ISO-3166 numeric code as a string', async () => {
      mockReadContract.mockResolvedValueOnce(REGISTRY); // identityRegistry()
      mockReadContract.mockResolvedValueOnce(840); // investorCountry()
      await expect(getJurisdiction(RPC, TOKEN, HOLDER)).resolves.toBe('840');
    });

    it('returns undefined when unavailable', async () => {
      mockReadContract.mockResolvedValueOnce(REGISTRY);
      mockReadContract.mockRejectedValueOnce(new Error('revert'));
      await expect(getJurisdiction(RPC, TOKEN, HOLDER)).resolves.toBeUndefined();
    });
  });

  describe('simulateTransfer', () => {
    it('returns { allowed: true, modulesEvaluated } when permitted', async () => {
      mockReadContract.mockResolvedValueOnce(COMPLIANCE); // compliance()
      mockReadContract.mockResolvedValueOnce([MODULE_A, MODULE_B]); // getModules()
      mockReadContract.mockResolvedValueOnce(true); // canTransfer()

      await expect(
        simulateTransfer(RPC, TOKEN, { from: HOLDER, to: TO, amount: '100' })
      ).resolves.toEqual({ allowed: true, modulesEvaluated: 2 });
    });

    it('returns { allowed: false, blockingModule } resolving the first blocking module name', async () => {
      mockReadContract.mockResolvedValueOnce(COMPLIANCE); // compliance()
      mockReadContract.mockResolvedValueOnce([MODULE_A, MODULE_B]); // getModules()
      mockReadContract.mockResolvedValueOnce(false); // canTransfer()
      mockReadContract.mockResolvedValueOnce(true); // moduleCheck(MODULE_A) → ok
      mockReadContract.mockResolvedValueOnce(false); // moduleCheck(MODULE_B) → blocks
      mockReadContract.mockResolvedValueOnce('CountryRestrictModule'); // name()

      await expect(
        simulateTransfer(RPC, TOKEN, { from: HOLDER, to: TO, amount: '100' })
      ).resolves.toEqual({
        allowed: false,
        modulesEvaluated: 2,
        blockingModule: 'CountryRestrictModule',
      });
    });

    it('falls back to the module address when name() is unavailable', async () => {
      mockReadContract.mockResolvedValueOnce(COMPLIANCE);
      mockReadContract.mockResolvedValueOnce([MODULE_A]);
      mockReadContract.mockResolvedValueOnce(false); // canTransfer()
      mockReadContract.mockResolvedValueOnce(false); // moduleCheck(MODULE_A) → blocks
      mockReadContract.mockRejectedValueOnce(new Error('no name')); // name() reverts

      await expect(
        simulateTransfer(RPC, TOKEN, { from: HOLDER, to: TO, amount: '100' })
      ).resolves.toEqual({ allowed: false, modulesEvaluated: 1, blockingModule: MODULE_A });
    });

    it('rejects a malformed amount with InvalidAmount before any RPC', async () => {
      await expect(
        simulateTransfer(RPC, TOKEN, { from: HOLDER, to: TO, amount: '1.5' })
      ).rejects.toMatchObject({ code: 'INVALID_AMOUNT' });
      expect(mockReadContract).not.toHaveBeenCalled();
    });
  });
});
