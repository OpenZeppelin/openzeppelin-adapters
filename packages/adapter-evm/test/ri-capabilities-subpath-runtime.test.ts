// @vitest-environment node
/**
 * RI capability sub-path server-side runtime (US5, SC-002/SC-006).
 *
 * Runs in a plain Node environment (no DOM) to mirror the RI plugin's server-side usage:
 * construct each capability via its factory, perform one representative read against a
 * mocked RPC, and one strategy-driven write through an injected `signAndBroadcast`
 * callback (the same seam a `RelayerPluginExecutionStrategy` would implement).
 *
 * Like `access-control-integration.test.ts`, this imports the capability factories from
 * `adapter-evm-core` source and mocks the public-client seam (vi.mock('viem') does not
 * apply across the package boundary). The sub-path export wiring itself is validated by
 * the package build (T038) and the import-graph isolation test.
 *
 * NOTE: erc4626 is intentionally absent — its factory ships in US4 (Phase 7).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TypedEvmNetworkConfig } from '@openzeppelin/adapter-evm-core';
import type { ExecutionConfig, TransactionStatusUpdate } from '@openzeppelin/ui-types';

import { createERC3643 } from '../../adapter-evm-core/src/capabilities/erc3643';
import { createIRS } from '../../adapter-evm-core/src/capabilities/irs';

const mockReadContract = vi.fn();

// Mock the client seam used by both readers (vi.mock('viem') does not cross the package boundary).
vi.mock('../../adapter-evm-core/src/utils/public-client', () => ({
  createEvmPublicClient: () => ({ readContract: mockReadContract }),
}));

const TEST_NETWORK_CONFIG = {
  id: 'ethereum-sepolia',
  exportConstName: 'ethereumSepolia',
  name: 'Sepolia',
  ecosystem: 'evm',
  network: 'ethereum',
  type: 'testnet',
  isTestnet: true,
  chainId: 11155111,
  rpcUrl: 'https://rpc.sepolia.example.com',
  explorerUrl: 'https://sepolia.etherscan.io',
  nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
} as TypedEvmNetworkConfig;

const TOKEN = '0x1111111111111111111111111111111111111111';
const IDENTITY_REGISTRY = '0x2222222222222222222222222222222222222222';
const IDENTITY_FACTORY = '0x3333333333333333333333333333333333333333';
const TRUSTED_ISSUERS_REGISTRY = '0x4444444444444444444444444444444444444444';
const HOLDER = '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa';
const ONCHAIN_ID_ADDR = '0xcccccccccccccccccccccccccccccccccccccccc';
const ISSUER = '0xdddddddddddddddddddddddddddddddddddddddd';
const TX_HASH = '0xdeadbeef';

const EXEC_CONFIG: ExecutionConfig = { method: 'eoa', allowAny: true } as ExecutionConfig;

/**
 * A strategy-style injected callback: simulates submit-then-poll by resolving on the next
 * tick with a final tx hash. Stands in for the plugin's execution strategy.
 */
function createStrategySignAndBroadcast() {
  return vi.fn(
    async (
      _transactionData: unknown,
      _executionConfig: ExecutionConfig,
      onStatusChange?: (status: string, details: TransactionStatusUpdate) => void
    ): Promise<{ txHash: string }> => {
      onStatusChange?.('pending', {} as TransactionStatusUpdate);
      await Promise.resolve();
      onStatusChange?.('success', {} as TransactionStatusUpdate);
      return { txHash: TX_HASH };
    }
  );
}

describe('RI capability sub-paths (server-side runtime)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  describe('erc3643', () => {
    it('constructs, reads balanceOf over mocked RPC, and writes via injected strategy', async () => {
      const signAndBroadcast = createStrategySignAndBroadcast();
      const token = createERC3643(TEST_NETWORK_CONFIG, { signAndBroadcast, tokenAddress: TOKEN });

      expect(typeof token.balanceOf).toBe('function');
      expect(typeof token.dispose).toBe('function');

      mockReadContract.mockResolvedValueOnce(1000000000000000000n);
      await expect(token.balanceOf(HOLDER)).resolves.toBe('1000000000000000000');

      const result = await token.mint({ to: HOLDER, amount: '1000' }, EXEC_CONFIG);
      expect(signAndBroadcast).toHaveBeenCalledTimes(1);
      const [txData] = signAndBroadcast.mock.calls[0];
      expect(txData).toMatchObject({ functionName: 'mint', address: TOKEN });
      expect(result).toEqual({ id: TX_HASH });

      expect(() => token.dispose()).not.toThrow();
      expect(() => token.dispose()).not.toThrow(); // idempotent
    });
  });

  describe('irs', () => {
    it('constructs, reads isVerified over mocked RPC, and writes via injected strategy', async () => {
      const signAndBroadcast = createStrategySignAndBroadcast();
      const irs = createIRS(TEST_NETWORK_CONFIG, {
        signAndBroadcast,
        addresses: {
          identityRegistry: IDENTITY_REGISTRY,
          identityFactory: IDENTITY_FACTORY,
          trustedIssuersRegistry: TRUSTED_ISSUERS_REGISTRY,
        },
      });

      expect(typeof irs.isVerified).toBe('function');
      expect(typeof irs.dispose).toBe('function');

      mockReadContract.mockResolvedValueOnce(true);
      await expect(irs.isVerified(HOLDER)).resolves.toBe(true);

      const result = await irs.attachClaim(
        {
          onchainId: ONCHAIN_ID_ADDR,
          claim: { topic: '1', scheme: 1, data: '0x01', signature: '0x02', issuer: ISSUER },
        },
        EXEC_CONFIG
      );
      expect(signAndBroadcast).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ id: TX_HASH });

      expect(() => irs.dispose()).not.toThrow();
      expect(() => irs.dispose()).not.toThrow(); // idempotent
    });
  });
});
