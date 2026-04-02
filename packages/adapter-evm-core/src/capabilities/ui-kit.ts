import type React from 'react';

import type {
  AvailableUiKit,
  EcosystemReactUiProviderProps,
  EcosystemSpecificReactHooks,
  EcosystemWalletComponents,
  NetworkConfig,
  UiKitCapability,
  UiKitConfiguration,
} from '@openzeppelin/ui-types';

import {
  generateRainbowKitConfigFile,
  generateRainbowKitExportables,
  resolveFullUiKitConfiguration,
} from '../wallet';
import { asTypedEvmNetworkConfig, withRuntimeCapability } from './helpers';

const DEFAULT_UI_KIT_CONFIG: UiKitConfiguration = {
  kitName: 'custom',
  kitConfig: {
    showInjectedConnector: false,
  },
};

export interface CreateUiKitOptions {
  getAvailableUiKits?: () => Promise<AvailableUiKit[]>;
  getEcosystemReactHooks?: () => EcosystemSpecificReactHooks | undefined;
  getEcosystemReactUiContextProvider?: () =>
    | React.ComponentType<EcosystemReactUiProviderProps>
    | undefined;
  getEcosystemWalletComponents?: (
    config: UiKitConfiguration
  ) => EcosystemWalletComponents | undefined;
  getExportableWalletConfigFiles?: (config?: UiKitConfiguration) => Promise<Record<string, string>>;
  getRelayerOptionsComponent?: () =>
    | React.ComponentType<{
        options: Record<string, unknown>;
        onChange: (options: Record<string, unknown>) => void;
      }>
    | undefined;
  loadCurrentUiKitConfig?: () => UiKitConfiguration;
  onConfigureUiKit?: (config: UiKitConfiguration) => void | Promise<void>;
}

function getDefaultUiKits(): Promise<AvailableUiKit[]> {
  return Promise.resolve([
    {
      id: 'custom',
      name: 'Wagmi Custom',
      configFields: [],
    },
    {
      id: 'rainbowkit',
      name: 'RainbowKit',
      linkToDocs: 'https://www.rainbowkit.com/docs/installation#configure',
      description:
        'Configure RainbowKit for your exported application. This configuration is used by exported apps, while preview keeps the default RainbowKit setup.',
      hasCodeEditor: true,
      defaultCode: generateRainbowKitConfigFile({}),
      configFields: [],
    },
  ]);
}

export function createUiKit(
  config: NetworkConfig,
  options: CreateUiKitOptions = {}
): UiKitCapability {
  const networkConfig = asTypedEvmNetworkConfig(config);
  let currentUiKitConfig = options.loadCurrentUiKitConfig?.() ?? { ...DEFAULT_UI_KIT_CONFIG };

  return Object.assign(withRuntimeCapability(networkConfig), {
    async configureUiKit(
      programmaticConfig: Partial<UiKitConfiguration> = {},
      runtimeOptions?: {
        loadUiKitNativeConfig?: (relativePath: string) => Promise<Record<string, unknown> | null>;
      }
    ) {
      const currentAppServiceConfig = options.loadCurrentUiKitConfig?.() ?? currentUiKitConfig;
      const resolvedConfig = await resolveFullUiKitConfiguration(
        programmaticConfig,
        currentAppServiceConfig.kitName,
        currentAppServiceConfig,
        runtimeOptions
      );

      currentUiKitConfig = resolvedConfig;
      await options.onConfigureUiKit?.(resolvedConfig);
    },
    getEcosystemReactUiContextProvider: options.getEcosystemReactUiContextProvider,
    getEcosystemReactHooks: options.getEcosystemReactHooks,
    getEcosystemWalletComponents() {
      return options.getEcosystemWalletComponents?.(currentUiKitConfig);
    },
    getAvailableUiKits: options.getAvailableUiKits ?? getDefaultUiKits,
    getRelayerOptionsComponent: options.getRelayerOptionsComponent,
    getExportableWalletConfigFiles:
      options.getExportableWalletConfigFiles ??
      (async (uiKitConfig?: UiKitConfiguration) => {
        if (uiKitConfig?.kitName === 'rainbowkit') {
          return generateRainbowKitExportables(uiKitConfig);
        }

        return {};
      }),
  }) as UiKitCapability;
}
