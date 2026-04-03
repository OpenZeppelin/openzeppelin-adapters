import {
  createLazyRuntimeCapabilityFactories,
  createRuntimeFromFactories as createSharedRuntimeFromFactories,
  isProfileName as isSharedProfileName,
} from '@openzeppelin/adapter-runtime-utils';
import type {
  CapabilityFactoryMap,
  EcosystemRuntime,
  NetworkConfig,
  ProfileName,
  StellarNetworkConfig,
} from '@openzeppelin/ui-types';

import {
  createAccessControl,
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
} from '../capabilities';
import { asStellarNetworkConfig } from '../capabilities/helpers';

function createRuntimeCapabilityFactories(config: StellarNetworkConfig): CapabilityFactoryMap {
  return createLazyRuntimeCapabilityFactories(config, {
    addressing: () => createAddressing(),
    explorer: () => createExplorer(config),
    networkCatalog: () => createNetworkCatalog(),
    uiLabels: () => createUiLabels(),
    contractLoading: () => createContractLoading(config),
    schema: () => createSchema(config),
    typeMapping: () => createTypeMapping(config),
    query: (_runtimeConfig, getCapability) =>
      createQuery(config, {
        loadContract: (source) => getCapability('contractLoading').loadContract(source),
      }),
    execution: () => createExecution(config),
    wallet: () => createWallet(config),
    uiKit: () => createUiKit(config),
    relayer: () => createRelayer(config),
    accessControl: () => createAccessControl(config),
  });
}

export const capabilityFactories: CapabilityFactoryMap = {
  addressing: (_config?: NetworkConfig) => createAddressing(),
  explorer: (config?: NetworkConfig) =>
    createExplorer(config ? asStellarNetworkConfig(config) : undefined),
  networkCatalog: createNetworkCatalog,
  uiLabels: createUiLabels,
  contractLoading: (config: NetworkConfig) => createContractLoading(asStellarNetworkConfig(config)),
  schema: (config: NetworkConfig) => createSchema(asStellarNetworkConfig(config)),
  typeMapping: (config: NetworkConfig) => createTypeMapping(asStellarNetworkConfig(config)),
  query: (config: NetworkConfig) => createQuery(asStellarNetworkConfig(config)),
  execution: (config: NetworkConfig) => createExecution(asStellarNetworkConfig(config)),
  wallet: (config: NetworkConfig) => createWallet(asStellarNetworkConfig(config)),
  uiKit: (config: NetworkConfig) => createUiKit(asStellarNetworkConfig(config)),
  relayer: (config: NetworkConfig) => createRelayer(asStellarNetworkConfig(config)),
  accessControl: (config: NetworkConfig) => createAccessControl(asStellarNetworkConfig(config)),
};

export function isProfileName(profile: string): profile is ProfileName {
  return isSharedProfileName(profile);
}

export function createRuntime(
  profile: ProfileName,
  config: StellarNetworkConfig,
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
