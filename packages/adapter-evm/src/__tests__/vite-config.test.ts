import { describe, expect, it } from 'vitest';

import { getEvmViteConfig } from '../vite-config';

describe('getEvmViteConfig', () => {
  it('prebundles lazy wallet dependencies for dev-mode interop', () => {
    const config = getEvmViteConfig();

    expect(config.resolve?.dedupe).toEqual(['viem', 'wagmi', '@wagmi/core']);
    expect(config.optimizeDeps?.include).toEqual([
      'wagmi',
      '@wagmi/core',
      '@wagmi/connectors',
      'viem',
      '@tanstack/react-query',
      '@rainbow-me/rainbowkit',
      '@metamask/sdk',
      'debug',
      '@walletconnect/ethereum-provider',
      '@walletconnect/universal-provider',
      '@walletconnect/logger',
      'events',
    ]);
  });
});
