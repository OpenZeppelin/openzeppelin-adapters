import type { ComposerEcosystemRuntime, PolkadotNetworkConfig } from '@openzeppelin/ui-types';

import { createRuntime } from './shared-state';

export function createComposerRuntime(
  config: PolkadotNetworkConfig,
  options?: { uiKit?: string }
): ComposerEcosystemRuntime {
  return createRuntime('composer', config, options) as ComposerEcosystemRuntime;
}
