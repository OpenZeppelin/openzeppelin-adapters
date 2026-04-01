import type {
  NetworkConfig,
  RelayerCapability,
  UserExplorerConfig,
  UserRpcProviderConfig,
} from '@openzeppelin/ui-types';

import * as evm from '../evm';
import {
  assertPolkadotEvmExecution,
  asTypedPolkadotNetworkConfig,
  withRuntimeCapability,
} from './helpers';

export function createRelayer(config: NetworkConfig): RelayerCapability {
  const networkConfig = asTypedPolkadotNetworkConfig(config);
  assertPolkadotEvmExecution(networkConfig);

  return Object.assign(withRuntimeCapability(networkConfig, 'relayer'), {
    getRelayers(serviceUrl: string, accessToken: string) {
      return evm.getRelayers(serviceUrl, accessToken, networkConfig);
    },
    getRelayer(serviceUrl: string, accessToken: string, relayerId: string) {
      return evm.getRelayer(serviceUrl, accessToken, relayerId, networkConfig);
    },
    getNetworkServiceForms() {
      return evm.getNetworkServiceForms(networkConfig);
    },
    validateNetworkServiceConfig: evm.validateNetworkServiceConfig,
    testNetworkServiceConnection(serviceId: string, values: Record<string, unknown>) {
      return evm.testNetworkServiceConnection(serviceId, values, networkConfig);
    },
    validateRpcEndpoint(rpcConfig: UserRpcProviderConfig) {
      return evm.validateRpcEndpoint(rpcConfig);
    },
    testRpcConnection(rpcConfig: UserRpcProviderConfig) {
      return evm.testRpcConnection(rpcConfig);
    },
    validateExplorerConfig(explorerConfig: UserExplorerConfig) {
      return evm.validateExplorerConfig(explorerConfig);
    },
    testExplorerConnection(explorerConfig: UserExplorerConfig) {
      return evm.testExplorerConnection(explorerConfig, networkConfig);
    },
    getDefaultServiceConfig(serviceId: string) {
      return evm.getPolkadotDefaultServiceConfig(networkConfig, serviceId);
    },
  }) as RelayerCapability;
}
