import {
  createRuntimeFromFactories as createSharedRuntimeFromFactories,
  isProfileName as isSharedProfileName,
} from '@openzeppelin/adapter-runtime-utils';
import type {
  CapabilityFactoryMap,
  EcosystemRuntime,
  NetworkConfig,
  ProfileName,
} from '@openzeppelin/ui-types';

export function isProfileName(profile: string): profile is ProfileName {
  return isSharedProfileName(profile);
}

export function createRuntimeFromFactories(
  profile: ProfileName,
  config: NetworkConfig,
  factories: CapabilityFactoryMap,
  options?: { uiKit?: string }
): EcosystemRuntime {
  return createSharedRuntimeFromFactories(profile, config, factories, options);
}
