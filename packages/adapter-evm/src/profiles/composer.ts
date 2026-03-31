import type { TypedEvmNetworkConfig } from '@openzeppelin/adapter-evm-core';
import { createComposerRuntime as createCoreComposerRuntime } from '@openzeppelin/adapter-evm-core';
import type { ComposerEcosystemRuntime } from '@openzeppelin/ui-types';

import { capabilityFactories } from './shared';

export function createComposerRuntime(
  config: TypedEvmNetworkConfig,
  options?: { uiKit?: string }
): ComposerEcosystemRuntime {
  return createCoreComposerRuntime(config, capabilityFactories, options);
}
