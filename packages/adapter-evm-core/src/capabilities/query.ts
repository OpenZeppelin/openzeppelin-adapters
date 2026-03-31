import type {
  ContractFunction,
  ContractSchema,
  NetworkConfig,
  QueryCapability,
} from '@openzeppelin/ui-types';

import { getEvmCurrentBlock, resolveRpcUrl } from '../configuration';
import { queryEvmViewFunction as queryCoreViewFunction } from '../query';
import { formatEvmFunctionResult } from '../transform';
import { createContractLoading } from './contract-loading';
import { asTypedEvmNetworkConfig, withRuntimeCapability } from './helpers';

export interface CreateQueryOptions {
  getCurrentBlock?: () => Promise<number>;
  loadContract?: (source: string | Record<string, unknown>) => Promise<ContractSchema>;
}

export function createQuery(
  config: NetworkConfig,
  options: CreateQueryOptions = {}
): QueryCapability {
  const networkConfig = asTypedEvmNetworkConfig(config);
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
      const schema = contractSchema ?? (await loadContract({ contractAddress }));
      const rpcUrl = resolveRpcUrl(networkConfig);

      return queryCoreViewFunction(
        contractAddress,
        functionId,
        params,
        schema,
        rpcUrl,
        networkConfig
      );
    },
    formatFunctionResult(result: unknown, functionDetails: ContractFunction) {
      return formatEvmFunctionResult(result, functionDetails);
    },
    getCurrentBlock: options.getCurrentBlock ?? (() => getEvmCurrentBlock(networkConfig)),
  }) as QueryCapability;
}
