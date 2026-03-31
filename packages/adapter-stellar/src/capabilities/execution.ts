import type {
  ContractSchema,
  ExecutionCapability,
  ExecutionConfig,
  FormFieldType,
  NetworkConfig,
  TransactionStatusUpdate,
  TxStatus,
  WalletConnectionStatus,
} from '@openzeppelin/ui-types';

import { validateStellarExecutionConfig } from '../configuration';
import { signAndBroadcastStellarTransaction } from '../transaction';
import { formatStellarTransactionData } from '../transaction/formatter';
import { getInitializedStellarWalletImplementation, stellarUiKitManager } from '../wallet';
import {
  asStellarNetworkConfig,
  getStellarSupportedExecutionMethods,
  withRuntimeCapability,
} from './helpers';

function getStellarWalletConnectionStatus(): WalletConnectionStatus {
  const implementation = getInitializedStellarWalletImplementation();
  if (!implementation) {
    return {
      isConnected: false,
      address: undefined,
      chainId: stellarUiKitManager.getState().networkConfig?.id || 'stellar-testnet',
    };
  }

  return implementation.getWalletConnectionStatus();
}

export function createExecution(config: NetworkConfig): ExecutionCapability {
  const networkConfig = asStellarNetworkConfig(config);

  return Object.assign(withRuntimeCapability(networkConfig), {
    formatTransactionData(
      contractSchema: ContractSchema,
      functionId: string,
      submittedInputs: Record<string, unknown>,
      fields: FormFieldType[]
    ) {
      return formatStellarTransactionData(contractSchema, functionId, submittedInputs, fields);
    },
    signAndBroadcast(
      transactionData: unknown,
      executionConfig: ExecutionConfig,
      onStatusChange: (status: string, details: TransactionStatusUpdate) => void,
      runtimeApiKey?: string,
      runtimeSecret?: string
    ) {
      void runtimeSecret;
      return signAndBroadcastStellarTransaction(
        transactionData,
        executionConfig,
        networkConfig,
        onStatusChange as (status: TxStatus, details: TransactionStatusUpdate) => void,
        runtimeApiKey
      );
    },
    getSupportedExecutionMethods: getStellarSupportedExecutionMethods,
    validateExecutionConfig(executionConfig: ExecutionConfig) {
      return validateStellarExecutionConfig(executionConfig, getStellarWalletConnectionStatus());
    },
  }) as ExecutionCapability;
}
