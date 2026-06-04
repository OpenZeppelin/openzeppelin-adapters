/**
 * Factory-creation tests for `createERC3643` (US3).
 *
 * Asserts the capability shape, that `dispose()` is idempotent (FR-016), and that the
 * `RuntimeCapability` guard rejects access after disposal.
 */
import { describe, expect, it, vi } from 'vitest';

import type { ERC3643Capability } from '@openzeppelin/ui-types';
import { RuntimeDisposedError } from '@openzeppelin/ui-types';

import { createERC3643, type CreateERC3643Options } from '../../capabilities/erc3643';

const mockNetworkConfig = {
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
} as const;

function makeOptions(overrides: Partial<CreateERC3643Options> = {}): CreateERC3643Options {
  return {
    signAndBroadcast: vi.fn().mockResolvedValue({ txHash: '0xtx' }),
    tokenAddress: '0x1111111111111111111111111111111111111111',
    ...overrides,
  };
}

describe('createERC3643', () => {
  it('creates an ERC-3643 capability with the expected method surface', () => {
    const capability: ERC3643Capability = createERC3643(mockNetworkConfig, makeOptions());

    expect(typeof capability.balanceOf).toBe('function');
    expect(typeof capability.isVerified).toBe('function');
    expect(typeof capability.isFrozen).toBe('function');
    expect(typeof capability.getJurisdiction).toBe('function');
    expect(typeof capability.simulateTransfer).toBe('function');
    expect(typeof capability.mint).toBe('function');
    expect(typeof capability.burn).toBe('function');
    expect(typeof capability.transfer).toBe('function');
    expect(typeof capability.freeze).toBe('function');
    expect(typeof capability.unfreeze).toBe('function');
    expect(typeof capability.dispose).toBe('function');
  });

  it('throws for a non-EVM network config', () => {
    expect(() =>
      createERC3643({ ...mockNetworkConfig, ecosystem: 'stellar' } as never, makeOptions())
    ).toThrow(/EVM network configuration/i);
  });

  it('throws for an invalid tokenAddress', () => {
    expect(() =>
      createERC3643(mockNetworkConfig, makeOptions({ tokenAddress: 'not-an-address' }))
    ).toThrow(/Invalid tokenAddress/i);
  });

  it('disposes idempotently and guards access afterwards', () => {
    const capability = createERC3643(mockNetworkConfig, makeOptions());

    expect(() => capability.dispose()).not.toThrow();
    expect(() => capability.dispose()).not.toThrow();
    expect(() => capability.networkConfig).toThrow(RuntimeDisposedError);
  });
});
