import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

import type { EvmUiKitManagerState } from '../../evmUiKitManager';

/**
 * Regression coverage for a white screen when switching wallet kit at runtime.
 *
 * uiKitManager.configure() deliberately clears kitProviderComponent and
 * isKitAssetsLoaded and notifies listeners *before* RainbowKit's dynamically
 * imported provider resolves. During that window the kit is already 'rainbowkit'
 * but the provider is absent, so rendering children mounted RainbowKit consumers
 * outside RainbowKitProvider and threw:
 *
 *   Uncaught Error: Transaction hooks must be used within RainbowKitProvider
 */

let mockState: EvmUiKitManagerState;

vi.mock('wagmi', () => ({
  WagmiProvider: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

vi.mock('@tanstack/react-query', () => ({
  QueryClient: class {},
  QueryClientProvider: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

vi.mock('@openzeppelin/adapter-evm-core', () => ({
  WagmiProviderInitializedContext: {
    Provider: ({ children }: React.PropsWithChildren) => children,
  },
}));

vi.mock('../../evmUiKitManager', () => ({
  evmUiKitManager: {
    getState: () => mockState,
    subscribe: () => () => {},
  },
}));

const { EvmWalletUiRoot } = await import('../EvmWalletUiRoot');

function stateWith(overrides: Partial<EvmUiKitManagerState>): EvmUiKitManagerState {
  return {
    wagmiConfig: { mock: true },
    kitProviderComponent: null,
    isKitAssetsLoaded: false,
    currentFullUiKitConfig: null,
    error: null,
    ...overrides,
  } as unknown as EvmUiKitManagerState;
}

const RkProvider = ({ children }: React.PropsWithChildren) => (
  <div data-testid="rk-provider">{children}</div>
);

describe('EvmWalletUiRoot RainbowKit provider gating', () => {
  beforeEach(() => {
    mockState = stateWith({});
  });

  it('withholds children while the RainbowKit provider is still loading', () => {
    mockState = stateWith({
      currentFullUiKitConfig: { kitName: 'rainbowkit', kitConfig: {} },
      kitProviderComponent: null,
      isKitAssetsLoaded: false,
    });

    render(
      <EvmWalletUiRoot>
        <span data-testid="child">wallet ui</span>
      </EvmWalletUiRoot>
    );

    // Rendering the child here is what threw outside RainbowKitProvider.
    expect(screen.queryByTestId('child')).toBeNull();
  });

  it('withholds children when assets report loaded but the provider is missing', () => {
    mockState = stateWith({
      currentFullUiKitConfig: { kitName: 'rainbowkit', kitConfig: {} },
      kitProviderComponent: null,
      isKitAssetsLoaded: true,
    });

    render(
      <EvmWalletUiRoot>
        <span data-testid="child">wallet ui</span>
      </EvmWalletUiRoot>
    );

    expect(screen.queryByTestId('child')).toBeNull();
  });

  it('renders children inside RainbowKitProvider once it is ready', () => {
    mockState = stateWith({
      currentFullUiKitConfig: { kitName: 'rainbowkit', kitConfig: {} },
      kitProviderComponent: RkProvider,
      isKitAssetsLoaded: true,
    });

    render(
      <EvmWalletUiRoot>
        <span data-testid="child">wallet ui</span>
      </EvmWalletUiRoot>
    );

    expect(screen.getByTestId('rk-provider')).toBeTruthy();
    expect(screen.getByTestId('child')).toBeTruthy();
  });

  it('renders children immediately for non-RainbowKit kits', () => {
    mockState = stateWith({
      currentFullUiKitConfig: { kitName: 'custom', kitConfig: {} },
    });

    render(
      <EvmWalletUiRoot>
        <span data-testid="child">wallet ui</span>
      </EvmWalletUiRoot>
    );

    expect(screen.getByTestId('child')).toBeTruthy();
    expect(screen.queryByTestId('rk-provider')).toBeNull();
  });
});
