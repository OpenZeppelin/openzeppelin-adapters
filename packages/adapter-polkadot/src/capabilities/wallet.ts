import type {
  NetworkConfig,
  WalletCapability,
  WalletConnectionStatus,
} from '@openzeppelin/ui-types';

import {
  connectAndEnsureCorrectNetwork,
  disconnectPolkadotWallet,
  getPolkadotAvailableConnectors,
  getPolkadotWalletConnectionStatus,
  onPolkadotWalletConnectionChange,
  polkadotSupportsWalletConnection,
} from '../wallet/utils';
import {
  assertPolkadotEvmExecution,
  asTypedPolkadotNetworkConfig,
  withRuntimeCapability,
} from './helpers';

export function createWallet(config: NetworkConfig): WalletCapability {
  const networkConfig = asTypedPolkadotNetworkConfig(config);
  assertPolkadotEvmExecution(networkConfig);

  return Object.assign(withRuntimeCapability(networkConfig, 'wallet'), {
    supportsWalletConnection: polkadotSupportsWalletConnection,
    getAvailableConnectors: getPolkadotAvailableConnectors,
    async connectWallet(connectorId: string) {
      const result = await connectAndEnsureCorrectNetwork(connectorId, networkConfig.chainId);
      if (result.connected && result.address) {
        return { connected: true, address: result.address };
      }
      return { connected: false, error: result.error || 'Connection failed.' };
    },
    disconnectWallet: disconnectPolkadotWallet,
    getWalletConnectionStatus(): WalletConnectionStatus {
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
    },
    onWalletConnectionChange(
      callback: (
        currentStatus: WalletConnectionStatus,
        previousStatus: WalletConnectionStatus
      ) => void
    ) {
      return onPolkadotWalletConnectionChange((current, previous) => {
        callback(
          {
            isConnected: current.isConnected,
            isConnecting: current.isConnecting,
            isDisconnected: current.isDisconnected,
            isReconnecting: current.isReconnecting,
            status: current.status,
            address: current.address,
            chainId: current.chainId,
          },
          {
            isConnected: previous.isConnected,
            isConnecting: previous.isConnecting,
            isDisconnected: previous.isDisconnected,
            isReconnecting: previous.isReconnecting,
            status: previous.status,
            address: previous.address,
            chainId: previous.chainId,
          }
        );
      });
    },
  }) as WalletCapability;
}
