import { createEvmAccessControlService } from '@openzeppelin/adapter-evm-core';
import {
  createLazyRuntimeCapabilityFactories,
  createRuntimeFromFactories as createSharedRuntimeFromFactories,
  isProfileName as isSharedProfileName,
} from '@openzeppelin/adapter-runtime-utils';
import type {
  AccessControlCapability,
  CapabilityFactoryMap,
  EcosystemRuntime,
  NetworkConfig,
  ProfileName,
} from '@openzeppelin/ui-types';
import { UnsupportedProfileError } from '@openzeppelin/ui-types';

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
import { asTypedPolkadotNetworkConfig, guardRuntimeCapability } from '../capabilities/helpers';
import type { TypedPolkadotNetworkConfig } from '../types';

function createRuntimeCapabilityFactories(
  config: TypedPolkadotNetworkConfig
): CapabilityFactoryMap {
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
    accessControl: (_runtimeConfig, getCapability) => {
      const service = createEvmAccessControlService(
        config,
        async (txData, executionConfig, onStatusChange, runtimeApiKey) => {
          const result = await getCapability('execution').signAndBroadcast(
            txData,
            executionConfig,
            onStatusChange ?? (() => {}),
            runtimeApiKey
          );
          return { id: result.txHash };
        }
      );

      return guardRuntimeCapability(
        service,
        config,
        'accessControl',
        () => service.dispose(),
        'subscription'
      ) as AccessControlCapability;
    },
  });
}

export const capabilityFactories: CapabilityFactoryMap = {
  addressing: (_config?: NetworkConfig) => createAddressing(),
  explorer: (config?: NetworkConfig) =>
    createExplorer(config ? asTypedPolkadotNetworkConfig(config) : undefined),
  networkCatalog: createNetworkCatalog,
  uiLabels: createUiLabels,
  contractLoading: (config: NetworkConfig) =>
    createContractLoading(asTypedPolkadotNetworkConfig(config)),
  schema: (config: NetworkConfig) => createSchema(asTypedPolkadotNetworkConfig(config)),
  typeMapping: (config: NetworkConfig) => createTypeMapping(asTypedPolkadotNetworkConfig(config)),
  query: (config: NetworkConfig) => createQuery(asTypedPolkadotNetworkConfig(config)),
  execution: (config: NetworkConfig) => createExecution(asTypedPolkadotNetworkConfig(config)),
  wallet: (config: NetworkConfig) => createWallet(asTypedPolkadotNetworkConfig(config)),
  uiKit: (config: NetworkConfig) => createUiKit(asTypedPolkadotNetworkConfig(config)),
  relayer: (config: NetworkConfig) => createRelayer(asTypedPolkadotNetworkConfig(config)),
  accessControl: (config: NetworkConfig) =>
    createAccessControl(asTypedPolkadotNetworkConfig(config)),
};

export function isProfileName(profile: string): profile is ProfileName {
  return isSharedProfileName(profile);
}

export function createRuntime(
  profile: ProfileName,
  config: TypedPolkadotNetworkConfig,
  options?: { uiKit?: string }
): EcosystemRuntime {
  if (!isProfileName(profile)) {
    throw new TypeError(
      `Invalid profile name: ${profile}. Expected one of declarative, viewer, transactor, composer, operator.`
    );
  }

  if (config.executionType !== 'evm') {
    throw new UnsupportedProfileError(profile, ['evmExecutionPipeline']);
  }

  return createSharedRuntimeFromFactories(
    profile,
    config,
    createRuntimeCapabilityFactories(config),
    options
  );
}
