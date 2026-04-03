import type { ContractLoadingCapability, NetworkConfig } from '@openzeppelin/ui-types';

import {
  compareContractDefinitions,
  hashContractDefinition,
  loadContractSchema,
  loadContractWithFullMetadata,
  validateContractDefinition,
} from '../abi';
import {
  asTypedEvmNetworkConfig,
  getEvmContractDefinitionInputs,
  getEvmContractDefinitionProviders,
  withRuntimeCapability,
} from './helpers';

export function createContractLoading(config: NetworkConfig): ContractLoadingCapability {
  const networkConfig = asTypedEvmNetworkConfig(config);

  return Object.assign(withRuntimeCapability(networkConfig, 'contractLoading'), {
    loadContract(source: string | Record<string, unknown>) {
      return loadContractSchema(source, networkConfig);
    },
    loadContractWithMetadata(source: string | Record<string, unknown>) {
      return loadContractWithFullMetadata(source, networkConfig);
    },
    getContractDefinitionInputs() {
      return getEvmContractDefinitionInputs();
    },
    getSupportedContractDefinitionProviders() {
      return getEvmContractDefinitionProviders();
    },
    compareContractDefinitions,
    validateContractDefinition,
    hashContractDefinition,
  }) as ContractLoadingCapability;
}
