/**
 * @fileoverview Polkadot-specific WalletUiRoot component.
 *
 * Provides wallet connectivity for Polkadot ecosystem EVM-compatible networks
 * including Hub networks and parachains (Moonbeam, Moonriver).
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import React, { useEffect, useMemo, useState } from 'react';

import { WagmiProviderInitializedContext } from '@openzeppelin/adapter-evm-core';
import type { EcosystemReactUiProviderProps } from '@openzeppelin/ui-types';
import { logger } from '@openzeppelin/ui-utils';

import { polkadotUiKitManager, type PolkadotUiKitManagerState } from './polkadotUiKitManager';
import type { RainbowKitKitConfig, RainbowKitProviderProps } from './rainbowkit';

export type PolkadotWalletUiRootProps = EcosystemReactUiProviderProps;

const stableQueryClient = new QueryClient();

/**
 * Polkadot ecosystem wallet UI root component.
 *
 * Provides wallet connectivity for Polkadot ecosystem EVM-compatible networks.
 * Wraps children with WagmiProvider and QueryClientProvider configured for
 * Polkadot Hub and parachain networks.
 *
 * When RainbowKit is configured, wraps children with RainbowKitProvider.
 *
 * @remarks
 * The component pre-configures all Polkadot ecosystem EVM networks by default:
 * - Hub networks: Polkadot Hub, Kusama Hub, Polkadot Hub TestNet
 * - Parachains: Moonbeam, Moonriver, Moonbase Alpha
 */
export const PolkadotWalletUiRoot: React.FC<PolkadotWalletUiRootProps> = ({ children }) => {
  const [managerState, setManagerState] = useState<PolkadotUiKitManagerState>(
    polkadotUiKitManager.getState()
  );

  useEffect(() => {
    const handleStateChange = () => {
      setManagerState(polkadotUiKitManager.getState());
    };
    const unsubscribe = polkadotUiKitManager.subscribe(handleStateChange);
    handleStateChange();
    return unsubscribe;
  }, []);

  const queryClient = useMemo(() => stableQueryClient, []);

  const { wagmiConfig, kitProviderComponent, isKitAssetsLoaded, currentFullUiKitConfig, error } =
    managerState;

  if (!wagmiConfig) {
    return <>{children}</>;
  }

  let finalChildren = children;

  // RainbowKit's provider component and CSS are imported dynamically, and
  // uiKitManager deliberately clears kitProviderComponent / isKitAssetsLoaded and
  // notifies listeners *before* that import resolves whenever the kit changes.
  // During that window the kit is already 'rainbowkit' but the provider is absent,
  // so rendering children would mount RainbowKit consumers (its ConnectButton)
  // outside RainbowKitProvider -- which throws "Transaction hooks must be used
  // within RainbowKitProvider" and white-screens the app. Withhold children until
  // the provider is ready instead.
  const needsKitProvider = currentFullUiKitConfig?.kitName === 'rainbowkit' && !error;
  const isKitProviderReady = Boolean(kitProviderComponent) && isKitAssetsLoaded;
  const isAwaitingKitProvider = needsKitProvider && !isKitProviderReady;

  if (
    currentFullUiKitConfig?.kitName === 'rainbowkit' &&
    kitProviderComponent &&
    isKitAssetsLoaded &&
    !error
  ) {
    const DynKitProvider = kitProviderComponent;
    const kitConfig: RainbowKitKitConfig = currentFullUiKitConfig.kitConfig || {};
    const providerProps: RainbowKitProviderProps = kitConfig.providerProps || {};

    logger.info(
      'PolkadotWalletUiRoot',
      'Wrapping children with dynamically loaded KitProvider (RainbowKit).'
    );
    finalChildren = <DynKitProvider {...providerProps}>{children}</DynKitProvider>;
  } else if (currentFullUiKitConfig?.kitName === 'rainbowkit' && error) {
    logger.error(
      'PolkadotWalletUiRoot',
      'RainbowKit configured, but failed to initialize:',
      error.message
    );
  }

  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount={true}>
      <QueryClientProvider client={queryClient}>
        <WagmiProviderInitializedContext.Provider value={!error}>
          {isAwaitingKitProvider ? null : finalChildren}
        </WagmiProviderInitializedContext.Provider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};
