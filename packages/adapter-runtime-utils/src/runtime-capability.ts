import type { NetworkConfig, RuntimeCapability } from '@openzeppelin/ui-types';
import { RuntimeDisposedError } from '@openzeppelin/ui-types';

/**
 * Ordered cleanup buckets for runtime-backed capabilities.
 * Earlier stages release observers and subscriptions before stateful resources
 * such as wallets or RPC clients are torn down.
 */
export type RuntimeCleanupStage = 'listener' | 'subscription' | 'general' | 'wallet' | 'rpc';

/**
 * Disposal order for registered cleanup hooks.
 * Tests assert this sequence because downstream adapters rely on listeners and
 * subscriptions being removed before heavier resources are released.
 */
const CLEANUP_STAGE_ORDER: RuntimeCleanupStage[] = [
  'listener',
  'subscription',
  'general',
  'wallet',
  'rpc',
];

interface RuntimeCapabilityLifecycle {
  isDisposed(): boolean;
  dispose(): void;
  registerCleanup(stage: RuntimeCleanupStage, cleanup: () => void | Promise<void>): void;
  trackPromise<T>(promise: Promise<T>): Promise<T>;
}

const runtimeCapabilityLifecycleSymbol = Symbol('runtimeCapabilityLifecycle');

type RuntimeCapabilityTarget = RuntimeCapability & {
  [runtimeCapabilityLifecycleSymbol]?: RuntimeCapabilityLifecycle;
};

function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof (value as { then: unknown }).then === 'function'
  );
}

function safelyRunCleanup(cleanup: () => void | Promise<void>): void {
  try {
    void Promise.resolve(cleanup()).catch(() => undefined);
  } catch {
    // Swallow teardown failures to keep dispose idempotent.
  }
}

function createRuntimeCapabilityLifecycle(capabilityName: string): RuntimeCapabilityLifecycle {
  let disposed = false;
  const pending = new Set<{
    reject: (error: RuntimeDisposedError) => void;
    settle: () => void;
  }>();
  const cleanups: Record<RuntimeCleanupStage, Array<() => void | Promise<void>>> = {
    listener: [],
    subscription: [],
    general: [],
    wallet: [],
    rpc: [],
  };

  return {
    isDisposed() {
      return disposed;
    },

    dispose() {
      if (disposed) {
        return;
      }

      disposed = true;

      const disposalError = new RuntimeDisposedError(capabilityName);
      for (const operation of [...pending]) {
        operation.reject(disposalError);
      }

      for (const stage of CLEANUP_STAGE_ORDER) {
        for (const cleanup of cleanups[stage]) {
          safelyRunCleanup(cleanup);
        }
      }
    },

    registerCleanup(stage: RuntimeCleanupStage, cleanup: () => void | Promise<void>) {
      cleanups[stage].push(cleanup);
    },

    trackPromise<T>(promise: Promise<T>): Promise<T> {
      if (disposed) {
        return Promise.reject(new RuntimeDisposedError(capabilityName));
      }

      return new Promise<T>((resolve, reject) => {
        let settled = false;

        const operation = {
          reject(error: RuntimeDisposedError) {
            if (settled) {
              return;
            }

            settled = true;
            pending.delete(operation);
            reject(error);
          },
          settle() {
            if (settled) {
              return;
            }

            settled = true;
            pending.delete(operation);
          },
        };

        pending.add(operation);

        void promise.then(
          (result) => {
            if (settled) {
              return;
            }

            operation.settle();
            resolve(result);
          },
          (error) => {
            if (settled) {
              return;
            }

            operation.settle();
            reject(error);
          }
        );
      });
    },
  };
}

function createRuntimeCapabilityProxy<T extends object, TNetworkConfig extends NetworkConfig>(
  target: T,
  networkConfig: TNetworkConfig,
  capabilityName: string,
  lifecycle: RuntimeCapabilityLifecycle
): T & RuntimeCapability {
  const capabilityTarget = target as T & RuntimeCapabilityTarget;

  Object.defineProperties(capabilityTarget, {
    networkConfig: {
      configurable: true,
      enumerable: true,
      get() {
        if (lifecycle.isDisposed()) {
          throw new RuntimeDisposedError(capabilityName);
        }

        return networkConfig;
      },
    },
    dispose: {
      configurable: true,
      enumerable: false,
      value() {
        lifecycle.dispose();
      },
    },
    [runtimeCapabilityLifecycleSymbol]: {
      configurable: false,
      enumerable: false,
      value: lifecycle,
    },
  });

  let capabilityProxy: (T & RuntimeCapability) | undefined;

  capabilityProxy = new Proxy(capabilityTarget as T & RuntimeCapability, {
    get(currentTarget, property, receiver) {
      if (property === runtimeCapabilityLifecycleSymbol) {
        return lifecycle;
      }

      if (property === 'dispose') {
        return Reflect.get(currentTarget, property, receiver);
      }

      const value = Reflect.get(currentTarget, property, receiver);

      if (typeof value === 'function') {
        return (...args: unknown[]) => {
          if (lifecycle.isDisposed()) {
            throw new RuntimeDisposedError(capabilityName);
          }

          const result = Reflect.apply(value, capabilityProxy, args);
          return isPromiseLike(result) ? lifecycle.trackPromise(Promise.resolve(result)) : result;
        };
      }

      if (lifecycle.isDisposed()) {
        throw new RuntimeDisposedError(capabilityName);
      }

      return value;
    },
  });

  return capabilityProxy;
}

/**
 * Creates a minimal runtime capability shell that can be extended with methods
 * while still enforcing disposal semantics and pending-promise rejection.
 */
export function withRuntimeCapability<TNetworkConfig extends NetworkConfig>(
  networkConfig: TNetworkConfig,
  capabilityName = 'capability'
): RuntimeCapability {
  return createRuntimeCapabilityProxy({}, networkConfig, capabilityName, {
    ...createRuntimeCapabilityLifecycle(capabilityName),
  });
}

/**
 * Wraps an existing capability object with runtime disposal guards.
 * Optional cleanup hooks are registered on the same lifecycle so composed
 * services can tear down external resources alongside the capability.
 */
export function guardRuntimeCapability<T extends object, TNetworkConfig extends NetworkConfig>(
  capability: T,
  networkConfig: TNetworkConfig,
  capabilityName: string,
  onDispose?: () => void | Promise<void>,
  cleanupStage: RuntimeCleanupStage = 'general'
): T & RuntimeCapability {
  const lifecycle = createRuntimeCapabilityLifecycle(capabilityName);

  if (onDispose) {
    lifecycle.registerCleanup(cleanupStage, onDispose);
  }

  return createRuntimeCapabilityProxy(capability, networkConfig, capabilityName, lifecycle);
}

/**
 * Registers cleanup work on a runtime capability lifecycle.
 * No-op when the capability was not created through the runtime lifecycle helpers.
 */
export function registerRuntimeCapabilityCleanup(
  capability: RuntimeCapability,
  cleanup: () => void | Promise<void>,
  cleanupStage: RuntimeCleanupStage = 'general'
): void {
  const lifecycle = (capability as RuntimeCapabilityTarget)[runtimeCapabilityLifecycleSymbol];
  lifecycle?.registerCleanup(cleanupStage, cleanup);
}
