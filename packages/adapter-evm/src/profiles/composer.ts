import type { TypedEvmNetworkConfig } from '@openzeppelin/adapter-evm-core';
import type { ComposerEcosystemRuntime } from '@openzeppelin/ui-types';

import { createRuntime } from './shared';

export function createComposerRuntime(
  config: TypedEvmNetworkConfig,
  options?: { uiKit?: string }
): ComposerEcosystemRuntime {
  return createRuntime('composer', config, options) as ComposerEcosystemRuntime;
}
