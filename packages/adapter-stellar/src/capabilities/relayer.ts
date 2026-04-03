import type {
  NetworkConfig,
  RelayerCapability,
  UserRpcProviderConfig,
} from '@openzeppelin/ui-types';
import { logger } from '@openzeppelin/ui-utils';

import {
  getStellarDefaultServiceConfig,
  getStellarNetworkServiceForms,
  testStellarNetworkServiceConnection,
  testStellarRpcConnection,
  validateStellarNetworkServiceConfig,
  validateStellarRpcEndpoint,
} from '../configuration';
import { RelayerExecutionStrategy } from '../transaction/relayer';
import { asStellarNetworkConfig, withRuntimeCapability } from './helpers';

export function createRelayer(config: NetworkConfig): RelayerCapability {
  const networkConfig = asStellarNetworkConfig(config);
  const relayerStrategy = new RelayerExecutionStrategy();

  return Object.assign(withRuntimeCapability(networkConfig, 'relayer'), {
    async getRelayers(serviceUrl: string, accessToken: string) {
      try {
        return await relayerStrategy.getStellarRelayers(serviceUrl, accessToken, networkConfig);
      } catch (error) {
        logger.error('createRelayer', 'Failed to fetch Stellar relayers:', error);
        return [];
      }
    },
    async getRelayer(serviceUrl: string, accessToken: string, relayerId: string) {
      try {
        return await relayerStrategy.getStellarRelayer(
          serviceUrl,
          accessToken,
          relayerId,
          networkConfig
        );
      } catch (error) {
        logger.error('createRelayer', 'Failed to fetch Stellar relayer details:', error);
        return {} as Awaited<ReturnType<RelayerCapability['getRelayer']>>;
      }
    },
    getNetworkServiceForms() {
      return getStellarNetworkServiceForms();
    },
    validateNetworkServiceConfig: validateStellarNetworkServiceConfig,
    testNetworkServiceConnection: testStellarNetworkServiceConnection,
    validateRpcEndpoint(rpcConfig: UserRpcProviderConfig) {
      return Promise.resolve(validateStellarRpcEndpoint(rpcConfig));
    },
    testRpcConnection(rpcConfig: UserRpcProviderConfig) {
      return testStellarRpcConnection(rpcConfig);
    },
    getDefaultServiceConfig(serviceId: string) {
      return getStellarDefaultServiceConfig(networkConfig, serviceId);
    },
  }) as RelayerCapability;
}
