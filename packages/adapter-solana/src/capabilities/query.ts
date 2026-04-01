import type {
  ContractFunction,
  ContractSchema,
  NetworkConfig,
  QueryCapability,
} from '@openzeppelin/ui-types';

import { getSolanaCurrentBlock } from '../configuration';
import { querySolanaViewFunction } from '../query';
import { formatSolanaFunctionResult } from '../transform';
import { createContractLoading } from './contract-loading';
import {
  asSolanaNetworkConfig,
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
  const networkConfig = asSolanaNetworkConfig(config);

  const fallbackContractLoading = options.loadContract
    ? null
    : createContractLoading(networkConfig);
  const loadContract =
    options.loadContract ??
    ((source: string | Record<string, unknown>) => fallbackContractLoading!.loadContract(source));

  const capability = Object.assign(withRuntimeCapability(networkConfig, 'query'), {
    async queryViewFunction(
      contractAddress: string,
      functionId: string,
      params: unknown[] = [],
      contractSchema?: ContractSchema
    ) {
      return querySolanaViewFunction(
        contractAddress,
        functionId,
        networkConfig,
        params,
        contractSchema,
        null,
        (source: string) => loadContract({ contractAddress: source })
      );
    },
    formatFunctionResult(decodedValue: unknown, functionDetails: ContractFunction) {
      return formatSolanaFunctionResult(decodedValue, functionDetails);
    },
    async getCurrentBlock() {
      return getSolanaCurrentBlock(networkConfig);
    },
  }) as QueryCapability;

  if (fallbackContractLoading) {
    registerRuntimeCapabilityCleanup(capability, () => fallbackContractLoading.dispose(), 'rpc');
  }

  return capability;
}
