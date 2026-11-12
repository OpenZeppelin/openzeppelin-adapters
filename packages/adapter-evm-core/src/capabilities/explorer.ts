import type { ExplorerCapability, NetworkConfig } from '@openzeppelin/ui-types';

import { getEvmExplorerAddressUrl, getEvmExplorerTxUrl } from '../configuration/explorer';
import type { EvmExplorerNetworkConfig } from '../types';
import { asEvmExplorerNetworkConfig } from './helpers';

export type { EvmExplorerNetworkConfig } from '../types';

/**
 * Creates the EVM explorer capability.
 *
 * Accepts a full network config, or an explorer-only {@link EvmExplorerNetworkConfig}
 * when the app must not ship an RPC URL. Links are resolved on every call, so user
 * explorer overrides saved later still apply.
 *
 * @param config - Network config, or just its explorer fields. Without one, every link is `null`.
 * @throws Error `Expected an EVM network configuration, received <ecosystem>.` at
 *   construction when `config.ecosystem !== 'evm'`.
 */
export function createExplorer(
  config?: NetworkConfig | EvmExplorerNetworkConfig
): ExplorerCapability {
  const networkConfig = config ? asEvmExplorerNetworkConfig(config) : undefined;

  return {
    getExplorerUrl(address: string): string | null {
      return networkConfig ? getEvmExplorerAddressUrl(address, networkConfig) : null;
    },
    getExplorerTxUrl(txHash: string): string | null {
      return networkConfig ? getEvmExplorerTxUrl(txHash, networkConfig) : null;
    },
  };
}
