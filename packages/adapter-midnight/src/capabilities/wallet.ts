import type {
  Connector,
  NetworkConfig,
  WalletCapability,
  WalletConnectionStatus,
} from '@openzeppelin/ui-types';

import * as connection from '../wallet/connection';
import { asMidnightNetworkConfig, withRuntimeCapability } from './helpers';

export function createWallet(config: NetworkConfig): WalletCapability {
  const networkConfig = asMidnightNetworkConfig(config);

  return Object.assign(withRuntimeCapability(networkConfig, 'wallet'), {
    supportsWalletConnection() {
      return connection.supportsMidnightWalletConnection();
    },
    getAvailableConnectors(): Promise<Connector[]> {
      return connection.getMidnightAvailableConnectors();
    },
    connectWallet(_connectorId: string) {
      return Promise.resolve({ connected: false, error: 'Method not supported.' });
    },
    disconnectWallet() {
      return connection.disconnectMidnightWallet();
    },
    getWalletConnectionStatus() {
      const status = connection.getMidnightWalletConnectionStatus();
      return {
        isConnected: !!status.isConnected,
        isConnecting: status.isConnecting ?? false,
        isDisconnected: status.isDisconnected ?? !status.isConnected,
        isReconnecting: status.isReconnecting ?? false,
        status: status.status ?? (status.isConnected ? 'connected' : 'disconnected'),
        address: status.address,
        chainId: networkConfig.id,
      } satisfies WalletConnectionStatus;
    },
    onWalletConnectionChange(
      callback: (
        currentStatus: WalletConnectionStatus,
        previousStatus: WalletConnectionStatus
      ) => void
    ) {
      return connection.onMidnightWalletConnectionChange((current, previous) => {
        callback(
          {
            isConnected: !!current.isConnected,
            isConnecting: current.isConnecting ?? false,
            isDisconnected: current.isDisconnected ?? !current.isConnected,
            isReconnecting: current.isReconnecting ?? false,
            status: current.status ?? (current.isConnected ? 'connected' : 'disconnected'),
            address: current.address,
            chainId: networkConfig.id,
          },
          {
            isConnected: !!previous.isConnected,
            isConnecting: previous.isConnecting ?? false,
            isDisconnected: previous.isDisconnected ?? !previous.isConnected,
            isReconnecting: previous.isReconnecting ?? false,
            status: previous.status ?? (previous.isConnected ? 'connected' : 'disconnected'),
            address: previous.address,
            chainId: networkConfig.id,
          }
        );
      });
    },
  }) as WalletCapability;
}
