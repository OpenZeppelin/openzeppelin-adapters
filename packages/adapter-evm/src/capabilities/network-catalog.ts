import { createNetworkCatalog as createCoreNetworkCatalog } from '@openzeppelin/adapter-evm-core/network-catalog';

import { evmNetworks } from '../networks';

export function createNetworkCatalog() {
  return createCoreNetworkCatalog(evmNetworks);
}
