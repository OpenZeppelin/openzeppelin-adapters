import type { TypedEvmNetworkConfig } from '@openzeppelin/adapter-evm-core';
import type { OperatorEcosystemRuntime } from '@openzeppelin/ui-types';

import { createRuntime } from './shared';

export function createOperatorRuntime(
  config: TypedEvmNetworkConfig,
  options?: { uiKit?: string }
): OperatorEcosystemRuntime {
  return createRuntime('operator', config, options) as OperatorEcosystemRuntime;
}
