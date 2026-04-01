import type {
  ContractFunction,
  ContractSchema,
  NetworkConfig,
  SchemaCapability,
} from '@openzeppelin/ui-types';

import { FunctionDecorationsService } from '../analysis/function-decorations-service';
import { isPureCircuit } from '../utils';
import type { MidnightArtifactContext } from './artifact-context';
import { asMidnightNetworkConfig, withRuntimeCapability } from './helpers';

export function createSchema(
  config: NetworkConfig,
  artifactContext: MidnightArtifactContext
): SchemaCapability {
  const networkConfig = asMidnightNetworkConfig(config);
  const decorationsService = new FunctionDecorationsService();

  return Object.assign(withRuntimeCapability(networkConfig, 'schema'), {
    getWritableFunctions(contractSchema: ContractSchema) {
      return contractSchema.functions.filter((fn: ContractFunction): boolean => fn.modifiesState);
    },
    isViewFunction(functionDetails: ContractFunction) {
      return !functionDetails.modifiesState && !isPureCircuit(functionDetails);
    },
    async getFunctionDecorations() {
      const artifacts = artifactContext.getArtifacts();
      if (!artifacts) {
        return undefined;
      }
      return decorationsService.analyzeFunctionDecorations(artifacts);
    },
  }) as SchemaCapability;
}
