import type { NetworkCatalogCapability } from '@openzeppelin/ui-types';

import { solanaNetworks } from '../networks';

export function createNetworkCatalog(): NetworkCatalogCapability {
  return {
    getNetworks() {
      return [...solanaNetworks];
    },
  };
}
