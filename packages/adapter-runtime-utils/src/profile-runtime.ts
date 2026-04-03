import type {
  CapabilityFactoryMap,
  EcosystemRuntime,
  NetworkConfig,
  ProfileName,
  UiKitConfiguration,
} from '@openzeppelin/ui-types';
import { UnsupportedProfileError } from '@openzeppelin/ui-types';

/**
 * Minimum capability set required to construct each supported runtime profile.
 * Keeping this map centralized ensures all adapters validate profile composition consistently.
 */
export const PROFILE_REQUIREMENTS: Record<ProfileName, Array<keyof CapabilityFactoryMap>> = {
  declarative: ['addressing', 'explorer', 'networkCatalog', 'uiLabels'],
  viewer: [
    'addressing',
    'explorer',
    'networkCatalog',
    'uiLabels',
    'contractLoading',
    'schema',
    'typeMapping',
    'query',
  ],
  transactor: [
    'addressing',
    'explorer',
    'networkCatalog',
    'uiLabels',
    'contractLoading',
    'schema',
    'typeMapping',
    'execution',
    'wallet',
  ],
  composer: [
    'addressing',
    'explorer',
    'networkCatalog',
    'uiLabels',
    'contractLoading',
    'schema',
    'typeMapping',
    'query',
    'execution',
    'wallet',
    'uiKit',
    'relayer',
  ],
  operator: [
    'addressing',
    'explorer',
    'networkCatalog',
    'uiLabels',
    'contractLoading',
    'schema',
    'typeMapping',
    'query',
    'execution',
    'wallet',
    'uiKit',
    'accessControl',
  ],
};

type EventListener = (payload: unknown) => void;

interface RuntimeEventBus {
  emit(event: string, payload?: unknown): void;
  subscribe(event: string, listener: EventListener): () => void;
  dispose(): void;
}

interface ProfileSharedState {
  readonly eventBus: RuntimeEventBus;
  getCapability<K extends keyof CapabilityFactoryMap>(
    key: K
  ): ReturnType<NonNullable<CapabilityFactoryMap[K]>>;
  dispose(): void;
}

const DISPOSABLE_CAPABILITY_KEYS: Array<keyof CapabilityFactoryMap> = [
  'contractLoading',
  'schema',
  'typeMapping',
  'query',
  'execution',
  'uiKit',
  'relayer',
  'accessControl',
  'wallet',
];

function createRuntimeEventBus(): RuntimeEventBus {
  const listeners = new Map<string, Set<EventListener>>();

  return {
    emit(event, payload) {
      listeners.get(event)?.forEach((listener) => listener(payload));
    },

    subscribe(event, listener) {
      const eventListeners = listeners.get(event) ?? new Set<EventListener>();
      eventListeners.add(listener);
      listeners.set(event, eventListeners);

      return () => {
        eventListeners.delete(listener);
        if (eventListeners.size === 0) {
          listeners.delete(event);
        }
      };
    },

    dispose() {
      listeners.clear();
    },
  };
}

function createProfileSharedState(
  config: NetworkConfig,
  factories: CapabilityFactoryMap
): ProfileSharedState {
  const capabilityCache = new Map<keyof CapabilityFactoryMap, unknown>();
  const eventBus = createRuntimeEventBus();

  const getCapability = <K extends keyof CapabilityFactoryMap>(
    key: K
  ): ReturnType<NonNullable<CapabilityFactoryMap[K]>> => {
    if (capabilityCache.has(key)) {
      return capabilityCache.get(key) as ReturnType<NonNullable<CapabilityFactoryMap[K]>>;
    }

    const factory = factories[key];
    if (!factory) {
      throw new Error(`Capability factory "${String(key)}" is not defined.`);
    }

    let capability: unknown;
    switch (key) {
      case 'networkCatalog':
      case 'uiLabels':
        capability = (factory as () => unknown)();
        break;
      case 'addressing':
      case 'explorer':
        capability = (factory as (networkConfig?: NetworkConfig) => unknown)(config);
        break;
      default:
        capability = (factory as (networkConfig: NetworkConfig) => unknown)(config);
        break;
    }

    capabilityCache.set(key, capability);
    return capability as ReturnType<NonNullable<CapabilityFactoryMap[K]>>;
  };

  let disposed = false;

  return {
    eventBus,
    getCapability,
    dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      eventBus.dispose();

      for (const key of DISPOSABLE_CAPABILITY_KEYS) {
        const capability = capabilityCache.get(key);
        if (capability && typeof capability === 'object' && 'dispose' in capability) {
          (capability as { dispose: () => void }).dispose();
        }
      }
    },
  };
}

/**
 * Narrows arbitrary user or config input to a supported runtime profile name.
 */
export function isProfileName(profile: string): profile is ProfileName {
  return profile in PROFILE_REQUIREMENTS;
}

/**
 * Composes a runtime for a profile from adapter capability factories.
 *
 * Capabilities are instantiated lazily, cached for the lifetime of the runtime,
 * and disposed together when the runtime is torn down.
 *
 * @throws {UnsupportedProfileError} When the adapter does not provide every
 * capability required by the selected profile.
 */
export function createRuntimeFromFactories(
  profile: ProfileName,
  config: NetworkConfig,
  factories: CapabilityFactoryMap,
  options?: { uiKit?: string }
): EcosystemRuntime {
  const missing = PROFILE_REQUIREMENTS[profile].filter((capability) => !factories[capability]);
  if (missing.length > 0) {
    throw new UnsupportedProfileError(profile, missing.map(String));
  }

  const sharedState = createProfileSharedState(config, factories);

  const runtime = {
    networkConfig: config,
    addressing: sharedState.getCapability('addressing'),
    explorer: sharedState.getCapability('explorer'),
    networkCatalog: sharedState.getCapability('networkCatalog'),
    uiLabels: sharedState.getCapability('uiLabels'),
    ...(PROFILE_REQUIREMENTS[profile].includes('contractLoading')
      ? { contractLoading: sharedState.getCapability('contractLoading') }
      : {}),
    ...(PROFILE_REQUIREMENTS[profile].includes('schema')
      ? { schema: sharedState.getCapability('schema') }
      : {}),
    ...(PROFILE_REQUIREMENTS[profile].includes('typeMapping')
      ? { typeMapping: sharedState.getCapability('typeMapping') }
      : {}),
    ...(PROFILE_REQUIREMENTS[profile].includes('query')
      ? { query: sharedState.getCapability('query') }
      : {}),
    ...(PROFILE_REQUIREMENTS[profile].includes('execution')
      ? { execution: sharedState.getCapability('execution') }
      : {}),
    ...(PROFILE_REQUIREMENTS[profile].includes('wallet')
      ? { wallet: sharedState.getCapability('wallet') }
      : {}),
    ...(PROFILE_REQUIREMENTS[profile].includes('uiKit')
      ? { uiKit: sharedState.getCapability('uiKit') }
      : {}),
    ...(PROFILE_REQUIREMENTS[profile].includes('relayer')
      ? { relayer: sharedState.getCapability('relayer') }
      : {}),
    ...(PROFILE_REQUIREMENTS[profile].includes('accessControl')
      ? { accessControl: sharedState.getCapability('accessControl') }
      : {}),
    dispose() {
      sharedState.dispose();
    },
  } as EcosystemRuntime;

  if (options?.uiKit && runtime.uiKit?.configureUiKit) {
    void runtime.uiKit.configureUiKit({
      kitName: options.uiKit as UiKitConfiguration['kitName'],
      kitConfig: {},
    });
  }

  sharedState.eventBus.emit('runtime:created', { profile, networkId: config.id });

  return runtime;
}
