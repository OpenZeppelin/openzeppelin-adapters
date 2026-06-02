/**
 * Mocked-execution write tests for the IRS capability (US2).
 *
 * Verifies that each write assembles correct calldata and submits it via the injected
 * `signAndBroadcast`, that idempotent paths short-circuit, that re-registering an identity
 * maps to `IdentityAlreadyRegistered`, and that `buildClaimPayload` is pure/deterministic.
 * No live chain (SC-002/SC-004).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExecutionConfig, IRSCapability, OnboardingClaim } from '@openzeppelin/ui-types';
import { IdentityAlreadyRegistered, IdentityOperationFailed } from '@openzeppelin/ui-types';

import { createIRS, type CreateIRSOptions } from '../../capabilities/irs';

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

const ADDRESSES = {
  identityRegistry: '0x1111111111111111111111111111111111111111',
  identityFactory: '0x2222222222222222222222222222222222222222',
  trustedIssuersRegistry: '0x3333333333333333333333333333333333333333',
} as const;

const HOLDER = '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa';
const ONCHAINID = '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB';
const ISSUER = '0xcCcCccCcCcCccCcccCccCccCccCccCccCccCccccC';
const ZERO = '0x0000000000000000000000000000000000000000';

function makeCapability(): {
  capability: IRSCapability;
  signAndBroadcast: ReturnType<typeof vi.fn>;
} {
  const signAndBroadcast = vi.fn().mockResolvedValue({ txHash: '0xtx' });
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

describe('IRS writes', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  describe('deployOnchainId', () => {
    it('submits createIdentity and resolves the deployed ONCHAINID', async () => {
      mockReadContract.mockResolvedValueOnce(ONCHAINID); // getIdentityFromFactory
      const { capability, signAndBroadcast } = makeCapability();

      const result = await capability.deployOnchainId({ holder: HOLDER }, EXEC_CONFIG);

      expect(result).toEqual({ id: '0xtx', onchainId: ONCHAINID });
      const action = signAndBroadcast.mock.calls[0][0];
      expect(action.functionName).toBe('createIdentity');
      expect(action.address.toLowerCase()).toBe(ADDRESSES.identityFactory);
      expect(action.args[0]).toBe(HOLDER);
    });
  });

  describe('registerTrustedIssuer', () => {
    it('submits addTrustedIssuer with uint256 topics when not yet trusted', async () => {
      mockReadContract.mockResolvedValueOnce(false); // isTrustedIssuer
      const { capability, signAndBroadcast } = makeCapability();

      await capability.registerTrustedIssuer({ issuer: ISSUER, topics: ['1', '2'] }, EXEC_CONFIG);

      const action = signAndBroadcast.mock.calls[0][0];
      expect(action.functionName).toBe('addTrustedIssuer');
      expect(action.args).toEqual([ISSUER, [1n, 2n]]);
    });

    it('is idempotent: skips submission when the issuer is already trusted', async () => {
      mockReadContract.mockResolvedValueOnce(true); // isTrustedIssuer
      const { capability, signAndBroadcast } = makeCapability();

      const result = await capability.registerTrustedIssuer(
        { issuer: ISSUER, topics: ['1'] },
        EXEC_CONFIG
      );

      expect(signAndBroadcast).not.toHaveBeenCalled();
      expect(result.id).toContain(ISSUER);
    });
  });

  describe('attachClaim', () => {
    it('relays the pre-signed claim via addClaim (issuer key never handled)', async () => {
      const { capability, signAndBroadcast } = makeCapability();
      const claim: OnboardingClaim = {
        topic: '1',
        scheme: 1,
        data: '0xdeadbeef',
        signature: '0xc0ffee',
        issuer: ISSUER,
      };

      await capability.attachClaim({ onchainId: ONCHAINID, claim }, EXEC_CONFIG);

      const action = signAndBroadcast.mock.calls[0][0];
      expect(action.functionName).toBe('addClaim');
      expect(action.address).toBe(ONCHAINID);
      expect(action.args).toEqual([1n, 1n, ISSUER, '0xc0ffee', '0xdeadbeef', '']);
    });

    it('rejects with IdentityOperationFailed when no issuer is resolvable', async () => {
      const { capability, signAndBroadcast } = makeCapability();
      const claim: OnboardingClaim = {
        topic: '1',
        scheme: 1,
        data: '0xdeadbeef',
        signature: '0xc0ffee',
      };

      await expect(
        capability.attachClaim({ onchainId: ONCHAINID, claim }, EXEC_CONFIG)
      ).rejects.toBeInstanceOf(IdentityOperationFailed);
      expect(signAndBroadcast).not.toHaveBeenCalled();
    });
  });

  describe('registerIdentity', () => {
    it('submits registerIdentity for an unregistered holder', async () => {
      mockReadContract.mockResolvedValueOnce(ZERO); // getOnchainId pre-check → not found
      const { capability, signAndBroadcast } = makeCapability();

      await capability.registerIdentity(
        { holder: HOLDER, onchainId: ONCHAINID, country: 840 },
        EXEC_CONFIG
      );

      const action = signAndBroadcast.mock.calls[0][0];
      expect(action.functionName).toBe('registerIdentity');
      expect(action.args).toEqual([HOLDER, ONCHAINID, 840]);
    });

    it('maps an already-registered holder to IdentityAlreadyRegistered on re-run', async () => {
      mockReadContract.mockResolvedValueOnce(ONCHAINID); // getOnchainId pre-check → found
      const { capability, signAndBroadcast } = makeCapability();

      await expect(
        capability.registerIdentity({ holder: HOLDER, onchainId: ONCHAINID }, EXEC_CONFIG)
      ).rejects.toBeInstanceOf(IdentityAlreadyRegistered);
      expect(signAndBroadcast).not.toHaveBeenCalled();
    });
  });

  describe('buildClaimPayload', () => {
    it('is pure and deterministic (no RPC, stable digest)', () => {
      const { capability } = makeCapability();
      const input = { onchainId: ONCHAINID, topic: '1', scheme: 1, data: '0xdeadbeef' };

      const a = capability.buildClaimPayload(input);
      const b = capability.buildClaimPayload(input);

      expect(a).toEqual(b);
      expect(a.digest).toMatch(/^0x[0-9a-f]{64}$/);
      expect(a).toMatchObject({ topic: '1', scheme: 1, data: '0xdeadbeef' });
      expect(mockReadContract).not.toHaveBeenCalled();
    });
  });
});
