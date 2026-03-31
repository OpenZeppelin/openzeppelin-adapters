import type {
  ContractSchema,
  FunctionParameter,
  NetworkConfig,
  TypeMappingCapability,
} from '@openzeppelin/ui-types';

import {
  generateEvmDefaultField,
  getEvmCompatibleFieldTypes,
  getEvmTypeMappingInfo,
  mapEvmParamTypeToFieldType,
} from '../mapping';
import { asTypedEvmNetworkConfig, withRuntimeCapability } from './helpers';

export function createTypeMapping(config: NetworkConfig): TypeMappingCapability {
  const networkConfig = asTypedEvmNetworkConfig(config);

  return Object.assign(withRuntimeCapability(networkConfig), {
    mapParameterTypeToFieldType(parameterType: string) {
      return mapEvmParamTypeToFieldType(parameterType);
    },
    getCompatibleFieldTypes(parameterType: string) {
      return getEvmCompatibleFieldTypes(parameterType);
    },
    generateDefaultField(parameter: FunctionParameter, _contractSchema?: ContractSchema) {
      return generateEvmDefaultField(parameter);
    },
    getTypeMappingInfo() {
      return getEvmTypeMappingInfo();
    },
  }) as TypeMappingCapability;
}
