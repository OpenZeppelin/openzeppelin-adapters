import type { NetworkCatalogCapability, NetworkConfig } from '@openzeppelin/ui-types';

export function createNetworkCatalog(
  networks: readonly NetworkConfig[] = []
): NetworkCatalogCapability {
  const stableNetworks = [...networks];

  return {
    getNetworks(): NetworkConfig[] {
      return [...stableNetworks];
    },
  };
}
