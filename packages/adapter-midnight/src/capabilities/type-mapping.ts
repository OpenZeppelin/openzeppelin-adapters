import type {
  ContractSchema,
  FormFieldType,
  FunctionParameter,
  NetworkConfig,
  TypeMappingCapability,
} from '@openzeppelin/ui-types';

import { getMidnightTypeMappingInfo } from '../mapping/constants';
import { generateMidnightDefaultField } from '../mapping/field-generator';
import {
  getMidnightCompatibleFieldTypes,
  mapMidnightParameterTypeToFieldType,
} from '../mapping/type-mapper';
import { deriveIdentitySecretPropertyName } from '../utils/identity-secret-derivation';
import type { MidnightArtifactContext } from './artifact-context';
import { asMidnightNetworkConfig, withRuntimeCapability } from './helpers';

export function createTypeMapping(
  config: NetworkConfig,
  artifactContext: MidnightArtifactContext
): TypeMappingCapability {
  const networkConfig = asMidnightNetworkConfig(config);

  return Object.assign(withRuntimeCapability(networkConfig, 'typeMapping'), {
    mapParameterTypeToFieldType(parameterType: string) {
      return mapMidnightParameterTypeToFieldType(parameterType);
    },
    getCompatibleFieldTypes(parameterType: string) {
      return getMidnightCompatibleFieldTypes(parameterType);
    },
    generateDefaultField(parameter: FunctionParameter, contractSchema?: ContractSchema) {
      return generateMidnightDefaultField(parameter, contractSchema) as FormFieldType;
    },
    getTypeMappingInfo() {
      return getMidnightTypeMappingInfo();
    },
    getRuntimeFieldBinding() {
      const artifacts = artifactContext.getArtifacts();
      const derivedProp =
        artifacts?.identitySecretKeyPropertyName ||
        deriveIdentitySecretPropertyName(artifacts) ||
        undefined;
      const hasDetectedProperty = derivedProp && derivedProp.length > 0;
      const generalGuidance =
        'Midnight contracts differ: the identity secret may be stored under different private-state property names. You can find this in your generated types (PrivateState in .d.ts) or in witnesses code (privateState.<prop>). The secret is injected at runtime and never persisted.';

      return {
        key: 'organizerSecret',
        label: 'Identity Secret',
        helperText:
          'Hex-encoded identity secret; used for identity-restricted circuits and never stored',
        propertyNameInput: {
          metadataKey: 'identitySecretKeyPropertyName',
          label: 'Secret Key Property Name',
          placeholder: 'e.g., secretKey',
          defaultValue: derivedProp,
          visible: true,
          helperText: [
            hasDetectedProperty &&
              `Detected "${derivedProp}" in your artifacts. Change if your contract uses a different private-state property (e.g., organizerSecretKey, secretKey, ownerKey).`,
            generalGuidance,
          ]
            .filter(Boolean)
            .join(' '),
        },
      };
    },
  }) as TypeMappingCapability;
}
