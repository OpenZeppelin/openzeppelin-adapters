import type { NetworkCatalogCapability } from '@openzeppelin/ui-types';

import { polkadotNetworks } from '../networks';

export function createNetworkCatalog(): NetworkCatalogCapability {
  return {
    getNetworks() {
      return [...polkadotNetworks];
    },
  };
}
