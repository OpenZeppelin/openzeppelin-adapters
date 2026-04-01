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
        address: status.address,
        chainId: networkConfig.id,
      } satisfies WalletConnectionStatus;
    },
  }) as WalletCapability;
}
