/**
 * Factory-creation tests for `createIRS` (US2).
 *
 * Asserts the capability shape, that `dispose()` is idempotent (FR-016), and that the
 * `RuntimeCapability` guard rejects access after disposal.
 */
import { describe, expect, it, vi } from 'vitest';

import type { IRSCapability } from '@openzeppelin/ui-types';
import { RuntimeDisposedError } from '@openzeppelin/ui-types';

import { createIRS, type CreateIRSOptions } from '../../capabilities/irs';

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

function makeOptions(overrides: Partial<CreateIRSOptions> = {}): CreateIRSOptions {
  return {
    signAndBroadcast: vi.fn().mockResolvedValue({ txHash: '0xtx' }),
    addresses: {
      identityRegistry: '0x1111111111111111111111111111111111111111',
      identityFactory: '0x2222222222222222222222222222222222222222',
      trustedIssuersRegistry: '0x3333333333333333333333333333333333333333',
    },
    ...overrides,
  };
}

describe('createIRS', () => {
  it('creates an IRS capability with the expected method surface', () => {
    const capability: IRSCapability = createIRS(mockNetworkConfig, makeOptions());

    expect(typeof capability.getOnchainId).toBe('function');
    expect(typeof capability.isVerified).toBe('function');
    expect(typeof capability.getJurisdiction).toBe('function');
    expect(typeof capability.buildClaimPayload).toBe('function');
    expect(typeof capability.deployOnchainId).toBe('function');
    expect(typeof capability.registerTrustedIssuer).toBe('function');
    expect(typeof capability.attachClaim).toBe('function');
    expect(typeof capability.registerIdentity).toBe('function');
    expect(typeof capability.dispose).toBe('function');
  });

  it('throws for a non-EVM network config', () => {
    expect(() =>
      createIRS({ ...mockNetworkConfig, ecosystem: 'stellar' } as never, makeOptions())
    ).toThrow(/EVM network configuration/i);
  });

  it('throws for an invalid contract address in options', () => {
    const opts = makeOptions();
    expect(() =>
      createIRS(mockNetworkConfig, {
        ...opts,
        addresses: { ...opts.addresses, identityFactory: 'not-an-address' },
      })
    ).toThrow(/Invalid addresses\.identityFactory/i);
  });

  it('throws for an invalid trustedIssuer when provided', () => {
    expect(() =>
      createIRS(mockNetworkConfig, makeOptions({ trustedIssuer: 'not-an-address' }))
    ).toThrow(/Invalid trustedIssuer/i);
  });

  it('disposes idempotently and guards access afterwards', () => {
    const capability = createIRS(mockNetworkConfig, makeOptions());

    expect(() => capability.dispose()).not.toThrow();
    expect(() => capability.dispose()).not.toThrow();
    expect(() => capability.networkConfig).toThrow(RuntimeDisposedError);
  });
});
