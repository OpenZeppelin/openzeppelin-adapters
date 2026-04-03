import type { TypedEvmNetworkConfig } from '@openzeppelin/adapter-evm-core';
import type { DeclarativeEcosystemRuntime } from '@openzeppelin/ui-types';

import { createRuntime } from './shared';

export function createDeclarativeRuntime(
  config: TypedEvmNetworkConfig,
  options?: { uiKit?: string }
): DeclarativeEcosystemRuntime {
  return createRuntime('declarative', config, options) as DeclarativeEcosystemRuntime;
}
