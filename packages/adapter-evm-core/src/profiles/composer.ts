import type {
  CapabilityFactoryMap,
  ComposerEcosystemRuntime,
  NetworkConfig,
} from '@openzeppelin/ui-types';

import { createRuntimeFromFactories } from './shared';

export function createComposerRuntime(
  config: NetworkConfig,
  factories: CapabilityFactoryMap,
  options?: { uiKit?: string }
): ComposerEcosystemRuntime {
  return createRuntimeFromFactories(
    'composer',
    config,
    factories,
    options
  ) as ComposerEcosystemRuntime;
}
