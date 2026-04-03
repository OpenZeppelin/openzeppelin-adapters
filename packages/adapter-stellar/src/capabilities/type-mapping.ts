import type {
  ContractSchema,
  FunctionParameter,
  NetworkConfig,
  TypeMappingCapability,
} from '@openzeppelin/ui-types';

import {
  generateStellarDefaultField,
  getStellarCompatibleFieldTypes,
  getStellarTypeMappingInfo,
  mapStellarParameterTypeToFieldType,
} from '../mapping';
import { asStellarNetworkConfig, withRuntimeCapability } from './helpers';

export function createTypeMapping(config: NetworkConfig): TypeMappingCapability {
  const networkConfig = asStellarNetworkConfig(config);

  return Object.assign(withRuntimeCapability(networkConfig, 'typeMapping'), {
    mapParameterTypeToFieldType(parameterType: string) {
      return mapStellarParameterTypeToFieldType(parameterType);
    },
    getCompatibleFieldTypes(parameterType: string) {
      return getStellarCompatibleFieldTypes(parameterType);
    },
    generateDefaultField(parameter: FunctionParameter, contractSchema?: ContractSchema) {
      return generateStellarDefaultField(parameter, contractSchema);
    },
    getTypeMappingInfo() {
      return getStellarTypeMappingInfo();
    },
  }) as TypeMappingCapability;
}
