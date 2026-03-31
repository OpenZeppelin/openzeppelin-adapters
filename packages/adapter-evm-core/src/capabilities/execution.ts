import type {
  ContractSchema,
  ExecutionCapability,
  ExecutionConfig,
  ExecutionMethodDetail,
  FormFieldType,
  NetworkConfig,
  TransactionStatusUpdate,
  TxStatus,
  WalletConnectionStatus,
} from '@openzeppelin/ui-types';

import {
  DEFAULT_DISCONNECTED_STATUS,
  executeEvmTransaction,
  formatEvmTransactionData,
  validateEvmExecutionConfig,
  waitForEvmTransactionConfirmation,
  type EvmWalletImplementation,
} from '../index';
import type { WriteContractParameters } from '../types';
import {
  asTypedEvmNetworkConfig,
  getEvmSupportedExecutionMethods,
  withRuntimeCapability,
} from './helpers';

export interface CreateExecutionOptions {
  getSupportedExecutionMethods?: () => Promise<ExecutionMethodDetail[]>;
  getWalletConnectionStatus?: () => WalletConnectionStatus;
  getWalletImplementation: () => Promise<EvmWalletImplementation>;
}

export function createExecution(
  config: NetworkConfig,
  options: CreateExecutionOptions
): ExecutionCapability {
  const networkConfig = asTypedEvmNetworkConfig(config);

  return Object.assign(withRuntimeCapability(networkConfig), {
    formatTransactionData(
      contractSchema: ContractSchema,
      functionId: string,
      submittedInputs: Record<string, unknown>,
      fields: FormFieldType[]
    ) {
      return formatEvmTransactionData(contractSchema, functionId, submittedInputs, fields);
    },
    async signAndBroadcast(
      transactionData: unknown,
      executionConfig: ExecutionConfig,
      onStatusChange: (status: string, details: TransactionStatusUpdate) => void,
      runtimeApiKey?: string,
      runtimeSecret?: string
    ) {
      void runtimeSecret;

      return executeEvmTransaction(
        transactionData as WriteContractParameters,
        executionConfig,
        await options.getWalletImplementation(),
        onStatusChange as (status: TxStatus, details: TransactionStatusUpdate) => void,
        runtimeApiKey
      );
    },
    getSupportedExecutionMethods:
      options.getSupportedExecutionMethods ?? getEvmSupportedExecutionMethods,
    validateExecutionConfig(executionConfig: ExecutionConfig) {
      return validateEvmExecutionConfig(
        executionConfig,
        options.getWalletConnectionStatus?.() ?? DEFAULT_DISCONNECTED_STATUS
      );
    },
    async waitForTransactionConfirmation(txHash: string) {
      return waitForEvmTransactionConfirmation(txHash, await options.getWalletImplementation());
    },
  }) as ExecutionCapability;
}
