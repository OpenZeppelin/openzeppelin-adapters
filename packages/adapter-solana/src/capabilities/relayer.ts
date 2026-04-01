import type {
  NetworkConfig,
  RelayerCapability,
  RelayerDetails,
  RelayerDetailsRich,
  UserRpcProviderConfig,
} from '@openzeppelin/ui-types';
import { logger } from '@openzeppelin/ui-utils';

import { testSolanaRpcConnection, validateSolanaRpcEndpoint } from '../configuration';
import {
  getSolanaDefaultServiceConfig,
  getSolanaNetworkServiceForms,
  testSolanaNetworkServiceConnection,
  validateSolanaNetworkServiceConfig,
} from '../configuration/network-services';
import { asSolanaNetworkConfig, withRuntimeCapability } from './helpers';

export function createRelayer(config: NetworkConfig): RelayerCapability {
  const networkConfig = asSolanaNetworkConfig(config);

  return Object.assign(withRuntimeCapability(networkConfig, 'relayer'), {
    async getRelayers(_serviceUrl: string, _accessToken: string): Promise<RelayerDetails[]> {
      logger.warn('adapter-solana', 'getRelayers is not implemented for the Solana adapter yet.');
      return [];
    },
    async getRelayer(
      _serviceUrl: string,
      _accessToken: string,
      _relayerId: string
    ): Promise<RelayerDetailsRich> {
      logger.warn('adapter-solana', 'getRelayer is not implemented for the Solana adapter yet.');
      return {} as RelayerDetailsRich;
    },
    getNetworkServiceForms() {
      return getSolanaNetworkServiceForms();
    },
    validateNetworkServiceConfig: validateSolanaNetworkServiceConfig,
    testNetworkServiceConnection: testSolanaNetworkServiceConnection,
    validateRpcEndpoint(rpcConfig: UserRpcProviderConfig) {
      return validateSolanaRpcEndpoint(rpcConfig);
    },
    testRpcConnection(rpcConfig: UserRpcProviderConfig) {
      return testSolanaRpcConnection(rpcConfig);
    },
    getDefaultServiceConfig(serviceId: string) {
      return getSolanaDefaultServiceConfig(networkConfig, serviceId);
    },
  }) as RelayerCapability;
}
