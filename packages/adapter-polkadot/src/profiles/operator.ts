import type { OperatorEcosystemRuntime, PolkadotNetworkConfig } from '@openzeppelin/ui-types';

import type { TypedPolkadotNetworkConfig } from '../types';
import { createRuntime } from './shared-state';

export function createOperatorRuntime(
  config: PolkadotNetworkConfig,
  options?: { uiKit?: string }
): OperatorEcosystemRuntime {
  return createRuntime(
    'operator',
    config as TypedPolkadotNetworkConfig,
    options
  ) as OperatorEcosystemRuntime;
}
