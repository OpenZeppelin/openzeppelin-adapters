import type {
  ContractFunction,
  ContractSchema,
  NetworkConfig,
  SchemaCapability,
} from '@openzeppelin/ui-types';

import { isSolanaViewFunction } from '../query';
import { asSolanaNetworkConfig, withRuntimeCapability } from './helpers';

export function createSchema(config: NetworkConfig): SchemaCapability {
  const networkConfig = asSolanaNetworkConfig(config);

  return Object.assign(withRuntimeCapability(networkConfig, 'schema'), {
    getWritableFunctions(contractSchema: ContractSchema) {
      return contractSchema.functions.filter((fn) => fn.modifiesState);
    },
    isViewFunction(functionDetails: ContractFunction) {
      return isSolanaViewFunction(functionDetails);
    },
  }) as SchemaCapability;
}
