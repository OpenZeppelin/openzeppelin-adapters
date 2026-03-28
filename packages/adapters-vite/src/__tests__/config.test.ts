import { describe, expect, it, vi } from 'vitest';

import {
  getOpenZeppelinAdapterImportSpecifiers,
  getOpenZeppelinAdapterPackageNames,
  loadOpenZeppelinAdapterViteConfig,
} from '../index';

vi.mock('@openzeppelin/adapter-evm/vite-config', () => ({
  getEvmViteConfig: () => ({
    plugins: [{ name: 'evm-plugin' }],
    resolve: {
      dedupe: ['viem', 'wagmi'],
    },
    optimizeDeps: {
      include: ['viem', '@tanstack/react-query'],
      exclude: ['wagmi'],
    },
  }),
}));

vi.mock('@openzeppelin/adapter-stellar/vite-config', () => ({
  getStellarViteConfig: () => ({
    resolve: {
      dedupe: ['@stellar/stellar-sdk'],
    },
    optimizeDeps: {
      include: ['@stellar/stellar-sdk'],
      exclude: [],
    },
  }),
}));

vi.mock('@openzeppelin/adapter-polkadot/vite-config', () => ({
  getPolkadotViteConfig: () => ({
    optimizeDeps: {
      include: ['viem'],
    },
    ssr: {
      noExternal: ['viem'],
    },
  }),
}));

vi.mock('@openzeppelin/adapter-midnight/vite-config', () => ({
  getMidnightViteConfig: (plugins: {
    wasm: () => { name: string };
    topLevelAwait: () => { name: string };
  }) => ({
    plugins: [plugins.wasm(), plugins.topLevelAwait()],
    resolve: {
      dedupe: ['@midnight-ntwrk/midnight-js-network-id'],
    },
    optimizeDeps: {
      include: ['buffer'],
      exclude: ['@midnight-ntwrk/onchain-runtime'],
    },
  }),
}));

describe('@openzeppelin/adapters-vite', () => {
  it('merges adapter config fragments and adds package-level exclusions', async () => {
    const config = await loadOpenZeppelinAdapterViteConfig({
      ecosystems: ['evm', 'stellar', 'polkadot'],
    });

    expect(config.plugins).toHaveLength(1);
    expect(config.resolve.dedupe).toEqual(['viem', 'wagmi', '@stellar/stellar-sdk']);
    expect(config.optimizeDeps.include).toEqual([
      'viem',
      '@tanstack/react-query',
      '@stellar/stellar-sdk',
    ]);
    expect(config.optimizeDeps.exclude).toEqual([
      '@openzeppelin/adapter-evm',
      '@openzeppelin/adapter-stellar',
      '@openzeppelin/adapter-polkadot',
      'wagmi',
      '@openzeppelin/adapter-evm-core',
    ]);
    expect(config.ssr.noExternal).toEqual([
      '@openzeppelin/adapter-evm',
      '@openzeppelin/adapter-stellar',
      '@openzeppelin/adapter-polkadot',
      'viem',
    ]);
    expect(config.packageNames).toEqual([
      '@openzeppelin/adapter-evm',
      '@openzeppelin/adapter-stellar',
      '@openzeppelin/adapter-polkadot',
    ]);
  });

  it('requires midnight plugin factories when midnight support is requested', async () => {
    await expect(
      loadOpenZeppelinAdapterViteConfig({
        ecosystems: ['midnight'],
      })
    ).rejects.toThrow(/pluginFactories\.midnight/);
  });

  it('supports midnight config when plugin factories are provided', async () => {
    const config = await loadOpenZeppelinAdapterViteConfig({
      ecosystems: ['midnight'],
      pluginFactories: {
        midnight: {
          wasm: () => ({ name: 'wasm-plugin' }),
          topLevelAwait: () => ({ name: 'tla-plugin' }),
        },
      },
    });

    expect(config.plugins).toHaveLength(2);
    expect(config.resolve.dedupe).toEqual(['@midnight-ntwrk/midnight-js-network-id']);
    expect(config.optimizeDeps.include).toEqual(['buffer']);
    expect(config.optimizeDeps.exclude).toEqual([
      '@openzeppelin/adapter-midnight',
      '@midnight-ntwrk/onchain-runtime',
    ]);
  });

  it('returns deduplicated package names and import specifiers', () => {
    expect(getOpenZeppelinAdapterPackageNames(['evm', 'stellar', 'evm'])).toEqual([
      '@openzeppelin/adapter-evm',
      '@openzeppelin/adapter-stellar',
    ]);

    expect(
      getOpenZeppelinAdapterImportSpecifiers(
        ['evm'],
        ['.', './metadata', './networks', './metadata']
      )
    ).toEqual([
      '@openzeppelin/adapter-evm',
      '@openzeppelin/adapter-evm/metadata',
      '@openzeppelin/adapter-evm/networks',
    ]);
  });
});
