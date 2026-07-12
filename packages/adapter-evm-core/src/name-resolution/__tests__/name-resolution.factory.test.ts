/**
 * SF-2 · `capabilities/name-resolution.ts` — `createNameResolution` factory test suite.
 *
 * Verifies the guarded capability surface the runtime actually hands consumers: the `RuntimeCapability`
 * shape (INV-1), the use-after-dispose → `RuntimeDisposedError` boundary that is the SOLE sanctioned
 * throw (INV-6), idempotent + observably-inert dispose (INV-17), borrowed-client no-dispose ownership
 * through the factory (INV-15), and the dependency-injection seam (INV-20). Mirrors the sibling
 * `erc4626.factory.test.ts` conventions.
 */
import { describe, expect, it, vi } from 'vitest';

import type { NameResolutionCapability } from '@openzeppelin/ui-types';
import { RuntimeDisposedError } from '@openzeppelin/ui-types';

import { createNameResolution } from '../../capabilities/name-resolution';
import { EVM_NETWORK_CONFIG, makeClient, VITALIK_ADDRESS } from './fixtures';

describe('createNameResolution — capability shape (INV-1 / INV-20)', () => {
  it('exposes the NameResolutionCapability method surface', () => {
    const { client } = makeClient();
    const capability: NameResolutionCapability = createNameResolution(EVM_NETWORK_CONFIG, {
      publicClient: client,
    });

    expect(typeof capability.isValidName).toBe('function');
    expect(typeof capability.resolveName).toBe('function');
    expect(typeof capability.dispose).toBe('function');
  });

  it('is always constructible on EVM even for a network without a Universal Resolver', () => {
    // Whole-capability omission is reserved for non-EVM adapters (SC-006). On EVM the capability is
    // present and reports UNSUPPORTED_NETWORK at call time, rather than being absent.
    const { client } = makeClient({ supported: false });
    expect(() => createNameResolution(EVM_NETWORK_CONFIG, { publicClient: client })).not.toThrow();
  });

  it('throws for a non-EVM network config (asTypedEvmNetworkConfig guard)', () => {
    const { client } = makeClient();
    expect(() =>
      createNameResolution({ ...EVM_NETWORK_CONFIG, ecosystem: 'stellar' } as never, {
        publicClient: client,
      })
    ).toThrow(/EVM network configuration/i);
  });

  it('resolves forward through the guarded surface (DI seam intact — INV-20)', async () => {
    const { client, getEnsAddress } = makeClient();
    const capability = createNameResolution(EVM_NETWORK_CONFIG, { publicClient: client });

    const result = await capability.resolveName!('vitalik.eth');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.address).toBe(VITALIK_ADDRESS);
    expect(getEnsAddress).toHaveBeenCalledTimes(1);
  });
});

describe('createNameResolution — use-after-dispose is the sole sanctioned throw (INV-6)', () => {
  it('accessing a method after dispose throws RuntimeDisposedError', () => {
    const { client } = makeClient();
    const capability = createNameResolution(EVM_NETWORK_CONFIG, { publicClient: client });

    capability.dispose();

    // The guard proxy raises BEFORE the body runs, so the mapper never sees it (INV-6 / Invariants Q1).
    expect(() => capability.resolveName!('vitalik.eth')).toThrow(RuntimeDisposedError);
    expect(() => capability.networkConfig).toThrow(RuntimeDisposedError);
  });

  it('a live (non-disposed) capability never throws for an expected failure — it resolves', async () => {
    const { client } = makeClient({ getEnsAddress: vi.fn().mockResolvedValue(null) });
    const capability = createNameResolution(EVM_NETWORK_CONFIG, { publicClient: client });

    const result = await capability.resolveName!('vitalik.eth');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NAME_NOT_FOUND');
  });
});

describe('createNameResolution — dispose is idempotent & observably inert (INV-15 / INV-17)', () => {
  it('dispose() twice does not throw and never tears down the borrowed client', async () => {
    const getEnsAddress = vi.fn().mockResolvedValue(VITALIK_ADDRESS);
    const transportClose = vi.fn();
    const client = { chain: makeClient().client.chain, getEnsAddress, transportClose };
    const capability = createNameResolution(EVM_NETWORK_CONFIG, {
      publicClient: client as unknown as Parameters<typeof createNameResolution>[1]['publicClient'],
    });

    expect(() => capability.dispose()).not.toThrow();
    expect(() => capability.dispose()).not.toThrow(); // idempotent

    expect(transportClose).not.toHaveBeenCalled(); // borrowed client never closed
  });
});
