import type { SolanaNetworkConfig, TransactorEcosystemRuntime } from '@openzeppelin/ui-types';

import { createRuntime } from './shared-state';

export function createTransactorRuntime(
  config: SolanaNetworkConfig,
  options?: { uiKit?: string }
): TransactorEcosystemRuntime {
  return createRuntime('transactor', config, options) as TransactorEcosystemRuntime;
}
