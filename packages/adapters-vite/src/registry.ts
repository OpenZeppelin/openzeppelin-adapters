import type { UserConfig } from 'vite';

import type {
  AdapterViteConfigFragment,
  LoadOpenZeppelinAdapterViteConfigOptions,
  OpenZeppelinAdapterEcosystem,
  OpenZeppelinAdapterExportPath,
} from './types';

interface AdapterRegistryEntry {
  packageName: string;
  extraOptimizeDepsExclude?: string[];
  loadConfig: (
    options: LoadOpenZeppelinAdapterViteConfigOptions
  ) => Promise<AdapterViteConfigFragment>;
}

const ADAPTER_REGISTRY: Record<OpenZeppelinAdapterEcosystem, AdapterRegistryEntry> = {
  evm: {
    packageName: '@openzeppelin/adapter-evm',
    extraOptimizeDepsExclude: ['@openzeppelin/adapter-evm-core'],
    async loadConfig() {
      const { getEvmViteConfig } = await import('@openzeppelin/adapter-evm/vite-config');
      return getEvmViteConfig() as Partial<UserConfig>;
    },
  },
  midnight: {
    packageName: '@openzeppelin/adapter-midnight',
    async loadConfig(options) {
      const midnightPlugins = options.pluginFactories?.midnight;
      if (!midnightPlugins) {
        throw new Error(
          'Midnight adapter Vite configuration requires `pluginFactories.midnight` with `wasm` and `topLevelAwait`.'
        );
      }

      const { getMidnightViteConfig } = await import('@openzeppelin/adapter-midnight/vite-config');
      return getMidnightViteConfig(midnightPlugins) as Partial<UserConfig>;
    },
  },
  polkadot: {
    packageName: '@openzeppelin/adapter-polkadot',
    async loadConfig() {
      const { getPolkadotViteConfig } = await import('@openzeppelin/adapter-polkadot/vite-config');
      return getPolkadotViteConfig() as Partial<UserConfig>;
    },
  },
  solana: {
    packageName: '@openzeppelin/adapter-solana',
    async loadConfig() {
      const { getSolanaViteConfig } = await import('@openzeppelin/adapter-solana/vite-config');
      return getSolanaViteConfig() as Partial<UserConfig>;
    },
  },
  stellar: {
    packageName: '@openzeppelin/adapter-stellar',
    async loadConfig() {
      const { getStellarViteConfig } = await import('@openzeppelin/adapter-stellar/vite-config');
      return getStellarViteConfig() as Partial<UserConfig>;
    },
  },
};

export function normalizeEcosystems(
  ecosystems: readonly OpenZeppelinAdapterEcosystem[]
): OpenZeppelinAdapterEcosystem[] {
  return [...new Set(ecosystems)];
}

export function getAdapterRegistryEntry(
  ecosystem: OpenZeppelinAdapterEcosystem
): AdapterRegistryEntry {
  return ADAPTER_REGISTRY[ecosystem];
}

export function getOpenZeppelinAdapterPackageNames(
  ecosystems: readonly OpenZeppelinAdapterEcosystem[]
): string[] {
  return normalizeEcosystems(ecosystems).map(
    (ecosystem) => ADAPTER_REGISTRY[ecosystem].packageName
  );
}

export function getOpenZeppelinAdapterImportSpecifier(
  packageName: string,
  exportPath: OpenZeppelinAdapterExportPath
): string {
  if (exportPath === '.') {
    return packageName;
  }

  return `${packageName}/${exportPath.slice(2)}`;
}

export function getOpenZeppelinAdapterImportSpecifiers(
  ecosystems: readonly OpenZeppelinAdapterEcosystem[],
  exportPaths: readonly OpenZeppelinAdapterExportPath[]
): string[] {
  const specifiers = new Set<string>();

  for (const packageName of getOpenZeppelinAdapterPackageNames(ecosystems)) {
    for (const exportPath of exportPaths) {
      specifiers.add(getOpenZeppelinAdapterImportSpecifier(packageName, exportPath));
    }
  }

  return [...specifiers];
}
