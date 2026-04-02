import type {
  ContractFunction,
  ContractSchema,
  NetworkConfig,
  QueryCapability,
} from '@openzeppelin/ui-types';

import { getMidnightCurrentBlock } from '../configuration/rpc';
import { formatMidnightFunctionResult } from '../transform';
import type { MidnightArtifactContext } from './artifact-context';
import { createContractLoading } from './contract-loading';
import {
  asMidnightNetworkConfig,
  registerRuntimeCapabilityCleanup,
  withRuntimeCapability,
} from './helpers';

export interface CreateQueryOptions {
  loadContract?: (source: string | Record<string, unknown>) => Promise<ContractSchema>;
}

export function createQuery(
  config: NetworkConfig,
  artifactContext: MidnightArtifactContext,
  options: CreateQueryOptions = {}
): QueryCapability {
  const networkConfig = asMidnightNetworkConfig(config);

  const fallbackContractLoading = options.loadContract
    ? null
    : createContractLoading(config, artifactContext);

  const capability = Object.assign(withRuntimeCapability(networkConfig, 'query'), {
    async queryViewFunction(
      contractAddress: string,
      functionId: string,
      params: unknown[] = [],
      contractSchema?: ContractSchema
    ) {
      const { queryMidnightViewFunction } = await import('../query');
      return queryMidnightViewFunction(
        contractAddress,
        functionId,
        networkConfig,
        params,
        contractSchema,
        artifactContext.getArtifacts()?.contractModule ?? undefined
      );
    },
    formatFunctionResult(decodedValue: unknown, functionDetails: ContractFunction) {
      return formatMidnightFunctionResult(decodedValue, functionDetails);
    },
    async getCurrentBlock() {
      return getMidnightCurrentBlock();
    },
  }) as QueryCapability;

  if (fallbackContractLoading) {
    registerRuntimeCapabilityCleanup(capability, () => fallbackContractLoading.dispose(), 'rpc');
  }

  return capability;
}
