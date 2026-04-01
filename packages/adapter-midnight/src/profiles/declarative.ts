import type { DeclarativeEcosystemRuntime, MidnightNetworkConfig } from '@openzeppelin/ui-types';

import { createRuntime } from './shared-state';

export function createDeclarativeRuntime(
  config: MidnightNetworkConfig,
  options?: { uiKit?: string }
): DeclarativeEcosystemRuntime {
  return createRuntime('declarative', config, options) as DeclarativeEcosystemRuntime;
}
