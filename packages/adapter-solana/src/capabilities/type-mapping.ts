import type {
  ContractSchema,
  FieldType,
  FormFieldType,
  FunctionParameter,
  NetworkConfig,
  TypeMappingCapability,
} from '@openzeppelin/ui-types';

import {
  generateSolanaDefaultField,
  getSolanaCompatibleFieldTypes,
  getSolanaTypeMappingInfo,
  mapSolanaParamTypeToFieldType,
} from '../mapping';
import { asSolanaNetworkConfig, withRuntimeCapability } from './helpers';

export function createTypeMapping(config: NetworkConfig): TypeMappingCapability {
  const networkConfig = asSolanaNetworkConfig(config);

  return Object.assign(withRuntimeCapability(networkConfig, 'typeMapping'), {
    mapParameterTypeToFieldType(parameterType: string) {
      return mapSolanaParamTypeToFieldType(parameterType);
    },
    getCompatibleFieldTypes(parameterType: string) {
      return getSolanaCompatibleFieldTypes(parameterType);
    },
    generateDefaultField<T extends FieldType = FieldType>(
      parameter: FunctionParameter,
      _contractSchema?: ContractSchema
    ): FormFieldType<T> {
      return generateSolanaDefaultField(parameter) as FormFieldType<T>;
    },
    getTypeMappingInfo() {
      return getSolanaTypeMappingInfo();
    },
  }) as TypeMappingCapability;
}
