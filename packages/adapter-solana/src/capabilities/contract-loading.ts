import type {
  ContractLoadingCapability,
  FormFieldType,
  NetworkConfig,
} from '@openzeppelin/ui-types';

import { validateAndConvertSolanaArtifacts } from '../utils';
import { asSolanaNetworkConfig, withRuntimeCapability } from './helpers';

export function createContractLoading(config: NetworkConfig): ContractLoadingCapability {
  const networkConfig = asSolanaNetworkConfig(config);

  return Object.assign(withRuntimeCapability(networkConfig, 'contractLoading'), {
    async loadContract(source: string | Record<string, unknown>) {
      const artifacts = validateAndConvertSolanaArtifacts(source);

      return {
        name: 'SolanaProgram',
        address: artifacts.contractAddress,
        ecosystem: 'solana',
        functions: [],
        events: [],
      };
    },
    getContractDefinitionInputs(): FormFieldType[] {
      return [
        {
          id: 'contractAddress',
          name: 'contractAddress',
          label: 'Program ID',
          type: 'blockchain-address',
          validation: { required: true },
          placeholder: 'Enter Solana program ID',
        },
      ];
    },
  }) as ContractLoadingCapability;
}
