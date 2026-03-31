import type { TypedEvmNetworkConfig } from '@openzeppelin/adapter-evm-core';
import { createWallet as createCoreWallet } from '@openzeppelin/adapter-evm-core';

import {
  connectAndEnsureCorrectNetwork,
  disconnectEvmWallet,
  evmSupportsWalletConnection,
  getEvmAvailableConnectors,
  getEvmWalletConnectionStatus,
  onEvmWalletConnectionChange,
} from '../wallet/utils/connection';
import { convertWagmiToEvmStatus } from '../wallet/utils/wallet-status';

export function createWallet(config: TypedEvmNetworkConfig) {
  return createCoreWallet(config, {
    supportsWalletConnection: evmSupportsWalletConnection,
    getAvailableConnectors: getEvmAvailableConnectors,
    connectWallet: connectAndEnsureCorrectNetwork,
    disconnectWallet: disconnectEvmWallet,
    getWalletConnectionStatus: () => convertWagmiToEvmStatus(getEvmWalletConnectionStatus()),
    onWalletConnectionChange: (callback) =>
      onEvmWalletConnectionChange((current, previous) => {
        callback(convertWagmiToEvmStatus(current), convertWagmiToEvmStatus(previous));
      }),
  });
}
