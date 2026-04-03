import { getEvmExplorerAddressUrl, getEvmExplorerTxUrl } from '@openzeppelin/adapter-evm-core';
import type { ExplorerCapability, NetworkConfig } from '@openzeppelin/ui-types';

import type { TypedPolkadotNetworkConfig } from '../types';

export function createExplorer(config?: NetworkConfig): ExplorerCapability {
  const networkConfig = config as TypedPolkadotNetworkConfig | undefined;

  return {
    getExplorerUrl(address: string): string | null {
      return networkConfig ? getEvmExplorerAddressUrl(address, networkConfig) : null;
    },
    getExplorerTxUrl(txHash: string): string | null {
      return networkConfig ? getEvmExplorerTxUrl(txHash, networkConfig) : null;
    },
  };
}
