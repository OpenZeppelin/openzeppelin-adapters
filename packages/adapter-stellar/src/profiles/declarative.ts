import type { DeclarativeEcosystemRuntime, StellarNetworkConfig } from '@openzeppelin/ui-types';

import { createRuntime } from './shared';

export function createDeclarativeRuntime(
  config: StellarNetworkConfig,
  options?: { uiKit?: string }
): DeclarativeEcosystemRuntime {
  return createRuntime('declarative', config, options) as DeclarativeEcosystemRuntime;
}
