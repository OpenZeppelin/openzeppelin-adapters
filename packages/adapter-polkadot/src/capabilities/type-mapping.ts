import type {
  ContractSchema,
  FieldType,
  FormFieldType,
  FunctionParameter,
  NetworkConfig,
  TypeMappingCapability,
} from '@openzeppelin/ui-types';

import * as evm from '../evm';
import {
  assertPolkadotEvmExecution,
  asTypedPolkadotNetworkConfig,
  withRuntimeCapability,
} from './helpers';

export function createTypeMapping(config: NetworkConfig): TypeMappingCapability {
  const networkConfig = asTypedPolkadotNetworkConfig(config);
  assertPolkadotEvmExecution(networkConfig);

  return Object.assign(withRuntimeCapability(networkConfig, 'typeMapping'), {
    mapParameterTypeToFieldType(paramType: string) {
      return evm.mapEvmParamTypeToFieldType(paramType);
    },
    getCompatibleFieldTypes(paramType: string) {
      return evm.getEvmCompatibleFieldTypes(paramType);
    },
    generateDefaultField<T extends FieldType = FieldType>(
      parameter: FunctionParameter,
      _contractSchema?: ContractSchema
    ): FormFieldType<T> {
      return evm.generateEvmDefaultField(parameter) as FormFieldType<T>;
    },
    getTypeMappingInfo() {
      return evm.getEvmTypeMappingInfo();
    },
  }) as TypeMappingCapability;
}
