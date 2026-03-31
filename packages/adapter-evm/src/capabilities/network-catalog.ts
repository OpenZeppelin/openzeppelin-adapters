import { createNetworkCatalog as createCoreNetworkCatalog } from '@openzeppelin/adapter-evm-core';

import { evmNetworks } from '../networks';

export function createNetworkCatalog() {
  return createCoreNetworkCatalog(evmNetworks);
}
