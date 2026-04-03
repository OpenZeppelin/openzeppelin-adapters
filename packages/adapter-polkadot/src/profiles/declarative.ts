import type { DeclarativeEcosystemRuntime, PolkadotNetworkConfig } from '@openzeppelin/ui-types';

import type { TypedPolkadotNetworkConfig } from '../types';
import { createRuntime } from './shared-state';

export function createDeclarativeRuntime(
  config: PolkadotNetworkConfig,
  options?: { uiKit?: string }
): DeclarativeEcosystemRuntime {
  return createRuntime(
    'declarative',
    config as TypedPolkadotNetworkConfig,
    options
  ) as DeclarativeEcosystemRuntime;
}
