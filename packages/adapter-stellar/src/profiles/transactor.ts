import type { StellarNetworkConfig, TransactorEcosystemRuntime } from '@openzeppelin/ui-types';

import { createRuntime } from './shared-state';

export function createTransactorRuntime(
  config: StellarNetworkConfig,
  options?: { uiKit?: string }
): TransactorEcosystemRuntime {
  return createRuntime('transactor', config, options) as TransactorEcosystemRuntime;
}
