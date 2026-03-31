import type {
  ContractFunction,
  ContractSchema,
  NetworkConfig,
  QueryCapability,
} from '@openzeppelin/ui-types';

import { getCurrentLedger } from '../access-control/onchain-reader';
import { queryStellarViewFunction } from '../query';
import { formatStellarFunctionResult } from '../transform';
import { createContractLoading } from './contract-loading';
import { asStellarNetworkConfig, withRuntimeCapability } from './helpers';

export interface CreateQueryOptions {
  loadContract?: (source: string | Record<string, unknown>) => Promise<ContractSchema>;
}

export function createQuery(
  config: NetworkConfig,
  options: CreateQueryOptions = {}
): QueryCapability {
  const networkConfig = asStellarNetworkConfig(config);
  const fallbackContractLoading = options.loadContract
    ? null
    : createContractLoading(networkConfig);
  const loadContract =
    options.loadContract ??
    ((source: string | Record<string, unknown>) => fallbackContractLoading!.loadContract(source));

  return Object.assign(withRuntimeCapability(networkConfig), {
    async queryViewFunction(
      contractAddress: string,
      functionId: string,
      params: unknown[] = [],
      contractSchema?: ContractSchema
    ): Promise<unknown> {
      return queryStellarViewFunction(
        contractAddress,
        functionId,
        networkConfig,
        params,
        contractSchema,
        async (address: string) => loadContract({ contractAddress: address })
      );
    },
    formatFunctionResult(result: unknown, functionDetails: ContractFunction) {
      return formatStellarFunctionResult(result, functionDetails);
    },
    getCurrentBlock() {
      return getCurrentLedger(networkConfig);
    },
  }) as QueryCapability;
}
