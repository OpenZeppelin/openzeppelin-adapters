import type {
  AccessControlCapability,
  ExecutionConfig,
  NetworkConfig,
  TransactionStatusUpdate,
  TxStatus,
} from '@openzeppelin/ui-types';

import { createEvmAccessControlService } from '../access-control';
import { asTypedEvmNetworkConfig, guardRuntimeCapability } from './helpers';

export interface CreateAccessControlOptions {
  signAndBroadcast: (
    transactionData: unknown,
    executionConfig: ExecutionConfig,
    onStatusChange: (status: TxStatus, details: TransactionStatusUpdate) => void,
    runtimeApiKey?: string,
    runtimeSecret?: string
  ) => Promise<{ txHash: string; result?: unknown }>;
}

export function createAccessControl(
  config: NetworkConfig,
  options: CreateAccessControlOptions
): AccessControlCapability {
  const networkConfig = asTypedEvmNetworkConfig(config);
  const service = createEvmAccessControlService(
    networkConfig,
    async (transactionData, executionConfig, onStatusChange, runtimeApiKey) => {
      const result = await options.signAndBroadcast(
        transactionData,
        executionConfig,
        onStatusChange ?? (() => {}),
        runtimeApiKey
      );

      return { id: result.txHash };
    }
  );

  return guardRuntimeCapability(
    service,
    networkConfig,
    'accessControl',
    () => service.dispose(),
    'subscription'
  ) as AccessControlCapability;
}
