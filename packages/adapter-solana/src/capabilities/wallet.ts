import type {
  NetworkConfig,
  WalletCapability,
  WalletConnectionStatus,
} from '@openzeppelin/ui-types';

import {
  connectSolanaWallet,
  disconnectSolanaWallet,
  getSolanaAvailableConnectors,
  getSolanaWalletConnectionStatus,
  onSolanaWalletConnectionChange,
  solanaSupportsWalletConnection,
} from '../wallet';
import { asSolanaNetworkConfig, withRuntimeCapability } from './helpers';

export function createWallet(config: NetworkConfig): WalletCapability {
  const networkConfig = asSolanaNetworkConfig(config);

  return Object.assign(withRuntimeCapability(networkConfig, 'wallet'), {
    supportsWalletConnection: solanaSupportsWalletConnection,
    getAvailableConnectors: getSolanaAvailableConnectors,
    connectWallet: connectSolanaWallet,
    disconnectWallet: disconnectSolanaWallet,
    getWalletConnectionStatus(): WalletConnectionStatus {
      return getSolanaWalletConnectionStatus();
    },
    onWalletConnectionChange(
      callback: (
        currentStatus: WalletConnectionStatus,
        previousStatus: WalletConnectionStatus
      ) => void
    ) {
      if (onSolanaWalletConnectionChange) {
        return onSolanaWalletConnectionChange(callback);
      }
      return () => {};
    },
  }) as WalletCapability;
}
