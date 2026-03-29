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

export interface OpenZeppelinAdapterIntegrationOptions extends LoadOpenZeppelinAdapterViteConfigOptions {
  importMetaUrl?: string;
  exportPaths?: readonly OpenZeppelinAdapterExportPath[];
}

export interface DefineOpenZeppelinAdapterViteConfigOptions extends LoadOpenZeppelinAdapterViteConfigOptions {
  config?: UserConfig;
}

export interface DefineOpenZeppelinAdapterVitestConfigOptions extends OpenZeppelinAdapterIntegrationOptions {
  config?: UserConfig;
  importMetaUrl: string;
}

export interface ResolveInstalledOpenZeppelinAdapterEntriesOptions {
  ecosystems: readonly OpenZeppelinAdapterEcosystem[];
  importMetaUrl: string;
  exportPaths?: readonly OpenZeppelinAdapterExportPath[];
}

export interface OpenZeppelinAdapterResolvedConfig {
  alias?: Record<string, string>;
  dedupe: string[];
}

export interface OpenZeppelinAdapterOptimizeDepsConfig {
  include: string[];
  exclude: string[];
}

export interface OpenZeppelinAdapterSsrConfig {
  noExternal: true | Array<string | RegExp>;
}

export interface OpenZeppelinAdapterViteConfig {
  plugins: PluginOption[];
  resolve: OpenZeppelinAdapterResolvedConfig;
  optimizeDeps: OpenZeppelinAdapterOptimizeDepsConfig;
  ssr: OpenZeppelinAdapterSsrConfig;
  packageNames: string[];
}

export interface OpenZeppelinAdapterIntegration {
  vite(config?: UserConfig): Promise<UserConfig>;
  vitest(config?: UserConfig): Promise<UserConfig>;
}

export type AdapterViteConfigFragment = Partial<
  Pick<UserConfig, 'plugins' | 'resolve' | 'optimizeDeps' | 'ssr'>
>;
