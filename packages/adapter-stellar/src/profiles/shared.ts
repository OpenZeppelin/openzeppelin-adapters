import type {
  CapabilityFactoryMap,
  EcosystemRuntime,
  NetworkConfig,
  ProfileName,
  StellarNetworkConfig,
  UiKitConfiguration,
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
import { asStellarNetworkConfig } from '../capabilities/helpers';

const PROFILE_REQUIREMENTS: Record<ProfileName, Array<keyof CapabilityFactoryMap>> = {
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
  return profile in PROFILE_REQUIREMENTS;
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

  const missing = PROFILE_REQUIREMENTS[profile].filter(
    (capability) => !capabilityFactories[capability]
  );
  if (missing.length > 0) {
    throw new UnsupportedProfileError(profile, missing.map(String));
  }

  const runtime = {
    networkConfig: config,
    addressing: capabilityFactories.addressing!(config),
    explorer: capabilityFactories.explorer!(config),
    networkCatalog: capabilityFactories.networkCatalog!(),
    uiLabels: capabilityFactories.uiLabels!(),
    ...(PROFILE_REQUIREMENTS[profile].includes('contractLoading')
      ? { contractLoading: capabilityFactories.contractLoading!(config) }
      : {}),
    ...(PROFILE_REQUIREMENTS[profile].includes('schema')
      ? { schema: capabilityFactories.schema!(config) }
      : {}),
    ...(PROFILE_REQUIREMENTS[profile].includes('typeMapping')
      ? { typeMapping: capabilityFactories.typeMapping!(config) }
      : {}),
    ...(PROFILE_REQUIREMENTS[profile].includes('query')
      ? { query: capabilityFactories.query!(config) }
      : {}),
    ...(PROFILE_REQUIREMENTS[profile].includes('execution')
      ? { execution: capabilityFactories.execution!(config) }
      : {}),
    ...(PROFILE_REQUIREMENTS[profile].includes('wallet')
      ? { wallet: capabilityFactories.wallet!(config) }
      : {}),
    ...(PROFILE_REQUIREMENTS[profile].includes('uiKit')
      ? { uiKit: capabilityFactories.uiKit!(config) }
      : {}),
    ...(PROFILE_REQUIREMENTS[profile].includes('relayer')
      ? { relayer: capabilityFactories.relayer!(config) }
      : {}),
    ...(PROFILE_REQUIREMENTS[profile].includes('accessControl')
      ? { accessControl: capabilityFactories.accessControl!(config) }
      : {}),
    dispose() {},
  } as EcosystemRuntime;

  if (options?.uiKit && runtime.uiKit?.configureUiKit) {
    void runtime.uiKit.configureUiKit({
      kitName: options.uiKit as UiKitConfiguration['kitName'],
      kitConfig: {},
    });
  }

  let disposed = false;
  runtime.dispose = () => {
    if (disposed) {
      return;
    }

    disposed = true;
    runtime.contractLoading?.dispose();
    runtime.schema?.dispose();
    runtime.typeMapping?.dispose();
    runtime.query?.dispose();
    runtime.execution?.dispose();
    runtime.wallet?.dispose();
    runtime.uiKit?.dispose();
    runtime.relayer?.dispose();
    runtime.accessControl?.dispose();
  };

  return runtime;
}
