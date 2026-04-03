import type { ContractLoadingCapability, NetworkConfig } from '@openzeppelin/ui-types';

import * as evm from '../evm';
import {
  assertPolkadotEvmExecution,
  asTypedPolkadotNetworkConfig,
  withRuntimeCapability,
} from './helpers';

export function createContractLoading(config: NetworkConfig): ContractLoadingCapability {
  const networkConfig = asTypedPolkadotNetworkConfig(config);
  assertPolkadotEvmExecution(networkConfig);

  return Object.assign(withRuntimeCapability(networkConfig, 'contractLoading'), {
    async loadContract(source: string | Record<string, unknown>) {
      const address = typeof source === 'string' ? source : '';
      const options = typeof source === 'string' ? undefined : { artifacts: source };
      return evm.loadContract(address, networkConfig, options);
    },
    async loadContractWithMetadata(source: string | Record<string, unknown>) {
      return evm.loadContractWithMetadata(source, networkConfig);
    },
    getContractDefinitionInputs() {
      return evm.getContractDefinitionInputs();
    },
    getSupportedContractDefinitionProviders() {
      return [
        {
          key: 'etherscan',
          label: networkConfig.networkCategory === 'hub' ? 'Routescan' : 'Moonscan',
        },
        { key: 'sourcify', label: 'Sourcify' },
        { key: 'manual', label: 'Manual' },
      ];
    },
    compareContractDefinitions: evm.compareContractDefinitions,
    validateContractDefinition: evm.validateContractDefinition,
    hashContractDefinition: evm.hashContractDefinition,
  }) as ContractLoadingCapability;
}
