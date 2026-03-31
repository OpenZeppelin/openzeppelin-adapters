import type { TypedEvmNetworkConfig } from '@openzeppelin/adapter-evm-core';
import { createDeclarativeRuntime as createCoreDeclarativeRuntime } from '@openzeppelin/adapter-evm-core';
import type { DeclarativeEcosystemRuntime } from '@openzeppelin/ui-types';

import { capabilityFactories } from './shared';

export function createDeclarativeRuntime(
  config: TypedEvmNetworkConfig,
  options?: { uiKit?: string }
): DeclarativeEcosystemRuntime {
  return createCoreDeclarativeRuntime(config, capabilityFactories, options);
}
