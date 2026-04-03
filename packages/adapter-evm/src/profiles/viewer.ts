import type { TypedEvmNetworkConfig } from '@openzeppelin/adapter-evm-core';
import type { ViewerEcosystemRuntime } from '@openzeppelin/ui-types';

import { createRuntime } from './shared';

export function createViewerRuntime(
  config: TypedEvmNetworkConfig,
  options?: { uiKit?: string }
): ViewerEcosystemRuntime {
  return createRuntime('viewer', config, options) as ViewerEcosystemRuntime;
}
