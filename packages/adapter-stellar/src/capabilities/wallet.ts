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
  stellarUiKitManager,
  supportsStellarWalletConnection,
} from '../wallet';
import {
  asStellarNetworkConfig,
  registerRuntimeCapabilityCleanup,
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

export function createWallet(config: NetworkConfig): WalletCapability {
  const networkConfig = asStellarNetworkConfig(config);

  const capability = Object.assign(withRuntimeCapability(networkConfig, 'wallet'), {
    supportsWalletConnection() {
      return supportsStellarWalletConnection();
    },
    getAvailableConnectors: getStellarAvailableConnectors,
    connectWallet: connectStellarWallet,
    disconnectWallet: disconnectStellarWallet,
    getWalletConnectionStatus: getStellarWalletConnectionStatus,
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

  registerRuntimeCapabilityCleanup(
    capability,
    async () => {
      await disconnectStellarWallet();
    },
    'wallet'
  );

  return capability;
}
