import type { PolkadotNetworkConfig, ViewerEcosystemRuntime } from '@openzeppelin/ui-types';

import { createRuntime } from './shared-state';

export function createViewerRuntime(
  config: PolkadotNetworkConfig,
  options?: { uiKit?: string }
): ViewerEcosystemRuntime {
  return createRuntime('viewer', config, options) as ViewerEcosystemRuntime;
}
