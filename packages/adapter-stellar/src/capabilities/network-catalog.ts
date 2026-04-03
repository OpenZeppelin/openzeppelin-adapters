import type { NetworkCatalogCapability } from '@openzeppelin/ui-types';

import { stellarNetworks } from '../networks';

export function createNetworkCatalog(): NetworkCatalogCapability {
  return {
    getNetworks() {
      return [...stellarNetworks];
    },
  };
}
