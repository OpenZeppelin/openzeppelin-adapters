import type { TypedEvmNetworkConfig } from '@openzeppelin/adapter-evm-core';
import { createExecution as createCoreExecution } from '@openzeppelin/adapter-evm-core';

import { getEvmWalletConnectionStatus } from '../wallet/utils/connection';
import { convertWagmiToEvmStatus } from '../wallet/utils/wallet-status';
import { getEvmWalletImplementation } from '../wallet/utils/walletImplementationManager';

export function createExecution(config: TypedEvmNetworkConfig) {
  return createCoreExecution(config, {
    getWalletImplementation: getEvmWalletImplementation,
    getWalletConnectionStatus: () => convertWagmiToEvmStatus(getEvmWalletConnectionStatus()),
  });
}
