import {
  createLazyRuntimeCapabilityFactories,
  createRuntimeFromFactories as createSharedRuntimeFromFactories,
  isProfileName as isSharedProfileName,
} from '@openzeppelin/adapter-runtime-utils';
import type {
  CapabilityFactoryMap,
  EcosystemRuntime,
  MidnightNetworkConfig,
  NetworkConfig,
  ProfileName,
} from '@openzeppelin/ui-types';

import {
  createAddressing,
  createContractLoading,
  createExecution,
  createExplorer,
  createNetworkCatalog,
  createQuery,
  createRelayer,
  createSchema,
  createTypeMapping,
  createUiKit,
  createUiLabels,
  createWallet,
  getSharedMidnightArtifactContext,
} from '../capabilities';
import { asMidnightNetworkConfig } from '../capabilities/helpers';

function createRuntimeCapabilityFactories(config: MidnightNetworkConfig): CapabilityFactoryMap {
  const artifactContext = getSharedMidnightArtifactContext(config);

  return createLazyRuntimeCapabilityFactories(config, {
    addressing: () => createAddressing(),
    explorer: () => createExplorer(config),
    networkCatalog: () => createNetworkCatalog(),
    uiLabels: () => createUiLabels(),
    contractLoading: () => createContractLoading(config, artifactContext),
    schema: () => createSchema(config, artifactContext),
    typeMapping: () => createTypeMapping(config, artifactContext),
    query: (_runtimeConfig, getCapability) =>
      createQuery(config, artifactContext, {
        loadContract: (source) => getCapability('contractLoading').loadContract(source),
      }),
    execution: () => createExecution(config, artifactContext),
    wallet: () => createWallet(config),
    uiKit: () => createUiKit(config),
    relayer: () => createRelayer(config),
  });
}

export const capabilityFactories: CapabilityFactoryMap = {
  addressing: (_config?: NetworkConfig) => createAddressing(),
  explorer: (config?: NetworkConfig) =>
    createExplorer(config ? asMidnightNetworkConfig(config) : undefined),
  networkCatalog: createNetworkCatalog,
  uiLabels: createUiLabels,
  contractLoading: (config: NetworkConfig) =>
    createContractLoading(
      asMidnightNetworkConfig(config),
      getSharedMidnightArtifactContext(asMidnightNetworkConfig(config))
    ),
  schema: (config: NetworkConfig) =>
    createSchema(
      asMidnightNetworkConfig(config),
      getSharedMidnightArtifactContext(asMidnightNetworkConfig(config))
    ),
  typeMapping: (config: NetworkConfig) =>
    createTypeMapping(
      asMidnightNetworkConfig(config),
      getSharedMidnightArtifactContext(asMidnightNetworkConfig(config))
    ),
  query: (config: NetworkConfig) =>
    createQuery(
      asMidnightNetworkConfig(config),
      getSharedMidnightArtifactContext(asMidnightNetworkConfig(config))
    ),
  execution: (config: NetworkConfig) =>
    createExecution(
      asMidnightNetworkConfig(config),
      getSharedMidnightArtifactContext(asMidnightNetworkConfig(config))
    ),
  wallet: (config: NetworkConfig) => createWallet(asMidnightNetworkConfig(config)),
  uiKit: (config: NetworkConfig) => createUiKit(asMidnightNetworkConfig(config)),
  relayer: (config: NetworkConfig) => createRelayer(asMidnightNetworkConfig(config)),
};

export function isProfileName(profile: string): profile is ProfileName {
  return isSharedProfileName(profile);
}

export function createRuntime(
  profile: ProfileName,
  config: MidnightNetworkConfig,
  options?: { uiKit?: string }
): EcosystemRuntime {
  if (!isProfileName(profile)) {
    throw new TypeError(
      `Invalid profile name: ${profile}. Expected one of declarative, viewer, transactor, composer, operator.`
    );
  }

  return createSharedRuntimeFromFactories(
    profile,
    config,
    createRuntimeCapabilityFactories(config),
    options
  );
}
