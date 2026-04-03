import type { MidnightNetworkConfig, TransactorEcosystemRuntime } from '@openzeppelin/ui-types';

import { createRuntime } from './shared-state';

export function createTransactorRuntime(
  config: MidnightNetworkConfig,
  options?: { uiKit?: string }
): TransactorEcosystemRuntime {
  return createRuntime('transactor', config, options) as TransactorEcosystemRuntime;
}
