import type { CapabilityFactoryMap, NetworkConfig } from '@openzeppelin/ui-types';

type RuntimeCapabilityInstance<K extends keyof CapabilityFactoryMap> = ReturnType<
  NonNullable<CapabilityFactoryMap[K]>
>;

type GetRuntimeCapability = <K extends keyof CapabilityFactoryMap>(
  key: K
) => RuntimeCapabilityInstance<K>;

/**
 * Creates one runtime-scoped capability instance, with access to other lazily
 * memoized capabilities in the same runtime graph.
 */
export type RuntimeCapabilityCreator<
  TConfig extends NetworkConfig,
  K extends keyof CapabilityFactoryMap,
> = (config: TConfig, getCapability: GetRuntimeCapability) => RuntimeCapabilityInstance<K>;

/**
 * Partial set of runtime capability creators used to assemble a lazily resolved
 * `CapabilityFactoryMap` for a concrete network configuration.
 */
export type RuntimeCapabilityCreatorMap<TConfig extends NetworkConfig> = {
  [K in keyof CapabilityFactoryMap]?: RuntimeCapabilityCreator<TConfig, K>;
};

/**
 * Converts runtime-scoped capability creators into the factory surface expected
 * by adapter profile composition, while memoizing each capability per runtime.
 */
export function createLazyRuntimeCapabilityFactories<TConfig extends NetworkConfig>(
  config: TConfig,
  creators: RuntimeCapabilityCreatorMap<TConfig>
): CapabilityFactoryMap {
  const capabilityCache = new Map<keyof CapabilityFactoryMap, unknown>();

  const getCapability: GetRuntimeCapability = <K extends keyof CapabilityFactoryMap>(
    key: K
  ): RuntimeCapabilityInstance<K> => {
    if (capabilityCache.has(key)) {
      return capabilityCache.get(key) as RuntimeCapabilityInstance<K>;
    }

    const creator = creators[key];
    if (!creator) {
      throw new Error(`Capability factory "${String(key)}" is not defined.`);
    }

    const capability = creator(config, getCapability);
    capabilityCache.set(key, capability);
    return capability;
  };

  return {
    addressing: creators.addressing
      ? (_config?: NetworkConfig) => getCapability('addressing')
      : undefined,
    explorer: creators.explorer
      ? (_config?: NetworkConfig) => getCapability('explorer')
      : undefined,
    networkCatalog: creators.networkCatalog ? () => getCapability('networkCatalog') : undefined,
    uiLabels: creators.uiLabels ? () => getCapability('uiLabels') : undefined,
    contractLoading: creators.contractLoading
      ? (_config: NetworkConfig) => getCapability('contractLoading')
      : undefined,
    schema: creators.schema ? (_config: NetworkConfig) => getCapability('schema') : undefined,
    typeMapping: creators.typeMapping
      ? (_config: NetworkConfig) => getCapability('typeMapping')
      : undefined,
    query: creators.query ? (_config: NetworkConfig) => getCapability('query') : undefined,
    execution: creators.execution
      ? (_config: NetworkConfig) => getCapability('execution')
      : undefined,
    wallet: creators.wallet ? (_config: NetworkConfig) => getCapability('wallet') : undefined,
    uiKit: creators.uiKit ? (_config: NetworkConfig) => getCapability('uiKit') : undefined,
    relayer: creators.relayer ? (_config: NetworkConfig) => getCapability('relayer') : undefined,
    accessControl: creators.accessControl
      ? (_config: NetworkConfig) => getCapability('accessControl')
      : undefined,
  };
}
