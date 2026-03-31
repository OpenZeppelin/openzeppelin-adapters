import type {
  CapabilityFactoryMap,
  DeclarativeEcosystemRuntime,
  NetworkConfig,
} from '@openzeppelin/ui-types';

import { createRuntimeFromFactories } from './shared-state';

export function createDeclarativeRuntime(
  config: NetworkConfig,
  factories: CapabilityFactoryMap,
  options?: { uiKit?: string }
): DeclarativeEcosystemRuntime {
  return createRuntimeFromFactories(
    'declarative',
    config,
    factories,
    options
  ) as DeclarativeEcosystemRuntime;
}
