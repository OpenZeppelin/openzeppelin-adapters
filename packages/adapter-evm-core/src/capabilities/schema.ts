import type {
  ContractFunction,
  ContractSchema,
  NetworkConfig,
  SchemaCapability,
} from '@openzeppelin/ui-types';

import { isEvmViewFunction } from '../query';
import { asTypedEvmNetworkConfig, withRuntimeCapability } from './helpers';

const AUTO_QUERY_SKIP_NAMES = new Set([
  'admin',
  'implementation',
  'getImplementation',
  '_implementation',
  'proxyAdmin',
  'changeAdmin',
  'upgradeTo',
  'upgradeToAndCall',
]);

export function createSchema(config: NetworkConfig): SchemaCapability {
  const networkConfig = asTypedEvmNetworkConfig(config);

  return Object.assign(withRuntimeCapability(networkConfig), {
    getWritableFunctions(contractSchema: ContractSchema) {
      return contractSchema.functions.filter((fn) => fn.modifiesState);
    },
    isViewFunction(functionDetails: ContractFunction) {
      return isEvmViewFunction(functionDetails);
    },
    filterAutoQueryableFunctions(functions: ContractFunction[]) {
      return functions.filter((fn) => !AUTO_QUERY_SKIP_NAMES.has(fn.name));
    },
  }) as SchemaCapability;
}
