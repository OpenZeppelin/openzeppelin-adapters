import { describe, expect, it, vi } from 'vitest';

import {
  createOpenZeppelinAdapterIntegration,
  defineOpenZeppelinAdapterViteConfig,
  defineOpenZeppelinAdapterVitestConfig,
} from '../index';
import type { OpenZeppelinAdapterViteConfig } from '../types';

const {
  mockLoadOpenZeppelinAdapterViteConfig,
  mockCreateOpenZeppelinAdapterResolverPlugin,
  mockResolveInstalledOpenZeppelinAdapterEntries,
} = vi.hoisted(() => ({
  mockLoadOpenZeppelinAdapterViteConfig: vi.fn<() => Promise<OpenZeppelinAdapterViteConfig>>(
    async () => ({
      plugins: [{ name: 'adapter-plugin' }],
      resolve: {
        alias: {
          '@openzeppelin/relayer-sdk': '@openzeppelin/relayer-sdk/dist/esm/index.js',
        },
        dedupe: ['viem', 'react'],
      },
      optimizeDeps: {
        include: ['viem'],
        exclude: ['@openzeppelin/adapter-evm'],
      },
      ssr: {
        noExternal: ['viem'],
      },
      packageNames: ['@openzeppelin/adapter-evm'],
    })
  ),
  mockCreateOpenZeppelinAdapterResolverPlugin: vi.fn(() => ({
    name: 'resolver-plugin',
  })),
  mockResolveInstalledOpenZeppelinAdapterEntries: vi.fn(() => ({
    '@openzeppelin/adapter-evm': '/virtual/adapter-evm/index.mjs',
    '@openzeppelin/adapter-evm/metadata': '/virtual/adapter-evm/metadata.mjs',
  })),
}));

vi.mock('../config', () => ({
  loadOpenZeppelinAdapterViteConfig: mockLoadOpenZeppelinAdapterViteConfig,
}));

vi.mock('../resolver', () => ({
  createOpenZeppelinAdapterResolverPlugin: mockCreateOpenZeppelinAdapterResolverPlugin,
  resolveInstalledOpenZeppelinAdapterEntries: mockResolveInstalledOpenZeppelinAdapterEntries,
}));

describe('high-level adapters-vite integration helpers', () => {
  it('merges adapter Vite config into app config without consumer boilerplate', async () => {
    const config = await defineOpenZeppelinAdapterViteConfig({
      ecosystems: ['evm'],
      config: {
        plugins: [{ name: 'app-plugin' }],
        resolve: {
          dedupe: ['react', 'react-dom'],
        },
        optimizeDeps: {
          include: ['react'],
          exclude: ['legacy-dep'],
        },
        ssr: {
          noExternal: ['react'],
        },
      },
    });

    expect(config.plugins).toEqual([{ name: 'adapter-plugin' }, { name: 'app-plugin' }]);
    expect(config.resolve?.alias).toEqual({
      '@openzeppelin/relayer-sdk': '@openzeppelin/relayer-sdk/dist/esm/index.js',
    });
    expect(config.resolve?.dedupe).toEqual(['react', 'react-dom', 'viem']);
    expect(config.optimizeDeps?.include).toEqual(['react', 'viem']);
    expect(config.optimizeDeps?.exclude).toEqual(['legacy-dep', '@openzeppelin/adapter-evm']);
    expect(config.ssr?.noExternal).toEqual(['react', 'viem']);
  });

  it('adds resolver wiring and installed-export aliases for Vitest configs', async () => {
    const config = await defineOpenZeppelinAdapterVitestConfig({
      ecosystems: ['evm'],
      importMetaUrl: 'file:///workspace/apps/builder/vitest.config.ts',
      config: {
        plugins: [{ name: 'app-plugin' }],
        resolve: {
          alias: {
            '@': '/workspace/apps/builder/src',
          },
        },
      },
    });

    expect(config.plugins).toEqual([
      { name: 'adapter-plugin' },
      { name: 'app-plugin' },
      { name: 'resolver-plugin' },
    ]);
    expect(config.resolve?.alias).toEqual({
      '@openzeppelin/relayer-sdk': '@openzeppelin/relayer-sdk/dist/esm/index.js',
      '@': '/workspace/apps/builder/src',
      '@openzeppelin/adapter-evm': '/virtual/adapter-evm/index.mjs',
      '@openzeppelin/adapter-evm/metadata': '/virtual/adapter-evm/metadata.mjs',
    });
    expect(mockCreateOpenZeppelinAdapterResolverPlugin).toHaveBeenCalledWith({
      ecosystems: ['evm'],
      importMetaUrl: 'file:///workspace/apps/builder/vitest.config.ts',
      exportPaths: undefined,
    });
  });

  it('caches adapter config loading across vite and vitest builders', async () => {
    mockLoadOpenZeppelinAdapterViteConfig.mockClear();

    const integration = createOpenZeppelinAdapterIntegration({
      ecosystems: ['evm'],
      importMetaUrl: 'file:///workspace/apps/builder/vitest.config.ts',
    });

    await integration.vite({
      optimizeDeps: {
        include: ['react'],
      },
    });
    await integration.vitest({
      resolve: {
        alias: {
          '@': '/workspace/apps/builder/src',
        },
      },
    });

    expect(mockLoadOpenZeppelinAdapterViteConfig).toHaveBeenCalledTimes(1);
  });

  it('requires importMetaUrl before building Vitest integration from the shared builder', async () => {
    const integration = createOpenZeppelinAdapterIntegration({
      ecosystems: ['evm'],
    });

    await expect(integration.vitest()).rejects.toThrow(/requires importMetaUrl/);
  });

  it('preserves ssr.noExternal true when either side requires full bundling', async () => {
    const config = await defineOpenZeppelinAdapterViteConfig({
      ecosystems: ['evm'],
      config: {
        ssr: {
          noExternal: true,
        },
      },
    });

    expect(config.ssr?.noExternal).toBe(true);
  });
});
