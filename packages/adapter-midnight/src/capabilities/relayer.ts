import type {
  NetworkConfig,
  RelayerCapability,
  RelayerDetails,
  RelayerDetailsRich,
  UserRpcProviderConfig,
} from '@openzeppelin/ui-types';
import { logger } from '@openzeppelin/ui-utils';

import {
  getMidnightDefaultServiceConfig,
  getMidnightNetworkServiceForms,
  testMidnightNetworkServiceConnection,
  validateMidnightNetworkServiceConfig,
} from '../configuration/network-services';
import { asMidnightNetworkConfig, withRuntimeCapability } from './helpers';

export function createRelayer(config: NetworkConfig): RelayerCapability {
  const networkConfig = asMidnightNetworkConfig(config);

  return Object.assign(withRuntimeCapability(networkConfig, 'relayer'), {
    async getRelayers(_serviceUrl: string, _accessToken: string): Promise<RelayerDetails[]> {
      logger.warn(
        'adapter-midnight',
        'getRelayers is not implemented for the Midnight adapter yet.'
      );
      return [];
    },
    async getRelayer(
      _serviceUrl: string,
      _accessToken: string,
      _relayerId: string
    ): Promise<RelayerDetailsRich> {
      logger.warn(
        'adapter-midnight',
        'getRelayer is not implemented for the Midnight adapter yet.'
      );
      return {} as RelayerDetailsRich;
    },
    getNetworkServiceForms() {
      return getMidnightNetworkServiceForms();
    },
    validateNetworkServiceConfig: validateMidnightNetworkServiceConfig,
    testNetworkServiceConnection: testMidnightNetworkServiceConnection,
    validateRpcEndpoint(_rpcConfig: UserRpcProviderConfig) {
      return Promise.resolve(true);
    },
    testRpcConnection(_rpcConfig: UserRpcProviderConfig) {
      return Promise.resolve({ success: true });
    },
    getDefaultServiceConfig(serviceId: string) {
      return getMidnightDefaultServiceConfig(networkConfig, serviceId);
    },
  }) as RelayerCapability;
}
