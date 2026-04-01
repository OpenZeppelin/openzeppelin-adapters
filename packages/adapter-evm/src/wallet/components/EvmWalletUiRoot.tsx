import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import React, { useEffect, useMemo, useState } from 'react';

import { WagmiProviderInitializedContext } from '@openzeppelin/adapter-evm-core';
import type { EcosystemReactUiProviderProps } from '@openzeppelin/ui-types';
import { logger } from '@openzeppelin/ui-utils';

import { evmUiKitManager, type EvmUiKitManagerState } from '../evmUiKitManager';
import type { RainbowKitKitConfig, RainbowKitProviderProps } from '../rainbowkit';

const stableQueryClient = new QueryClient();

export const EvmWalletUiRoot: React.FC<EcosystemReactUiProviderProps> = ({ children }) => {
  const [managerState, setManagerState] = useState<EvmUiKitManagerState>(
    evmUiKitManager.getState()
  );

  useEffect(() => {
    const handleStateChange = () => {
      setManagerState(evmUiKitManager.getState());
    };
    const unsubscribe = evmUiKitManager.subscribe(handleStateChange);
    handleStateChange();
    return unsubscribe;
  }, []);

  const queryClient = useMemo(() => stableQueryClient, []);

  const { wagmiConfig, kitProviderComponent, isKitAssetsLoaded, currentFullUiKitConfig, error } =
    managerState;

  // Don't mount WagmiProvider until the real config is available.
  // This ensures reconnectOnMount fires exactly once on the correct config,
  // preventing the "Connector already connected" race condition that occurs
  // when swapping from a placeholder config to the real one.
  if (!wagmiConfig) {
    return <>{children}</>;
  }

  let finalChildren = children;

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
      'EvmWalletUiRoot',
      'Wrapping children with dynamically loaded KitProvider (RainbowKit).'
    );
    finalChildren = <DynKitProvider {...providerProps}>{children}</DynKitProvider>;
  } else if (currentFullUiKitConfig?.kitName === 'rainbowkit' && error) {
    logger.error(
      'EvmWalletUiRoot',
      'RainbowKit configured, but failed to initialize:',
      error.message
    );
  }

  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount={true}>
      <QueryClientProvider client={queryClient}>
        <WagmiProviderInitializedContext.Provider value={!error}>
          {finalChildren}
        </WagmiProviderInitializedContext.Provider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};
