import type { ExplorerCapability, StellarNetworkConfig } from '@openzeppelin/ui-types';

import { getStellarExplorerAddressUrl, getStellarExplorerTxUrl } from '../configuration';
import { asStellarNetworkConfig } from './helpers';

export function createExplorer(config?: StellarNetworkConfig): ExplorerCapability {
  const networkConfig = config ? asStellarNetworkConfig(config) : undefined;

  return {
    getExplorerUrl(address: string): string | null {
      return networkConfig ? getStellarExplorerAddressUrl(address, networkConfig) : null;
    },
    getExplorerTxUrl(txHash: string): string | null {
      return networkConfig ? getStellarExplorerTxUrl(txHash, networkConfig) : null;
    },
  };
}
