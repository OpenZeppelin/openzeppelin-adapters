import type {
  Connector,
  NetworkConfig,
  WalletCapability,
  WalletConnectionStatus,
} from '@openzeppelin/ui-types';

import { asTypedEvmNetworkConfig, withRuntimeCapability } from './helpers';

export interface CreateWalletOptions {
  connectWallet: (
    connectorId: string,
    targetChainId: number
  ) => Promise<{ connected: boolean; address?: string; error?: string }>;
  disconnectWallet: () => Promise<{ disconnected: boolean; error?: string }>;
  getAvailableConnectors: () => Promise<Connector[]>;
  getWalletConnectionStatus: () => WalletConnectionStatus;
  onWalletConnectionChange?: (
    callback: (status: WalletConnectionStatus, previousStatus: WalletConnectionStatus) => void
  ) => () => void;
  supportsWalletConnection?: () => boolean;
}

export function createWallet(
  config: NetworkConfig,
  options: CreateWalletOptions
): WalletCapability {
  const networkConfig = asTypedEvmNetworkConfig(config);

  return Object.assign(withRuntimeCapability(networkConfig), {
    supportsWalletConnection() {
      return options.supportsWalletConnection?.() ?? true;
    },
    getAvailableConnectors: options.getAvailableConnectors,
    connectWallet(connectorId: string) {
      return options.connectWallet(connectorId, networkConfig.chainId);
    },
    disconnectWallet: options.disconnectWallet,
    getWalletConnectionStatus: options.getWalletConnectionStatus,
    onWalletConnectionChange: options.onWalletConnectionChange,
  }) as WalletCapability;
}
