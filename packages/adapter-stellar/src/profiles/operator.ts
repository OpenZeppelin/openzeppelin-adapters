import type { OperatorEcosystemRuntime, StellarNetworkConfig } from '@openzeppelin/ui-types';

import { createRuntime } from './shared';

export function createOperatorRuntime(
  config: StellarNetworkConfig,
  options?: { uiKit?: string }
): OperatorEcosystemRuntime {
  return createRuntime('operator', config, options) as OperatorEcosystemRuntime;
}
