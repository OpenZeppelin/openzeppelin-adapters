/**
 * Factory identity read semantics — `not_found` vs `read_failed` must not collapse.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { IRSCapability } from '@openzeppelin/ui-types';

import { createIRS, type CreateIRSOptions } from '../../capabilities/irs';
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
const REGISTRY = '0x1111111111111111111111111111111111111111';
const TRUSTED_ISSUERS = '0x3333333333333333333333333333333333333333';

function makeCapability(): { capability: IRSCapability } {
  const options: CreateIRSOptions = {
    signAndBroadcast: vi.fn(),
    addresses: {
      identityRegistry: REGISTRY,
      identityFactory: FACTORY,
      trustedIssuersRegistry: TRUSTED_ISSUERS,
    },
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
      rpcUrl: RPC,
      nativeCurrency: { name: 'Test Ether', symbol: 'TETH', decimals: 18 },
    } as never,
    options
  );
  return { capability };
}

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

  describe('through the capability surface — service.getFactoryIdentity', () => {
    // Comment-3 coverage: the previous version of this block asserted nothing about the service.
    // It called the reader and then threw IdentityOperationFailed by hand, so it passed no matter
    // what getFactoryIdentity did. The method our consumers actually call was untested. Renaming
    // it would have hidden that; these exercise the real method instead.

    it('returns { status: "found", onchainId } for a linked wallet', async () => {
      mockReadContract.mockResolvedValueOnce(ONCHAINID);
      const { capability } = makeCapability();
      await expect(capability.getFactoryIdentity(HOLDER)).resolves.toEqual({
        status: 'found',
        onchainId: ONCHAINID,
      });
    });

    it('returns { status: "not_found" } for an unlinked wallet', async () => {
      mockReadContract.mockResolvedValueOnce(ZERO);
      const { capability } = makeCapability();
      await expect(capability.getFactoryIdentity(HOLDER)).resolves.toEqual({
        status: 'not_found',
      });
    });

    it('returns { status: "read_failed", cause } on RPC error — and does NOT throw', async () => {
      // The load-bearing assertion. read_failed must stay a VALUE so the caller can distinguish
      // "the read broke" from "no identity exists"; those have opposite safety consequences for a
      // deploy decision. Collapsing either into the other is the defect this PR removes.
      const rpcError = new Error('rpc down');
      mockReadContract.mockRejectedValueOnce(rpcError);
      const { capability } = makeCapability();

      const lookup = await capability.getFactoryIdentity(HOLDER);

      expect(lookup.status).toBe('read_failed');
      if (lookup.status === 'read_failed') {
        expect(lookup.cause).toBe(rpcError);
      }
      expect(lookup).not.toEqual({ status: 'not_found' });
    });
  });
});
