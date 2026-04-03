import type { SolanaNetworkConfig, ViewerEcosystemRuntime } from '@openzeppelin/ui-types';

import { createRuntime } from './shared-state';

export function createViewerRuntime(
  config: SolanaNetworkConfig,
  options?: { uiKit?: string }
): ViewerEcosystemRuntime {
  return createRuntime('viewer', config, options) as ViewerEcosystemRuntime;
}
