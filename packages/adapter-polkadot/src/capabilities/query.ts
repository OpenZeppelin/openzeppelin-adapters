import type {
  ContractFunction,
  ContractSchema,
  NetworkConfig,
  QueryCapability,
} from '@openzeppelin/ui-types';

import * as evm from '../evm';
import { createContractLoading } from './contract-loading';
import {
  assertPolkadotEvmExecution,
  asTypedPolkadotNetworkConfig,
  registerRuntimeCapabilityCleanup,
  withRuntimeCapability,
} from './helpers';

export interface CreateQueryOptions {
  loadContract?: (source: string | Record<string, unknown>) => Promise<ContractSchema>;
}

export function createQuery(
  config: NetworkConfig,
  options: CreateQueryOptions = {}
): QueryCapability {
  const networkConfig = asTypedPolkadotNetworkConfig(config);
  assertPolkadotEvmExecution(networkConfig);

  const fallbackContractLoading = options.loadContract
    ? null
    : createContractLoading(networkConfig);

  const capability = Object.assign(withRuntimeCapability(networkConfig, 'query'), {
    async queryViewFunction(
      address: string,
      functionId: string,
      params: unknown[],
      schema: ContractSchema
    ) {
      return evm.queryViewFunction(address, functionId, params, schema, networkConfig);
    },
    formatFunctionResult(result: unknown, functionDetails: ContractFunction) {
      return evm.formatEvmFunctionResult(result, functionDetails);
    },
    async getCurrentBlock() {
      return evm.getEvmCurrentBlock(networkConfig);
    },
  }) as QueryCapability;

  if (fallbackContractLoading) {
    registerRuntimeCapabilityCleanup(capability, () => fallbackContractLoading.dispose(), 'rpc');
  }

  return capability;
}
