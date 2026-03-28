import type { Plugin, PluginOption, UserConfig } from 'vite';

export const SUPPORTED_OPENZEPPELIN_ADAPTER_ECOSYSTEMS = [
  'evm',
  'midnight',
  'polkadot',
  'solana',
  'stellar',
] as const;

export type OpenZeppelinAdapterEcosystem =
  (typeof SUPPORTED_OPENZEPPELIN_ADAPTER_ECOSYSTEMS)[number];

export type OpenZeppelinAdapterExportPath = '.' | './metadata' | './networks';

export interface MidnightAdapterPluginFactories {
  wasm: () => Plugin;
  topLevelAwait: () => Plugin;
}

export interface OpenZeppelinAdapterPluginFactories {
  midnight?: MidnightAdapterPluginFactories;
}

export interface LoadOpenZeppelinAdapterViteConfigOptions {
  ecosystems: readonly OpenZeppelinAdapterEcosystem[];
  pluginFactories?: OpenZeppelinAdapterPluginFactories;
}

export interface ResolveInstalledOpenZeppelinAdapterEntriesOptions {
  ecosystems: readonly OpenZeppelinAdapterEcosystem[];
  importMetaUrl: string;
  exportPaths?: readonly OpenZeppelinAdapterExportPath[];
}

export interface OpenZeppelinAdapterViteConfig {
  plugins: PluginOption[];
  resolve: NonNullable<UserConfig['resolve']>;
  optimizeDeps: NonNullable<UserConfig['optimizeDeps']>;
  ssr: NonNullable<UserConfig['ssr']>;
  packageNames: string[];
}

export type AdapterViteConfigFragment = Partial<
  Pick<UserConfig, 'plugins' | 'resolve' | 'optimizeDeps' | 'ssr'>
>;
