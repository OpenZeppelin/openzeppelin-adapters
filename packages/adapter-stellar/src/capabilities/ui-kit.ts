import type {
  AvailableUiKit,
  NetworkConfig,
  UiKitCapability,
  UiKitConfiguration,
} from '@openzeppelin/ui-types';

import { StellarRelayerOptions } from '../transaction/components';
import {
  generateStellarWalletsKitExportables,
  getResolvedWalletComponents,
  loadInitialConfigFromAppService,
  resolveFullUiKitConfiguration,
  stellarFacadeHooks,
  stellarUiKitManager,
  StellarWalletUiRoot,
} from '../wallet';
import { asStellarNetworkConfig, withRuntimeCapability } from './helpers';

function getAvailableUiKits(): Promise<AvailableUiKit[]> {
  return Promise.resolve([
    {
      id: 'custom',
      name: 'Stellar Wallets Kit Custom',
      configFields: [],
    },
    {
      id: 'stellar-wallets-kit',
      name: 'Stellar Wallets Kit',
      configFields: [],
    },
  ]);
}

export function createUiKit(config: NetworkConfig): UiKitCapability {
  const networkConfig = asStellarNetworkConfig(config);
  let currentUiKitConfig: UiKitConfiguration = loadInitialConfigFromAppService();

  stellarUiKitManager.setNetworkConfig(networkConfig);

  return Object.assign(withRuntimeCapability(networkConfig), {
    async configureUiKit(
      programmaticOverrides: Partial<UiKitConfiguration> = {},
      runtimeOptions?: {
        loadUiKitNativeConfig?: (relativePath: string) => Promise<Record<string, unknown> | null>;
      }
    ) {
      const currentAppServiceConfig = loadInitialConfigFromAppService();
      const resolvedConfig = await resolveFullUiKitConfiguration(
        programmaticOverrides,
        currentUiKitConfig.kitName,
        currentAppServiceConfig,
        runtimeOptions
      );

      currentUiKitConfig = resolvedConfig;
      await stellarUiKitManager.configure(resolvedConfig);
    },
    getAvailableUiKits,
    getExportableWalletConfigFiles(uiKitConfig?: UiKitConfiguration) {
      if (uiKitConfig?.kitName === 'stellar-wallets-kit') {
        return generateStellarWalletsKitExportables(uiKitConfig);
      }

      return Promise.resolve({});
    },
    getEcosystemWalletComponents() {
      return getResolvedWalletComponents(currentUiKitConfig);
    },
    getEcosystemReactUiContextProvider() {
      return StellarWalletUiRoot;
    },
    getEcosystemReactHooks() {
      return stellarFacadeHooks;
    },
    getRelayerOptionsComponent() {
      return StellarRelayerOptions;
    },
  }) as UiKitCapability;
}
