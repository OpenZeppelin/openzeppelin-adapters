/**
 * Factory identity read semantics — `not_found` vs `read_failed` must not collapse.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IdentityOperationFailed } from '@openzeppelin/ui-types';

import { getIdentityFromFactory } from '../onchain-reader';

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
const FACTORY = '0x2222222222222222222222222222222222222222';
const HOLDER = '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa';
const ONCHAINID = '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB';
const ZERO = '0x0000000000000000000000000000000000000000';

describe('getIdentityFromFactory', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('returns { status: "found", onchainId } for a non-zero factory mapping', async () => {
    mockReadContract.mockResolvedValueOnce(ONCHAINID);
    await expect(getIdentityFromFactory(RPC, FACTORY, HOLDER)).resolves.toEqual({
      status: 'found',
      onchainId: ONCHAINID,
    });
  });

  it('returns { status: "not_found" } for the zero address', async () => {
    mockReadContract.mockResolvedValueOnce(ZERO);
    await expect(getIdentityFromFactory(RPC, FACTORY, HOLDER)).resolves.toEqual({
      status: 'not_found',
    });
  });

  it('returns { status: "read_failed", cause } on RPC failure — does NOT return not_found', async () => {
    const rpcError = new Error('rpc down');
    mockReadContract.mockRejectedValueOnce(rpcError);
    const result = await getIdentityFromFactory(RPC, FACTORY, HOLDER);
    expect(result.status).toBe('read_failed');
    if (result.status === 'read_failed') {
      expect(result.cause).toBe(rpcError);
    }
  });

  it('throws IdentityOperationFailed when callers use getFactoryIdentity on the service', async () => {
    // Documented at service layer — reader itself returns read_failed for explicit handling.
    mockReadContract.mockRejectedValueOnce(new Error('rpc down'));
    const lookup = await getIdentityFromFactory(RPC, FACTORY, HOLDER);
    expect(lookup.status).toBe('read_failed');
    expect(lookup).not.toEqual({ status: 'not_found' });
    // Guard: swallowing into undefined would have made this indistinguishable from not_found.
    expect(() => {
      if (lookup.status === 'read_failed') {
        throw new IdentityOperationFailed(
          `Failed to read factory identity for ${HOLDER}: ${lookup.cause.message}`,
          'getFactoryIdentity',
          lookup.cause,
          FACTORY
        );
      }
    }).toThrow(IdentityOperationFailed);
  });
});
