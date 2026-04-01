import type { MidnightNetworkConfig, OperatorEcosystemRuntime } from '@openzeppelin/ui-types';

import { createRuntime } from './shared-state';

export function createOperatorRuntime(
  config: MidnightNetworkConfig,
  options?: { uiKit?: string }
): OperatorEcosystemRuntime {
  return createRuntime('operator', config, options) as OperatorEcosystemRuntime;
}
