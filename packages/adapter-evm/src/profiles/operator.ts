import type { TypedEvmNetworkConfig } from '@openzeppelin/adapter-evm-core';
import { createOperatorRuntime as createCoreOperatorRuntime } from '@openzeppelin/adapter-evm-core';
import type { OperatorEcosystemRuntime } from '@openzeppelin/ui-types';

import { capabilityFactories } from './shared';

export function createOperatorRuntime(
  config: TypedEvmNetworkConfig,
  options?: { uiKit?: string }
): OperatorEcosystemRuntime {
  return createCoreOperatorRuntime(config, capabilityFactories, options);
}
