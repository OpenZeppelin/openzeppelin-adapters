import type {
  CapabilityFactoryMap,
  NetworkConfig,
  ViewerEcosystemRuntime,
} from '@openzeppelin/ui-types';

import { createRuntimeFromFactories } from './shared';

export function createViewerRuntime(
  config: NetworkConfig,
  factories: CapabilityFactoryMap,
  options?: { uiKit?: string }
): ViewerEcosystemRuntime {
  return createRuntimeFromFactories('viewer', config, factories, options) as ViewerEcosystemRuntime;
}
