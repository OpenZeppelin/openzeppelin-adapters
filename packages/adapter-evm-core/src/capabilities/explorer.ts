import type { ExplorerCapability, NetworkConfig } from '@openzeppelin/ui-types';

import { getEvmExplorerAddressUrl, getEvmExplorerTxUrl } from '../configuration';
import { asTypedEvmNetworkConfig } from './helpers';

export function createExplorer(config?: NetworkConfig): ExplorerCapability {
  const networkConfig = config ? asTypedEvmNetworkConfig(config) : undefined;

  return {
    getExplorerUrl(address: string): string | null {
      return networkConfig ? getEvmExplorerAddressUrl(address, networkConfig) : null;
    },
    getExplorerTxUrl(txHash: string): string | null {
      return networkConfig ? getEvmExplorerTxUrl(txHash, networkConfig) : null;
    },
  };
}
