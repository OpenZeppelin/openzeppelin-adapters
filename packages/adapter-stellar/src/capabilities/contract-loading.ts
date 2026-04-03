import type { ContractLoadingCapability, NetworkConfig } from '@openzeppelin/ui-types';

import { loadStellarContract, loadStellarContractWithMetadata } from '../contract/loader';
import { validateAndConvertStellarArtifacts } from '../utils';
import {
  asStellarNetworkConfig,
  getStellarContractDefinitionInputs,
  withRuntimeCapability,
} from './helpers';

export function createContractLoading(config: NetworkConfig): ContractLoadingCapability {
  const networkConfig = asStellarNetworkConfig(config);

  return Object.assign(withRuntimeCapability(networkConfig, 'contractLoading'), {
    async loadContract(source: string | Record<string, unknown>) {
      const artifacts = validateAndConvertStellarArtifacts(source);
      const result = await loadStellarContract(artifacts, networkConfig);
      return result.schema;
    },
    async loadContractWithMetadata(source: string | Record<string, unknown>) {
      const artifacts = validateAndConvertStellarArtifacts(source);
      const result = await loadStellarContractWithMetadata(artifacts, networkConfig);

      return {
        schema: result.schema,
        source: result.source,
        metadata: result.metadata,
      };
    },
    getContractDefinitionInputs() {
      return getStellarContractDefinitionInputs();
    },
  }) as ContractLoadingCapability;
}
