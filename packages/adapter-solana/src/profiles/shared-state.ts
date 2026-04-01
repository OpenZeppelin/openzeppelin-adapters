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
  SolanaNetworkConfig,
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
} from '../capabilities';
import { asSolanaNetworkConfig } from '../capabilities/helpers';

function createRuntimeCapabilityFactories(config: SolanaNetworkConfig): CapabilityFactoryMap {
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
  });
}

export const capabilityFactories: CapabilityFactoryMap = {
  addressing: (_config?: NetworkConfig) => createAddressing(),
  explorer: (config?: NetworkConfig) =>
    createExplorer(config ? asSolanaNetworkConfig(config) : undefined),
  networkCatalog: createNetworkCatalog,
  uiLabels: createUiLabels,
  contractLoading: (config: NetworkConfig) => createContractLoading(asSolanaNetworkConfig(config)),
  schema: (config: NetworkConfig) => createSchema(asSolanaNetworkConfig(config)),
  typeMapping: (config: NetworkConfig) => createTypeMapping(asSolanaNetworkConfig(config)),
  query: (config: NetworkConfig) => createQuery(asSolanaNetworkConfig(config)),
  execution: (config: NetworkConfig) => createExecution(asSolanaNetworkConfig(config)),
  wallet: (config: NetworkConfig) => createWallet(asSolanaNetworkConfig(config)),
  uiKit: (config: NetworkConfig) => createUiKit(asSolanaNetworkConfig(config)),
  relayer: (config: NetworkConfig) => createRelayer(asSolanaNetworkConfig(config)),
};

export function isProfileName(profile: string): profile is ProfileName {
  return isSharedProfileName(profile);
}

export function createRuntime(
  profile: ProfileName,
  config: SolanaNetworkConfig,
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
