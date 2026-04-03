import { describe, expect, it, vi } from 'vitest';

import type { NetworkConfig, RuntimeCapability } from '@openzeppelin/ui-types';
import { RuntimeDisposedError } from '@openzeppelin/ui-types';

import {
  guardRuntimeCapability,
  registerRuntimeCapabilityCleanup,
  withRuntimeCapability,
} from '../runtime-capability';

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
} as unknown as NetworkConfig;

function createDeferredPromise<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, reject, resolve };
}

describe('runtime-capability utilities', () => {
  it('rejects pending async work and runs registered cleanup once', async () => {
    const cleanup = vi.fn();
    const deferred = createDeferredPromise<string>();
    const capability = Object.assign(withRuntimeCapability(mockNetworkConfig, 'query'), {
      load: vi.fn(() => deferred.promise),
    }) as RuntimeCapability & {
      load: () => Promise<string>;
    };

    registerRuntimeCapabilityCleanup(capability, cleanup, 'rpc');

    const pendingLoad = capability.load();

    capability.dispose();
    capability.dispose();

    await expect(pendingLoad).rejects.toBeInstanceOf(RuntimeDisposedError);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(() => capability.networkConfig).toThrow(RuntimeDisposedError);
    expect(() => capability.load()).toThrow(RuntimeDisposedError);

    deferred.reject(new Error('ignored after disposal'));
  });

  it('guards existing capability objects and calls onDispose once', () => {
    const onDispose = vi.fn();
    const guarded = guardRuntimeCapability(
      {
        getValue: () => 42,
      },
      mockNetworkConfig,
      'service',
      onDispose
    );

    expect(guarded.getValue()).toBe(42);

    guarded.dispose();
    guarded.dispose();

    expect(onDispose).toHaveBeenCalledTimes(1);
    expect(() => guarded.getValue()).toThrow(RuntimeDisposedError);
    expect(() => guarded.networkConfig).toThrow(RuntimeDisposedError);
  });

  it('runs registered cleanup stages in the documented disposal order', () => {
    const cleanupOrder: string[] = [];
    const capability = withRuntimeCapability(mockNetworkConfig, 'wallet');

    registerRuntimeCapabilityCleanup(capability, () => {
      cleanupOrder.push('general-1');
    });
    registerRuntimeCapabilityCleanup(
      capability,
      () => {
        cleanupOrder.push('rpc');
      },
      'rpc'
    );
    registerRuntimeCapabilityCleanup(
      capability,
      () => {
        cleanupOrder.push('listener-1');
      },
      'listener'
    );
    registerRuntimeCapabilityCleanup(
      capability,
      () => {
        cleanupOrder.push('wallet');
      },
      'wallet'
    );
    registerRuntimeCapabilityCleanup(capability, () => {
      cleanupOrder.push('general-2');
    });
    registerRuntimeCapabilityCleanup(
      capability,
      () => {
        cleanupOrder.push('subscription');
      },
      'subscription'
    );
    registerRuntimeCapabilityCleanup(
      capability,
      () => {
        cleanupOrder.push('listener-2');
      },
      'listener'
    );

    capability.dispose();

    expect(cleanupOrder).toEqual([
      'listener-1',
      'listener-2',
      'subscription',
      'general-1',
      'general-2',
      'wallet',
      'rpc',
    ]);
  });
});
