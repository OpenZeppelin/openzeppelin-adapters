import type {
  CapabilityFactoryMap,
  NetworkConfig,
  TransactorEcosystemRuntime,
} from '@openzeppelin/ui-types';

import { createRuntimeFromFactories } from './shared';

export function createTransactorRuntime(
  config: NetworkConfig,
  factories: CapabilityFactoryMap,
  options?: { uiKit?: string }
): TransactorEcosystemRuntime {
  return createRuntimeFromFactories(
    'transactor',
    config,
    factories,
    options
  ) as TransactorEcosystemRuntime;
}
