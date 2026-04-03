import type { WriteContractParameters } from '@openzeppelin/adapter-evm-core';
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

import * as evm from '../evm';
import { getPolkadotWalletImplementation } from '../wallet/implementation';
import { getPolkadotWalletConnectionStatus } from '../wallet/utils';
import {
  assertPolkadotEvmExecution,
  asTypedPolkadotNetworkConfig,
  withRuntimeCapability,
} from './helpers';

function toWalletConnectionStatus(): WalletConnectionStatus {
  const status = getPolkadotWalletConnectionStatus();
  return {
    isConnected: status.isConnected,
    isConnecting: status.isConnecting,
    isDisconnected: status.isDisconnected,
    isReconnecting: status.isReconnecting,
    status: status.status,
    address: status.address,
    chainId: status.chainId,
  };
}

export function createExecution(config: NetworkConfig): ExecutionCapability {
  const networkConfig = asTypedPolkadotNetworkConfig(config);
  assertPolkadotEvmExecution(networkConfig);

  return Object.assign(withRuntimeCapability(networkConfig, 'execution'), {
    formatTransactionData(
      contractSchema: ContractSchema,
      functionId: string,
      submittedInputs: Record<string, unknown>,
      fields: FormFieldType[]
    ) {
      return evm.formatEvmTransactionData(contractSchema, functionId, submittedInputs, fields);
    },
    async signAndBroadcast(
      transactionData: unknown,
      executionConfig: ExecutionConfig,
      onStatusChange: (status: TxStatus, details: TransactionStatusUpdate) => void,
      runtimeApiKey?: string,
      runtimeSecret?: string
    ) {
      void runtimeSecret;
      const walletImplementation = getPolkadotWalletImplementation();
      if (!walletImplementation.isReady()) {
        throw new Error(
          'Wallet not initialized. Ensure PolkadotWalletUiRoot is mounted before calling signAndBroadcast.'
        );
      }

      return evm.executeEvmTransaction(
        transactionData as WriteContractParameters,
        executionConfig,
        walletImplementation,
        onStatusChange,
        runtimeApiKey
      );
    },
    getSupportedExecutionMethods: () => evm.getSupportedExecutionMethods(),
    validateExecutionConfig(executionConfig: ExecutionConfig) {
      return evm.validateExecutionConfig(executionConfig, toWalletConnectionStatus());
    },
    async waitForTransactionConfirmation(txHash: string) {
      const walletImplementation = getPolkadotWalletImplementation();
      return evm.waitForEvmTransactionConfirmation(txHash, walletImplementation);
    },
  }) as ExecutionCapability;
}
