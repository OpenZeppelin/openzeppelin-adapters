import type {
  ContractSchema,
  ExecutionCapability,
  ExecutionConfig,
  FormFieldType,
  NetworkConfig,
  TransactionStatusUpdate,
} from '@openzeppelin/ui-types';

import {
  executeLocallyIfPossible,
  formatMidnightTransactionData,
  signAndBroadcastMidnightTransaction,
} from '../transaction';
import type { WriteContractParameters } from '../types/transaction';
import type { MidnightArtifactContext } from './artifact-context';
import { asMidnightNetworkConfig, withRuntimeCapability } from './helpers';

export function createExecution(
  config: NetworkConfig,
  artifactContext: MidnightArtifactContext
): ExecutionCapability {
  const networkConfig = asMidnightNetworkConfig(config);

  return Object.assign(withRuntimeCapability(networkConfig, 'execution'), {
    formatTransactionData(
      contractSchema: ContractSchema,
      functionId: string,
      submittedInputs: Record<string, unknown>,
      fields: FormFieldType[]
    ) {
      const artifacts = artifactContext.getArtifacts();
      return formatMidnightTransactionData(
        contractSchema,
        functionId,
        submittedInputs,
        fields,
        artifacts
      );
    },
    async signAndBroadcast(
      transactionData: unknown,
      executionConfig: ExecutionConfig,
      onStatusChange: (status: string, details: TransactionStatusUpdate) => void,
      runtimeApiKey?: string,
      runtimeSecret?: string
    ) {
      const artifacts = artifactContext.getArtifacts();
      const txData = transactionData as WriteContractParameters;

      const localResult = await executeLocallyIfPossible(txData, artifacts, onStatusChange);
      if (localResult) {
        return localResult;
      }

      return signAndBroadcastMidnightTransaction(
        transactionData,
        executionConfig,
        networkConfig,
        artifacts,
        onStatusChange,
        runtimeApiKey,
        runtimeSecret
      );
    },
    async getSupportedExecutionMethods() {
      const { getMidnightSupportedExecutionMethods } = await import('../configuration/execution');
      return getMidnightSupportedExecutionMethods();
    },
    async validateExecutionConfig(config: ExecutionConfig) {
      const { validateMidnightExecutionConfig } = await import('../configuration/execution');
      return validateMidnightExecutionConfig(config);
    },
  }) as ExecutionCapability;
}
