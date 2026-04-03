import type { ISupportedWallet } from '@creit.tech/stellar-wallets-kit';
import { ReactNode, useCallback, useEffect, useState } from 'react';

import type { UiKitConfiguration } from '@openzeppelin/ui-types';
import { logger } from '@openzeppelin/ui-utils';

import {
  connectStellarWallet,
  disconnectStellarWallet,
  getStellarAvailableConnectors,
  getStellarWalletConnectionStatus,
  onStellarWalletConnectionChange,
} from '../connection';
import {
  StellarWalletContext,
  type StellarWalletContextType,
} from '../context/StellarWalletContext';
import { stellarUiKitManager, type StellarUiKitManagerState } from '../stellar-wallets-kit';
import type { StellarWalletConnectionStatus } from '../types';

/**
 * Props for the StellarWalletUiRoot provider
 */
interface StellarWalletUiRootProps {
  children: ReactNode;
  /** UI kit configuration */
  uiKitConfig?: UiKitConfiguration;
}

/**
 * Stellar wallet UI root provider component
 * This component manages the wallet connection state and provides it to child components
 */
export function StellarWalletUiRoot({ children, uiKitConfig }: StellarWalletUiRootProps) {
  // UI Kit manager state
  const [uiKitManagerState, setUiKitManagerState] = useState<StellarUiKitManagerState>(
    stellarUiKitManager.getState()
  );

  // Connection state
  const [connectionStatus, setConnectionStatus] = useState<StellarWalletConnectionStatus>(() =>
    getStellarWalletConnectionStatus()
  );
  const [availableWallets, setAvailableWallets] = useState<ISupportedWallet[]>([]);

  // Initialize UI kit on mount
  useEffect(() => {
    // Only configure if a specific UI kit config is provided or if not already configured
    const currentState = stellarUiKitManager.getState();

    if (uiKitConfig || !currentState.currentFullUiKitConfig) {
      const configToUse = uiKitConfig || { kitName: 'custom' as const, kitConfig: {} };

      logger.debug('StellarWalletUiRoot', 'Configuring UI kit with:', configToUse);

      stellarUiKitManager.configure(configToUse).catch((error) => {
        logger.error('Failed to configure Stellar UI kit:', error);
      });
    }
  }, [uiKitConfig]);

  // Subscribe to UI kit state changes
  useEffect(() => {
    const unsubscribe = stellarUiKitManager.subscribe(() => {
      setUiKitManagerState(stellarUiKitManager.getState());
    });

    return unsubscribe;
  }, []);

  // Event-driven connection status updates
  useEffect(() => {
    const unsubscribeFromConnectionChanges = onStellarWalletConnectionChange(
      (currentStatus, _previousStatus) => {
        setConnectionStatus(currentStatus);
        logger.debug(
          'StellarWalletUiRoot',
          `Connection status changed: ${currentStatus.status ?? (currentStatus.isConnected ? 'connected' : 'disconnected')}`,
          currentStatus.address
        );
      }
    );

    // Initial update to sync current state
    setConnectionStatus(getStellarWalletConnectionStatus());

    return () => {
      unsubscribeFromConnectionChanges();
    };
  }, []);

  // Load available wallets
  useEffect(() => {
    const loadWallets = async () => {
      try {
        const connectors = await getStellarAvailableConnectors();
        setAvailableWallets(connectors as unknown as ISupportedWallet[]);
      } catch (error) {
        logger.error('Failed to load available wallets:', String(error));
      }
    };

    if (!uiKitManagerState.isInitializing && uiKitManagerState.stellarKitProvider) {
      loadWallets();
    }
  }, [uiKitManagerState.isInitializing, uiKitManagerState.stellarKitProvider]);

  /**
   * Connect to a wallet
   */
  const connect = useCallback(async (walletId: string) => {
    try {
      const result = await connectStellarWallet(walletId);

      if (!result.connected || !result.address) {
        throw new Error(result.error || 'Failed to connect wallet');
      }
    } catch (error) {
      logger.error('Failed to connect:', String(error));
      throw error;
    }
  }, []);

  /**
   * Disconnect from the current wallet
   */
  const disconnect = useCallback(async () => {
    try {
      const result = await disconnectStellarWallet();

      if (!result.disconnected) {
        throw new Error(result.error || 'Failed to disconnect wallet');
      }
    } catch (error) {
      logger.error('Failed to disconnect:', String(error));
      throw error;
    }
  }, []);

  const isConnected = connectionStatus.isConnected;
  const status =
    connectionStatus.status ??
    (isConnected
      ? 'connected'
      : connectionStatus.isReconnecting
        ? 'reconnecting'
        : connectionStatus.isConnecting
          ? 'connecting'
          : 'disconnected');

  const contextValue: StellarWalletContextType = {
    address: connectionStatus.address ?? null,
    isConnected,
    isConnecting: connectionStatus.isConnecting ?? false,
    isDisconnected: connectionStatus.isDisconnected ?? !isConnected,
    isReconnecting: connectionStatus.isReconnecting ?? false,
    status,
    availableWallets,
    connect,
    disconnect,
    uiKitManagerState,
    kit: uiKitManagerState.stellarKitProvider,
  };

  return (
    <StellarWalletContext.Provider value={contextValue}>{children}</StellarWalletContext.Provider>
  );
}
