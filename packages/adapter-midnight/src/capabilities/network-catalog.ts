import type { NetworkCatalogCapability } from '@openzeppelin/ui-types';

import { midnightNetworks } from '../networks';

export function createNetworkCatalog(): NetworkCatalogCapability {
  return {
    getNetworks() {
      return [...midnightNetworks];
    },
  };
}
