import type { TypedEvmNetworkConfig } from '@openzeppelin/adapter-evm-core';
import { createTransactorRuntime as createCoreTransactorRuntime } from '@openzeppelin/adapter-evm-core';
import type { TransactorEcosystemRuntime } from '@openzeppelin/ui-types';

import { capabilityFactories } from './shared';

export function createTransactorRuntime(
  config: TypedEvmNetworkConfig,
  options?: { uiKit?: string }
): TransactorEcosystemRuntime {
  return createCoreTransactorRuntime(config, capabilityFactories, options);
}
