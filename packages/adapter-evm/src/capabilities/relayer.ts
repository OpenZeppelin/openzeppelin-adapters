import type { TypedEvmNetworkConfig } from '@openzeppelin/adapter-evm-core';
import {
  createRelayer as createCoreRelayer,
  testEvmNetworkServiceConnection,
  validateEvmNetworkServiceConfig,
} from '@openzeppelin/adapter-evm-core';

import { getEvmDefaultServiceConfig, getEvmNetworkServiceForms } from '../configuration';

export function createRelayer(config: TypedEvmNetworkConfig) {
  return createCoreRelayer(config, {
    getDefaultServiceConfig: (networkConfig, serviceId) =>
      getEvmDefaultServiceConfig(networkConfig, serviceId),
    getNetworkServiceForms: (networkConfig) => getEvmNetworkServiceForms(networkConfig),
    testNetworkServiceConnection: (serviceId, values, networkConfig) =>
      testEvmNetworkServiceConnection(serviceId, values, networkConfig),
    validateNetworkServiceConfig: validateEvmNetworkServiceConfig,
  });
}
