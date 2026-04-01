import type { ComposerEcosystemRuntime, MidnightNetworkConfig } from '@openzeppelin/ui-types';

import { createRuntime } from './shared-state';

export function createComposerRuntime(
  config: MidnightNetworkConfig,
  options?: { uiKit?: string }
): ComposerEcosystemRuntime {
  return createRuntime('composer', config, options) as ComposerEcosystemRuntime;
}
