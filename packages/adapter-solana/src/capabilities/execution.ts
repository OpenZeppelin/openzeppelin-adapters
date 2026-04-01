import type {
  ContractSchema,
  ExecutionCapability,
  ExecutionConfig,
  FormFieldType,
  NetworkConfig,
  TransactionStatusUpdate,
} from '@openzeppelin/ui-types';

import {
  getSolanaSupportedExecutionMethods,
  validateSolanaExecutionConfig,
} from '../configuration';
import {
  formatSolanaTransactionData,
  signAndBroadcastSolanaTransaction,
  waitForSolanaTransactionConfirmation,
} from '../transaction';
import { asSolanaNetworkConfig, withRuntimeCapability } from './helpers';

export function createExecution(config: NetworkConfig): ExecutionCapability {
  const networkConfig = asSolanaNetworkConfig(config);

  return Object.assign(withRuntimeCapability(networkConfig, 'execution'), {
    formatTransactionData(
      contractSchema: ContractSchema,
      functionId: string,
      submittedInputs: Record<string, unknown>,
      fields: FormFieldType[]
    ) {
      return formatSolanaTransactionData(contractSchema, functionId, submittedInputs, fields);
    },
    async signAndBroadcast(
      transactionData: unknown,
      executionConfig: ExecutionConfig,
      onStatusChange: (status: string, details: TransactionStatusUpdate) => void,
      runtimeApiKey?: string,
      runtimeSecret?: string
    ) {
      void onStatusChange;
      void runtimeApiKey;
      void runtimeSecret;
      return signAndBroadcastSolanaTransaction(transactionData, executionConfig);
    },
    getSupportedExecutionMethods: () => getSolanaSupportedExecutionMethods(),
    validateExecutionConfig(configArg: ExecutionConfig) {
      return validateSolanaExecutionConfig(configArg);
    },
    async waitForTransactionConfirmation(txHash: string) {
      if (waitForSolanaTransactionConfirmation) {
        return waitForSolanaTransactionConfirmation(txHash);
      }
      return { status: 'success' as const };
    },
  }) as ExecutionCapability;
}
