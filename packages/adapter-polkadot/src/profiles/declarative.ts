import type { DeclarativeEcosystemRuntime, PolkadotNetworkConfig } from '@openzeppelin/ui-types';

import { createRuntime } from './shared-state';

export function createDeclarativeRuntime(
  config: PolkadotNetworkConfig,
  options?: { uiKit?: string }
): DeclarativeEcosystemRuntime {
  return createRuntime('declarative', config, options) as DeclarativeEcosystemRuntime;
}
