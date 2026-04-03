import type {
  NetworkConfig,
  WalletCapability,
  WalletConnectionStatus,
} from '@openzeppelin/ui-types';

import {
  connectStellarWallet,
  disconnectStellarWallet,
  getInitializedStellarWalletImplementation,
  getStellarAvailableConnectors,
  supportsStellarWalletConnection,
} from '../wallet';
import { asStellarNetworkConfig, withRuntimeCapability } from './helpers';

export function createWallet(config: NetworkConfig): WalletCapability {
  const networkConfig = asStellarNetworkConfig(config);

  function getWalletConnectionStatus(): WalletConnectionStatus {
    const implementation = getInitializedStellarWalletImplementation();
    if (!implementation) {
      return {
        isConnected: false,
        isConnecting: false,
        isDisconnected: true,
        isReconnecting: false,
        status: 'disconnected',
        address: undefined,
        chainId: networkConfig.id,
      };
    }

    return implementation.getWalletConnectionStatus();
  }

  // Runtime disposal should invalidate the capability object without severing the
  // user's external wallet session. Disconnect remains an explicit user action.
  return Object.assign(withRuntimeCapability(networkConfig, 'wallet'), {
    supportsWalletConnection() {
      return supportsStellarWalletConnection();
    },
    getAvailableConnectors: getStellarAvailableConnectors,
    connectWallet: connectStellarWallet,
    disconnectWallet: disconnectStellarWallet,
    getWalletConnectionStatus,
    onWalletConnectionChange(
      callback: (status: WalletConnectionStatus, previousStatus: WalletConnectionStatus) => void
    ) {
      const implementation = getInitializedStellarWalletImplementation();
      if (!implementation) {
        return () => {};
      }

      return implementation.onWalletConnectionChange((currentStatus, previousStatus) => {
        callback(currentStatus, previousStatus);
      });
    },
  }) as WalletCapability;
}
