import type { TypedEvmNetworkConfig } from '@openzeppelin/adapter-evm-core';
import {
  createAccessControl as createCoreAccessControl,
  createRuntime as createCoreRuntime,
} from '@openzeppelin/adapter-evm-core';
import { createLazyRuntimeCapabilityFactories } from '@openzeppelin/adapter-runtime-utils';
import type {
  CapabilityFactoryMap,
  EcosystemRuntime,
  NetworkConfig,
  ProfileName,
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

function toTypedEvmNetworkConfig(config: NetworkConfig): TypedEvmNetworkConfig {
  if (config.ecosystem !== 'evm') {
    throw new Error(`Expected an EVM network configuration, received ${config.ecosystem}.`);
  }

  return config as TypedEvmNetworkConfig;
}

export const capabilityFactories: CapabilityFactoryMap = {
  addressing: (_config?: NetworkConfig) => createAddressing(),
  explorer: (config?: NetworkConfig) =>
    createExplorer(config ? toTypedEvmNetworkConfig(config) : undefined),
  networkCatalog: createNetworkCatalog,
  uiLabels: createUiLabels,
  contractLoading: (config: NetworkConfig) =>
    createContractLoading(toTypedEvmNetworkConfig(config)),
  schema: (config: NetworkConfig) => createSchema(toTypedEvmNetworkConfig(config)),
  typeMapping: (config: NetworkConfig) => createTypeMapping(toTypedEvmNetworkConfig(config)),
  query: (config: NetworkConfig) => createQuery(toTypedEvmNetworkConfig(config)),
  execution: (config: NetworkConfig) => createExecution(toTypedEvmNetworkConfig(config)),
  wallet: (config: NetworkConfig) => createWallet(toTypedEvmNetworkConfig(config)),
  uiKit: (config: NetworkConfig) => createUiKit(toTypedEvmNetworkConfig(config)),
  relayer: (config: NetworkConfig) => createRelayer(toTypedEvmNetworkConfig(config)),
  accessControl: (config: NetworkConfig) => createAccessControl(toTypedEvmNetworkConfig(config)),
};

function createRuntimeCapabilityFactories(config: TypedEvmNetworkConfig): CapabilityFactoryMap {
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
    accessControl: (_runtimeConfig, getCapability) =>
      createCoreAccessControl(config, {
        signAndBroadcast: (
          transactionData,
          executionConfig,
          onStatusChange,
          runtimeApiKey,
          runtimeSecret
        ) =>
          getCapability('execution').signAndBroadcast(
            transactionData,
            executionConfig,
            onStatusChange as Parameters<ReturnType<typeof createExecution>['signAndBroadcast']>[2],
            runtimeApiKey,
            runtimeSecret
          ),
      }),
  });
}

export function createRuntime(
  profile: ProfileName,
  config: TypedEvmNetworkConfig,
  options?: { uiKit?: string }
): EcosystemRuntime {
  return createCoreRuntime(profile, config, createRuntimeCapabilityFactories(config), options);
}
