import type {
  CapabilityFactoryMap,
  NetworkConfig,
  OperatorEcosystemRuntime,
} from '@openzeppelin/ui-types';

import { createRuntimeFromFactories } from './shared';

export function createOperatorRuntime(
  config: NetworkConfig,
  factories: CapabilityFactoryMap,
  options?: { uiKit?: string }
): OperatorEcosystemRuntime {
  return createRuntimeFromFactories(
    'operator',
    config,
    factories,
    options
  ) as OperatorEcosystemRuntime;
}
