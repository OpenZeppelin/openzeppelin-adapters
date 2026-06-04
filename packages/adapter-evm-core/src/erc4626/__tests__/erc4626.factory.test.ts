/**
 * Factory-creation tests for `createERC4626` (US4).
 *
 * Asserts the capability shape, that `dispose()` is idempotent (FR-016), and that the
 * `RuntimeCapability` guard rejects access after disposal.
 */
import { describe, expect, it, vi } from 'vitest';

import type { ERC4626Capability } from '@openzeppelin/ui-types';
import { RuntimeDisposedError } from '@openzeppelin/ui-types';

import { createERC4626, type CreateERC4626Options } from '../../capabilities/erc4626';

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

function makeOptions(overrides: Partial<CreateERC4626Options> = {}): CreateERC4626Options {
  return {
    signAndBroadcast: vi.fn().mockResolvedValue({ txHash: '0xtx' }),
    vaultAddress: '0x1111111111111111111111111111111111111111',
    ...overrides,
  };
}

describe('createERC4626', () => {
  it('creates an ERC-4626 capability with the expected method surface', () => {
    const capability: ERC4626Capability = createERC4626(mockNetworkConfig, makeOptions());

    expect(typeof capability.convertToAssets).toBe('function');
    expect(typeof capability.convertToShares).toBe('function');
    expect(typeof capability.totalAssets).toBe('function');
    expect(typeof capability.deposit).toBe('function');
    expect(typeof capability.withdraw).toBe('function');
    expect(typeof capability.dispose).toBe('function');
  });

  it('throws for a non-EVM network config', () => {
    expect(() =>
      createERC4626({ ...mockNetworkConfig, ecosystem: 'stellar' } as never, makeOptions())
    ).toThrow(/EVM network configuration/i);
  });

  it('throws for an invalid vaultAddress', () => {
    expect(() =>
      createERC4626(mockNetworkConfig, makeOptions({ vaultAddress: 'not-an-address' }))
    ).toThrow(/Invalid vaultAddress/i);
  });

  it('disposes idempotently and guards access afterwards', () => {
    const capability = createERC4626(mockNetworkConfig, makeOptions());

    expect(() => capability.dispose()).not.toThrow();
    expect(() => capability.dispose()).not.toThrow();
    expect(() => capability.networkConfig).toThrow(RuntimeDisposedError);
  });
});
