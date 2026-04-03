import type { ExplorerCapability, NetworkConfig } from '@openzeppelin/ui-types';

import { getMidnightExplorerAddressUrl, getMidnightExplorerTxUrl } from '../configuration/explorer';
import { asMidnightNetworkConfig } from './helpers';

export function createExplorer(config?: NetworkConfig): ExplorerCapability {
  const networkConfig = config ? asMidnightNetworkConfig(config) : undefined;

  return {
    getExplorerUrl(address: string): string | null {
      return networkConfig ? getMidnightExplorerAddressUrl(address, networkConfig) : null;
    },
    getExplorerTxUrl(txHash: string): string | null {
      return networkConfig ? getMidnightExplorerTxUrl(txHash, networkConfig) : null;
    },
  };
}
