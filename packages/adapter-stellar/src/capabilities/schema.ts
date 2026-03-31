import type {
  ContractFunction,
  ContractSchema,
  NetworkConfig,
  SchemaCapability,
} from '@openzeppelin/ui-types';

import { getStellarWritableFunctions, isStellarViewFunction } from '../query';
import { asStellarNetworkConfig, withRuntimeCapability } from './helpers';

export function createSchema(config: NetworkConfig): SchemaCapability {
  const networkConfig = asStellarNetworkConfig(config);

  return Object.assign(withRuntimeCapability(networkConfig), {
    getWritableFunctions(contractSchema: ContractSchema) {
      return getStellarWritableFunctions(contractSchema);
    },
    isViewFunction(functionDetails: ContractFunction) {
      return isStellarViewFunction(functionDetails);
    },
  }) as SchemaCapability;
}
