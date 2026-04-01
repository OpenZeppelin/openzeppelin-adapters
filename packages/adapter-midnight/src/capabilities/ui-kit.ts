import type { AvailableUiKit, NetworkConfig, UiKitCapability } from '@openzeppelin/ui-types';

import { CustomAccountDisplay } from '../wallet/components/account/AccountDisplay';
import { ConnectButton } from '../wallet/components/connect/ConnectButton';
import { MidnightWalletUiRoot } from '../wallet/components/MidnightWalletUiRoot';
import { midnightFacadeHooks } from '../wallet/hooks/facade-hooks';
import { asMidnightNetworkConfig, withRuntimeCapability } from './helpers';

export function createUiKit(config: NetworkConfig): UiKitCapability {
  const networkConfig = asMidnightNetworkConfig(config);

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
    getEcosystemReactUiContextProvider() {
      return MidnightWalletUiRoot;
    },
    getEcosystemReactHooks() {
      return midnightFacadeHooks;
    },
    getEcosystemWalletComponents() {
      return {
        ConnectButton,
        AccountDisplay: CustomAccountDisplay,
      };
    },
  }) as UiKitCapability;
}
