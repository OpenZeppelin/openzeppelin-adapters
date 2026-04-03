import type { ComposerEcosystemRuntime, StellarNetworkConfig } from '@openzeppelin/ui-types';

import { createRuntime } from './shared-state';

export function createComposerRuntime(
  config: StellarNetworkConfig,
  options?: { uiKit?: string }
): ComposerEcosystemRuntime {
  return createRuntime('composer', config, options) as ComposerEcosystemRuntime;
}
