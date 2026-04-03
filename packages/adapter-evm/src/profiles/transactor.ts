import type { TypedEvmNetworkConfig } from '@openzeppelin/adapter-evm-core';
import type { TransactorEcosystemRuntime } from '@openzeppelin/ui-types';

import { createRuntime } from './shared';

export function createTransactorRuntime(
  config: TypedEvmNetworkConfig,
  options?: { uiKit?: string }
): TransactorEcosystemRuntime {
  return createRuntime('transactor', config, options) as TransactorEcosystemRuntime;
}
