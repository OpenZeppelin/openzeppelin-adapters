import type {
  CapabilityFactoryMap,
  EcosystemRuntime,
  NetworkConfig,
  ProfileName,
  UiKitConfiguration,
} from '@openzeppelin/ui-types';
import { UnsupportedProfileError } from '@openzeppelin/ui-types';

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

export function isProfileName(profile: string): profile is ProfileName {
  return profile in PROFILE_REQUIREMENTS;
}

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

  const runtime = {
    networkConfig: config,
    addressing: factories.addressing!(config),
    explorer: factories.explorer!(config),
    networkCatalog: factories.networkCatalog!(),
    uiLabels: factories.uiLabels!(),
    ...(PROFILE_REQUIREMENTS[profile].includes('contractLoading')
      ? { contractLoading: factories.contractLoading!(config) }
      : {}),
    ...(PROFILE_REQUIREMENTS[profile].includes('schema')
      ? { schema: factories.schema!(config) }
      : {}),
    ...(PROFILE_REQUIREMENTS[profile].includes('typeMapping')
      ? { typeMapping: factories.typeMapping!(config) }
      : {}),
    ...(PROFILE_REQUIREMENTS[profile].includes('query') ? { query: factories.query!(config) } : {}),
    ...(PROFILE_REQUIREMENTS[profile].includes('execution')
      ? { execution: factories.execution!(config) }
      : {}),
    ...(PROFILE_REQUIREMENTS[profile].includes('wallet')
      ? { wallet: factories.wallet!(config) }
      : {}),
    ...(PROFILE_REQUIREMENTS[profile].includes('uiKit') ? { uiKit: factories.uiKit!(config) } : {}),
    ...(PROFILE_REQUIREMENTS[profile].includes('relayer')
      ? { relayer: factories.relayer!(config) }
      : {}),
    ...(PROFILE_REQUIREMENTS[profile].includes('accessControl')
      ? { accessControl: factories.accessControl!(config) }
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
