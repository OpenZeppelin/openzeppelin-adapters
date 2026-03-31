import type { TypedEvmNetworkConfig } from '@openzeppelin/adapter-evm-core';
import { createRuntime as createCoreRuntime } from '@openzeppelin/adapter-evm-core';
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

export function createRuntime(
  profile: ProfileName,
  config: TypedEvmNetworkConfig,
  options?: { uiKit?: string }
): EcosystemRuntime {
  return createCoreRuntime(profile, config, capabilityFactories, options);
}
