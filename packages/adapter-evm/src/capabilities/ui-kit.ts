import type { TypedEvmNetworkConfig } from '@openzeppelin/adapter-evm-core';
import { createUiKit as createCoreUiKit } from '@openzeppelin/adapter-evm-core';

import { EvmRelayerOptions } from '../transaction';
import { EvmWalletUiRoot } from '../wallet/components/EvmWalletUiRoot';
import { evmUiKitManager } from '../wallet/evmUiKitManager';
import { evmFacadeHooks } from '../wallet/hooks/facade-hooks';
import { loadInitialConfigFromAppService } from '../wallet/hooks/useUiKitConfig';
import { getResolvedWalletComponents } from '../wallet/utils/uiKitService';

export function createUiKit(config: TypedEvmNetworkConfig) {
  return createCoreUiKit(config, {
    loadCurrentUiKitConfig: loadInitialConfigFromAppService,
    onConfigureUiKit: (resolvedConfig) => evmUiKitManager.configure(resolvedConfig),
    getEcosystemReactUiContextProvider: () => EvmWalletUiRoot,
    getEcosystemReactHooks: () => evmFacadeHooks,
    getEcosystemWalletComponents: (uiKitConfig) => getResolvedWalletComponents(uiKitConfig),
    getRelayerOptionsComponent: () => EvmRelayerOptions,
  });
}
