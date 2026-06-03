/**
 * Mocked-RPC read tests for the IRS on-chain reader (US2, FR-019).
 *
 * The IRS verification pre-check is the most-important shared helper and is tested
 * adapter-side here against a mocked viem public client (no live chain, SC-002/SC-004).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getJurisdiction, getOnchainId, isTrustedIssuer, isVerified } from '../onchain-reader';

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
const REGISTRY = '0x1111111111111111111111111111111111111111';
const TRUSTED_ISSUERS_REGISTRY = '0x2222222222222222222222222222222222222222';
const HOLDER = '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa';
const ONCHAINID = '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB';
const ZERO = '0x0000000000000000000000000000000000000000';

describe('IRS reads', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  describe('getOnchainId', () => {
    it('returns { found: true, onchainId } when an identity is registered', async () => {
      mockReadContract.mockResolvedValueOnce(ONCHAINID);
      await expect(getOnchainId(RPC, REGISTRY, HOLDER)).resolves.toEqual({
        found: true,
        onchainId: ONCHAINID,
      });
    });

    it('returns { found: false } for the zero address (unregistered)', async () => {
      mockReadContract.mockResolvedValueOnce(ZERO);
      await expect(getOnchainId(RPC, REGISTRY, HOLDER)).resolves.toEqual({ found: false });
    });

    it('throws IdentityOperationFailed on RPC failure', async () => {
      mockReadContract.mockRejectedValueOnce(new Error('rpc down'));
      await expect(getOnchainId(RPC, REGISTRY, HOLDER)).rejects.toMatchObject({
        code: 'IRS_OPERATION_FAILED',
      });
    });
  });

  describe('isVerified', () => {
    it('returns true when the registry verifies the holder', async () => {
      mockReadContract.mockResolvedValueOnce(true);
      await expect(isVerified(RPC, REGISTRY, HOLDER)).resolves.toBe(true);
    });

    it('returns false when the registry reports unverified', async () => {
      mockReadContract.mockResolvedValueOnce(false);
      await expect(isVerified(RPC, REGISTRY, HOLDER)).resolves.toBe(false);
    });

    it('returns false (never throws) when the read reverts for an unregistered holder', async () => {
      mockReadContract.mockRejectedValueOnce(new Error('revert'));
      await expect(isVerified(RPC, REGISTRY, HOLDER)).resolves.toBe(false);
    });
  });

  describe('getJurisdiction', () => {
    it('returns the ISO-3166 numeric code as a string', async () => {
      mockReadContract.mockResolvedValueOnce(840);
      await expect(getJurisdiction(RPC, REGISTRY, HOLDER)).resolves.toBe('840');
    });

    it('returns undefined when unavailable', async () => {
      mockReadContract.mockRejectedValueOnce(new Error('revert'));
      await expect(getJurisdiction(RPC, REGISTRY, HOLDER)).resolves.toBeUndefined();
    });
  });

  describe('isTrustedIssuer', () => {
    it('returns true/false from the registry, false on revert', async () => {
      mockReadContract.mockResolvedValueOnce(true);
      await expect(isTrustedIssuer(RPC, TRUSTED_ISSUERS_REGISTRY, HOLDER)).resolves.toBe(true);

      mockReadContract.mockRejectedValueOnce(new Error('revert'));
      await expect(isTrustedIssuer(RPC, TRUSTED_ISSUERS_REGISTRY, HOLDER)).resolves.toBe(false);
    });
  });
});
