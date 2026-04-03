import {
  generateRainbowKitExportables,
  resolveFullUiKitConfiguration,
} from '@openzeppelin/adapter-evm-core';
import type {
  AvailableUiKit,
  NetworkConfig,
  UiKitCapability,
  UiKitConfiguration,
} from '@openzeppelin/ui-types';
import { logger } from '@openzeppelin/ui-utils';

import * as evm from '../evm';
import { loadInitialConfigFromAppService, polkadotFacadeHooks } from '../wallet/hooks';
import { polkadotUiKitManager } from '../wallet/polkadotUiKitManager';
import { PolkadotWalletUiRoot } from '../wallet/PolkadotWalletUiRoot';
import { getResolvedWalletComponents } from '../wallet/utils';
import {
  assertPolkadotEvmExecution,
  asTypedPolkadotNetworkConfig,
  withRuntimeCapability,
} from './helpers';

export function createUiKit(config: NetworkConfig): UiKitCapability {
  const networkConfig = asTypedPolkadotNetworkConfig(config);
  assertPolkadotEvmExecution(networkConfig);

  const initialGlobalConfig = loadInitialConfigFromAppService();
  const initialKitName = (initialGlobalConfig.kitName as UiKitConfiguration['kitName']) || 'custom';

  return Object.assign(withRuntimeCapability(networkConfig, 'uiKit'), {
    async configureUiKit(
      programmaticOverrides: Partial<UiKitConfiguration> = {},
      options?: {
        loadUiKitNativeConfig?: () => Promise<Partial<UiKitConfiguration>>;
      }
    ) {
      const currentAppServiceConfig = loadInitialConfigFromAppService();
      const finalFullConfig = await resolveFullUiKitConfiguration(
        programmaticOverrides,
        initialKitName,
        currentAppServiceConfig,
        options
      );
      await polkadotUiKitManager.configure(finalFullConfig);
      logger.info(
        'polkadot:createUiKit',
        'UI kit configured with kitName:',
        finalFullConfig.kitName
      );
    },
    getAvailableUiKits(): Promise<AvailableUiKit[]> {
      return evm.getAvailableUiKits();
    },
    getEcosystemReactUiContextProvider() {
      return PolkadotWalletUiRoot;
    },
    getEcosystemReactHooks() {
      return polkadotFacadeHooks;
    },
    getEcosystemWalletComponents() {
      const currentManagerState = polkadotUiKitManager.getState();
      if (!currentManagerState.currentFullUiKitConfig) {
        logger.debug(
          'polkadot:createUiKit',
          'No UI kit configuration available in manager yet. Returning undefined.'
        );
        return undefined;
      }
      return getResolvedWalletComponents(currentManagerState.currentFullUiKitConfig);
    },
    getRelayerOptionsComponent() {
      return evm.getRelayerOptionsComponent();
    },
    async getExportableWalletConfigFiles(uiKitConfig?: UiKitConfiguration) {
      if (uiKitConfig?.kitName === 'rainbowkit') {
        return generateRainbowKitExportables(uiKitConfig);
      }
      return {};
    },
  }) as UiKitCapability;
}
