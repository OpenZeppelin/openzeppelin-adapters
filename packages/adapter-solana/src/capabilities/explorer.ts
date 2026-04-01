import type { ExplorerCapability, NetworkConfig } from '@openzeppelin/ui-types';

import { getSolanaExplorerAddressUrl, getSolanaExplorerTxUrl } from '../configuration/explorer';
import { asSolanaNetworkConfig } from './helpers';

export function createExplorer(config?: NetworkConfig): ExplorerCapability {
  const networkConfig = config ? asSolanaNetworkConfig(config) : undefined;

  return {
    getExplorerUrl(address: string): string | null {
      return networkConfig ? getSolanaExplorerAddressUrl(address, networkConfig) : null;
    },
    getExplorerTxUrl(txHash: string): string | null {
      return networkConfig ? getSolanaExplorerTxUrl(txHash, networkConfig) : null;
    },
  };
}
