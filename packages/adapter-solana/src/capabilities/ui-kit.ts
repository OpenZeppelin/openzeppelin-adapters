import type { AvailableUiKit, NetworkConfig, UiKitCapability } from '@openzeppelin/ui-types';

import { asSolanaNetworkConfig, withRuntimeCapability } from './helpers';

export function createUiKit(config: NetworkConfig): UiKitCapability {
  const networkConfig = asSolanaNetworkConfig(config);

  return Object.assign(withRuntimeCapability(networkConfig, 'uiKit'), {
    async getAvailableUiKits(): Promise<AvailableUiKit[]> {
      return [
        {
          id: 'custom',
          name: 'OpenZeppelin Custom',
          configFields: [],
        },
      ];
    },
  }) as UiKitCapability;
}
