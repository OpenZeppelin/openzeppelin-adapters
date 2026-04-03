import type {
  ContractFunction,
  ContractSchema,
  NetworkConfig,
  SchemaCapability,
} from '@openzeppelin/ui-types';

import * as evm from '../evm';
import * as evmUi from '../evm/ui';
import {
  assertPolkadotEvmExecution,
  asTypedPolkadotNetworkConfig,
  withRuntimeCapability,
} from './helpers';

export function createSchema(config: NetworkConfig): SchemaCapability {
  const networkConfig = asTypedPolkadotNetworkConfig(config);
  assertPolkadotEvmExecution(networkConfig);

  return Object.assign(withRuntimeCapability(networkConfig, 'schema'), {
    isViewFunction(func: ContractFunction) {
      return evm.isViewFunction(func);
    },
    getWritableFunctions(contractSchema: ContractSchema) {
      return evmUi.getWritableFunctions(contractSchema.functions);
    },
    filterAutoQueryableFunctions(functions: ContractFunction[]) {
      return evmUi.filterAutoQueryableFunctions(functions);
    },
  }) as SchemaCapability;
}
