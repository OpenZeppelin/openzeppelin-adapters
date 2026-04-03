import type {
  NetworkConfig,
  NetworkServiceForm,
  RelayerCapability,
  UserExplorerConfig,
  UserRpcProviderConfig,
} from '@openzeppelin/ui-types';

import {
  testEvmExplorerConnection,
  testEvmRpcConnection,
  validateEvmExplorerConfig,
  validateEvmRpcEndpoint,
} from '../configuration';
import { RelayerExecutionStrategy } from '../transaction';
import type { TypedEvmNetworkConfig } from '../types';
import { asTypedEvmNetworkConfig, withRuntimeCapability } from './helpers';

export interface CreateRelayerOptions {
  getDefaultServiceConfig?: (
    networkConfig: TypedEvmNetworkConfig,
    serviceId: string
  ) => Record<string, unknown> | null;
  getNetworkServiceForms?: (networkConfig: TypedEvmNetworkConfig) => NetworkServiceForm[];
  testNetworkServiceConnection?: (
    serviceId: string,
    values: Record<string, unknown>,
    networkConfig: TypedEvmNetworkConfig
  ) => Promise<{ success: boolean; latency?: number; error?: string }>;
  validateNetworkServiceConfig?: (
    serviceId: string,
    values: Record<string, unknown>
  ) => Promise<boolean>;
}

export function createRelayer(
  config: NetworkConfig,
  options: CreateRelayerOptions = {}
): RelayerCapability {
  const networkConfig = asTypedEvmNetworkConfig(config);
  const relayerStrategy = new RelayerExecutionStrategy();

  return Object.assign(withRuntimeCapability(networkConfig, 'relayer'), {
    getRelayers(serviceUrl: string, accessToken: string) {
      return relayerStrategy.getEvmRelayers(serviceUrl, accessToken, networkConfig);
    },
    getRelayer(serviceUrl: string, accessToken: string, relayerId: string) {
      return relayerStrategy.getEvmRelayer(serviceUrl, accessToken, relayerId, networkConfig);
    },
    getNetworkServiceForms() {
      return options.getNetworkServiceForms?.(networkConfig) ?? [];
    },
    validateNetworkServiceConfig: options.validateNetworkServiceConfig,
    testNetworkServiceConnection(serviceId: string, values: Record<string, unknown>) {
      return (
        options.testNetworkServiceConnection?.(serviceId, values, networkConfig) ??
        Promise.resolve({ success: false, error: 'Network service testing is not configured.' })
      );
    },
    validateRpcEndpoint(rpcConfig: UserRpcProviderConfig) {
      return Promise.resolve(validateEvmRpcEndpoint(rpcConfig));
    },
    testRpcConnection(rpcConfig: UserRpcProviderConfig) {
      return testEvmRpcConnection(rpcConfig);
    },
    validateExplorerConfig(explorerConfig: UserExplorerConfig) {
      return Promise.resolve(validateEvmExplorerConfig(explorerConfig));
    },
    testExplorerConnection(explorerConfig: UserExplorerConfig) {
      return testEvmExplorerConnection(explorerConfig, networkConfig);
    },
    getDefaultServiceConfig(serviceId: string) {
      return options.getDefaultServiceConfig?.(networkConfig, serviceId) ?? null;
    },
  }) as RelayerCapability;
}
