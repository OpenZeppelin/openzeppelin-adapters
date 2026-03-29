import { describe, expect, it, vi } from 'vitest';

import { resolveInstalledOpenZeppelinAdapterEntries } from '../resolver';

const {
  mockResolvePackagePath,
  mockReadFileSync,
  mockGetOpenZeppelinAdapterPackageNames,
  mockGetOpenZeppelinAdapterImportSpecifier,
} = vi.hoisted(() => ({
  mockResolvePackagePath: vi.fn((packageName: string) => `/virtual/${packageName}/dist/index.mjs`),
  mockReadFileSync: vi.fn(() =>
    JSON.stringify({
      exports: {
        '.': { import: './dist/index.mjs' },
        './metadata': { import: './dist/metadata.mjs' },
        './networks': { import: './dist/networks.mjs' },
      },
    })
  ),
  mockGetOpenZeppelinAdapterPackageNames: vi.fn(() => ['@openzeppelin/adapter-evm']),
  mockGetOpenZeppelinAdapterImportSpecifier: vi.fn(
    (packageName: string, exportPath: '.' | './metadata' | './networks') =>
      exportPath === '.' ? packageName : `${packageName}/${exportPath.slice(2)}`
  ),
}));

vi.mock('node:fs', () => ({
  default: {
    readFileSync: mockReadFileSync,
  },
}));

vi.mock('node:module', () => ({
  createRequire: vi.fn(() => ({
    resolve: mockResolvePackagePath,
  })),
}));

vi.mock('../registry', () => ({
  getOpenZeppelinAdapterPackageNames: mockGetOpenZeppelinAdapterPackageNames,
  getOpenZeppelinAdapterImportSpecifier: mockGetOpenZeppelinAdapterImportSpecifier,
}));

describe('resolveInstalledOpenZeppelinAdapterEntries', () => {
  it('orders subpath aliases before package root aliases by default', () => {
    const entries = resolveInstalledOpenZeppelinAdapterEntries({
      ecosystems: ['evm'],
      importMetaUrl: 'file:///workspace/apps/builder/vitest.config.ts',
    });

    expect(Object.keys(entries)).toEqual([
      '@openzeppelin/adapter-evm/metadata',
      '@openzeppelin/adapter-evm/networks',
      '@openzeppelin/adapter-evm',
    ]);
  });

  it('preserves an explicit exportPaths order from the consumer', () => {
    const entries = resolveInstalledOpenZeppelinAdapterEntries({
      ecosystems: ['evm'],
      importMetaUrl: 'file:///workspace/apps/builder/vitest.config.ts',
      exportPaths: ['.', './metadata'],
    });

    expect(Object.keys(entries)).toEqual([
      '@openzeppelin/adapter-evm',
      '@openzeppelin/adapter-evm/metadata',
    ]);
  });
});
