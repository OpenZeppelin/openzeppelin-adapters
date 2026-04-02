/**
 * Tests for EVM adapter wallet connection functionality
 */
import type { GetAccountReturnType } from '@wagmi/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockEvmNetworkConfig } from './mocks/mock-network-configs';

import { createWallet } from '../capabilities';

// Mock the createEvmWalletImplementation factory to isolate wallet-capability logic
vi.mock('../wallet/implementation/wagmi-implementation', () => {
  // --- Mock implementations for WagmiWalletImplementation methods ---
  const mockGetAvailableConnectors = vi.fn().mockResolvedValue([
    { id: 'injected', name: 'Browser Wallet' },
    { id: 'walletConnect', name: 'WalletConnect' },
  ]);

  const mockConnect = vi.fn().mockImplementation(async (_connectorId: string) => ({
    connected: true,
    address: '0x1234567890123456789012345678901234567890',
    chainId: mockEvmNetworkConfig.chainId,
    error: undefined,
  }));

  const mockDisconnect = vi.fn().mockResolvedValue({ disconnected: true, error: undefined });

  const mockSwitchNetwork = vi.fn().mockResolvedValue(undefined);

  // Mock the raw Wagmi status returned by the implementation class
  const mockWagmiStatus: GetAccountReturnType = {
    address: undefined,
    addresses: undefined,
    chain: undefined,
    chainId: undefined,
    connector: undefined,
    isConnected: false,
    isConnecting: false,
    isDisconnected: true,
    isReconnecting: false,
    status: 'disconnected',
  };

  const mockGetWalletConnectionStatus = vi.fn().mockReturnValue(mockWagmiStatus);

  const mockOnWalletConnectionChange = vi.fn().mockImplementation((_callback) => {
    // Return a dummy unsubscribe function
    return () => {};
  });
  // --- End Mock Implementations ---

  return {
    createEvmWalletImplementation: vi.fn().mockImplementation(() => ({
      // Expose mocks
      getAvailableConnectors: mockGetAvailableConnectors,
      connect: mockConnect,
      disconnect: mockDisconnect,
      getWalletConnectionStatus: mockGetWalletConnectionStatus,
      onWalletConnectionChange: mockOnWalletConnectionChange,
      switchNetwork: mockSwitchNetwork,
    })),
  };
});

describe('EVM Wallet Capability', () => {
  const wallet = createWallet(mockEvmNetworkConfig);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should support wallet connection', () => {
    expect(wallet.supportsWalletConnection()).toBe(true);
  });

  it('should get available connectors', async () => {
    const connectors = await wallet.getAvailableConnectors();
    expect(connectors).toBeInstanceOf(Array);
    expect(connectors.length).toBeGreaterThan(0);
    expect(connectors[0]).toHaveProperty('id');
    expect(connectors[0]).toHaveProperty('name');
  });

  it('should connect wallet with a connector ID', async () => {
    const connectorId = 'injected'; // Example connector ID
    const result = await wallet.connectWallet(connectorId);
    expect(result.connected).toBe(true);
    expect(result.address).toBe('0x1234567890123456789012345678901234567890');
    expect(result.error).toBeUndefined();
  });

  it('should disconnect wallet', async () => {
    const result = await wallet.disconnectWallet();
    expect(result.disconnected).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should get wallet connection status', () => {
    const status = wallet.getWalletConnectionStatus();
    expect(status).toHaveProperty('isConnected');
    expect(status.isConnected).toBe(false);
  });

  it('should subscribe to wallet connection changes', () => {
    const callback = vi.fn();
    const unsubscribe = wallet.onWalletConnectionChange?.(callback);

    expect(typeof unsubscribe).toBe('function');
  });
});
