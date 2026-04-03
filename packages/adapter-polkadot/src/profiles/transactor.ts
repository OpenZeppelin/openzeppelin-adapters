import type { PolkadotNetworkConfig, TransactorEcosystemRuntime } from '@openzeppelin/ui-types';

import type { TypedPolkadotNetworkConfig } from '../types';
import { createRuntime } from './shared-state';

export function createTransactorRuntime(
  config: PolkadotNetworkConfig,
  options?: { uiKit?: string }
): TransactorEcosystemRuntime {
  return createRuntime(
    'transactor',
    config as TypedPolkadotNetworkConfig,
    options
  ) as TransactorEcosystemRuntime;
}
