import type { OperatorEcosystemRuntime, SolanaNetworkConfig } from '@openzeppelin/ui-types';

import { createRuntime } from './shared-state';

export function createOperatorRuntime(
  config: SolanaNetworkConfig,
  options?: { uiKit?: string }
): OperatorEcosystemRuntime {
  return createRuntime('operator', config, options) as OperatorEcosystemRuntime;
}
