import type { TypedEvmNetworkConfig } from '@openzeppelin/adapter-evm-core';
import { createAccessControl as createCoreAccessControl } from '@openzeppelin/adapter-evm-core';
import type { ExecutionConfig, TransactionStatusUpdate, TxStatus } from '@openzeppelin/ui-types';

import { createExecution } from './execution';

export function createAccessControl(config: TypedEvmNetworkConfig) {
  const execution = createExecution(config);

  return createCoreAccessControl(config, {
    signAndBroadcast: (
      transactionData: unknown,
      executionConfig: ExecutionConfig,
      onStatusChange: (status: TxStatus, details: TransactionStatusUpdate) => void,
      runtimeApiKey?: string,
      runtimeSecret?: string
    ) =>
      execution.signAndBroadcast(
        transactionData,
        executionConfig,
        onStatusChange as (status: string, details: TransactionStatusUpdate) => void,
        runtimeApiKey,
        runtimeSecret
      ),
  });
}
