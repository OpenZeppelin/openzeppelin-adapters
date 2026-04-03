import { createEvmAccessControlService } from '@openzeppelin/adapter-evm-core';
import type {
  AccessControlCapability,
  NetworkConfig,
  TransactionStatusUpdate,
} from '@openzeppelin/ui-types';

import { createExecution } from './execution';
import { asTypedPolkadotNetworkConfig, guardRuntimeCapability } from './helpers';

export function createAccessControl(config: NetworkConfig): AccessControlCapability {
  const networkConfig = asTypedPolkadotNetworkConfig(config);
  const execution = createExecution(networkConfig);

  const service = createEvmAccessControlService(
    networkConfig,
    async (txData, executionConfig, onStatusChange, runtimeApiKey) => {
      const result = await execution.signAndBroadcast(
        txData,
        executionConfig,
        (onStatusChange ?? (() => {})) as (
          status: string,
          details: TransactionStatusUpdate
        ) => void,
        runtimeApiKey
      );
      return { id: result.txHash };
    }
  );

  return guardRuntimeCapability(
    service,
    networkConfig,
    'accessControl',
    () => {
      service.dispose();
      execution.dispose();
    },
    'subscription'
  ) as AccessControlCapability;
}
