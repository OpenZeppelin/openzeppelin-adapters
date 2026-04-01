import type { DeclarativeEcosystemRuntime, SolanaNetworkConfig } from '@openzeppelin/ui-types';

import { createRuntime } from './shared-state';

export function createDeclarativeRuntime(
  config: SolanaNetworkConfig,
  options?: { uiKit?: string }
): DeclarativeEcosystemRuntime {
  return createRuntime('declarative', config, options) as DeclarativeEcosystemRuntime;
}
