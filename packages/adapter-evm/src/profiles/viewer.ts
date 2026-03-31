import type { TypedEvmNetworkConfig } from '@openzeppelin/adapter-evm-core';
import { createViewerRuntime as createCoreViewerRuntime } from '@openzeppelin/adapter-evm-core';
import type { ViewerEcosystemRuntime } from '@openzeppelin/ui-types';

import { capabilityFactories } from './shared';

export function createViewerRuntime(
  config: TypedEvmNetworkConfig,
  options?: { uiKit?: string }
): ViewerEcosystemRuntime {
  return createCoreViewerRuntime(config, capabilityFactories, options);
}
