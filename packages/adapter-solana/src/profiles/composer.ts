import type { ComposerEcosystemRuntime, SolanaNetworkConfig } from '@openzeppelin/ui-types';

import { createRuntime } from './shared-state';

export function createComposerRuntime(
  config: SolanaNetworkConfig,
  options?: { uiKit?: string }
): ComposerEcosystemRuntime {
  return createRuntime('composer', config, options) as ComposerEcosystemRuntime;
}
