import type { PluginOption, UserConfig } from 'vite';

import { loadOpenZeppelinAdapterViteConfig } from './config';
import {
  createOpenZeppelinAdapterResolverPlugin,
  resolveInstalledOpenZeppelinAdapterEntries,
} from './resolver';
import type {
  DefineOpenZeppelinAdapterViteConfigOptions,
  DefineOpenZeppelinAdapterVitestConfigOptions,
  OpenZeppelinAdapterIntegration,
  OpenZeppelinAdapterIntegrationOptions,
  OpenZeppelinAdapterSsrConfig,
  OpenZeppelinAdapterViteConfig,
} from './types';

type SsrNoExternalValue = NonNullable<NonNullable<UserConfig['ssr']>['noExternal']>;

function normalizePluginOptions(plugins: UserConfig['plugins']): PluginOption[] {
  if (!plugins) {
    return [];
  }

  return Array.isArray(plugins) ? plugins : [plugins];
}

function normalizeStringValues(value: string | string[] | undefined): string[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function mergeUniqueStrings(
  base: string | string[] | undefined,
  extra: readonly string[]
): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();

  for (const entry of [...normalizeStringValues(base), ...extra]) {
    if (!entry || seen.has(entry)) {
      continue;
    }

    seen.add(entry);
    merged.push(entry);
  }

  return merged;
}

function mergeSsrNoExternal(
  base: SsrNoExternalValue | undefined,
  extra: OpenZeppelinAdapterSsrConfig['noExternal']
): true | Array<string | RegExp> {
  if (base === true || extra === true) {
    return true;
  }

  const merged: Array<string | RegExp> = [];
  const seenStrings = new Set<string>();
  const values = [
    ...(base ? (Array.isArray(base) ? base : [base]) : []),
    ...(Array.isArray(extra) ? extra : [extra]),
  ];

  for (const entry of values) {
    if (typeof entry === 'string') {
      if (!seenStrings.has(entry)) {
        seenStrings.add(entry);
        merged.push(entry);
      }
      continue;
    }

    if (entry instanceof RegExp) {
      merged.push(entry);
    }
  }

  return merged;
}

function mergeResolveAlias(
  baseAlias: NonNullable<NonNullable<UserConfig['resolve']>['alias']> | undefined,
  extraAliasEntries: Record<string, string>
): NonNullable<NonNullable<UserConfig['resolve']>['alias']> | undefined {
  if (Object.keys(extraAliasEntries).length === 0) {
    return baseAlias;
  }

  if (!baseAlias) {
    return extraAliasEntries;
  }

  if (Array.isArray(baseAlias)) {
    return [
      ...baseAlias,
      ...Object.entries(extraAliasEntries).map(([find, replacement]) => ({
        find,
        replacement,
      })),
    ];
  }

  return {
    ...baseAlias,
    ...extraAliasEntries,
  };
}

function mergeOpenZeppelinAdapterConfig(
  baseConfig: UserConfig,
  adapterConfig: OpenZeppelinAdapterViteConfig,
  options: {
    extraPlugins?: PluginOption[];
    extraAliasEntries?: Record<string, string>;
  } = {}
): UserConfig {
  const extraPlugins = options.extraPlugins ?? [];
  const extraAliasEntries = options.extraAliasEntries ?? {};

  return {
    ...baseConfig,
    plugins: [
      ...adapterConfig.plugins,
      ...normalizePluginOptions(baseConfig.plugins),
      ...extraPlugins,
    ],
    resolve: {
      ...baseConfig.resolve,
      alias: mergeResolveAlias(baseConfig.resolve?.alias, extraAliasEntries),
      dedupe: mergeUniqueStrings(baseConfig.resolve?.dedupe, adapterConfig.resolve.dedupe),
    },
    optimizeDeps: {
      ...baseConfig.optimizeDeps,
      include: mergeUniqueStrings(
        baseConfig.optimizeDeps?.include,
        adapterConfig.optimizeDeps.include
      ),
      exclude: mergeUniqueStrings(
        baseConfig.optimizeDeps?.exclude,
        adapterConfig.optimizeDeps.exclude
      ),
    },
    ssr: {
      ...baseConfig.ssr,
      noExternal: mergeSsrNoExternal(baseConfig.ssr?.noExternal, adapterConfig.ssr.noExternal),
    },
  };
}

async function buildOpenZeppelinAdapterViteConfig(
  options: OpenZeppelinAdapterIntegrationOptions,
  config: UserConfig = {}
): Promise<UserConfig> {
  const adapterConfig = await loadOpenZeppelinAdapterViteConfig(options);
  return mergeOpenZeppelinAdapterConfig(config, adapterConfig);
}

async function buildOpenZeppelinAdapterVitestConfig(
  options: OpenZeppelinAdapterIntegrationOptions,
  config: UserConfig = {}
): Promise<UserConfig> {
  if (!options.importMetaUrl) {
    throw new Error(
      'createOpenZeppelinAdapterIntegration(...).vitest() requires importMetaUrl to resolve ' +
        'installed adapter exports'
    );
  }

  const adapterConfig = await loadOpenZeppelinAdapterViteConfig(options);
  const resolverOptions = {
    ecosystems: options.ecosystems,
    importMetaUrl: options.importMetaUrl,
    exportPaths: options.exportPaths,
  };

  return mergeOpenZeppelinAdapterConfig(config, adapterConfig, {
    extraPlugins: [createOpenZeppelinAdapterResolverPlugin(resolverOptions)],
    extraAliasEntries: resolveInstalledOpenZeppelinAdapterEntries(resolverOptions),
  });
}

export function createOpenZeppelinAdapterIntegration(
  options: OpenZeppelinAdapterIntegrationOptions
): OpenZeppelinAdapterIntegration {
  const adapterConfigPromise = loadOpenZeppelinAdapterViteConfig(options);

  return {
    async vite(config: UserConfig = {}) {
      return mergeOpenZeppelinAdapterConfig(config, await adapterConfigPromise);
    },
    async vitest(config: UserConfig = {}) {
      if (!options.importMetaUrl) {
        throw new Error(
          'createOpenZeppelinAdapterIntegration(...).vitest() requires importMetaUrl to resolve ' +
            'installed adapter exports'
        );
      }

      const resolverOptions = {
        ecosystems: options.ecosystems,
        importMetaUrl: options.importMetaUrl,
        exportPaths: options.exportPaths,
      };

      return mergeOpenZeppelinAdapterConfig(config, await adapterConfigPromise, {
        extraPlugins: [createOpenZeppelinAdapterResolverPlugin(resolverOptions)],
        extraAliasEntries: resolveInstalledOpenZeppelinAdapterEntries(resolverOptions),
      });
    },
  };
}

export function defineOpenZeppelinAdapterViteConfig(
  options: DefineOpenZeppelinAdapterViteConfigOptions
): Promise<UserConfig> {
  const { config = {}, ...integrationOptions } = options;
  return buildOpenZeppelinAdapterViteConfig(integrationOptions, config);
}

export function defineOpenZeppelinAdapterVitestConfig(
  options: DefineOpenZeppelinAdapterVitestConfigOptions
): Promise<UserConfig> {
  const { config = {}, ...integrationOptions } = options;
  return buildOpenZeppelinAdapterVitestConfig(integrationOptions, config);
}
