import type { PluginOption } from 'vite';

import {
  getAdapterRegistryEntry,
  getOpenZeppelinAdapterPackageNames,
  normalizeEcosystems,
} from './registry';
import type {
  AdapterViteConfigFragment,
  LoadOpenZeppelinAdapterViteConfigOptions,
  OpenZeppelinAdapterViteConfig,
} from './types';

function appendPlugins(target: PluginOption[], plugins: AdapterViteConfigFragment['plugins']) {
  if (!plugins) {
    return;
  }

  target.push(...(Array.isArray(plugins) ? plugins : [plugins]));
}

function appendStringValues(target: Set<string>, value: string | string[] | undefined) {
  if (!value) {
    return;
  }

  const values = Array.isArray(value) ? value : [value];

  for (const entry of values) {
    if (entry) {
      target.add(entry);
    }
  }
}

export async function loadOpenZeppelinAdapterViteConfig(
  options: LoadOpenZeppelinAdapterViteConfigOptions
): Promise<OpenZeppelinAdapterViteConfig> {
  const ecosystems = normalizeEcosystems(options.ecosystems);
  const plugins: PluginOption[] = [];
  const dedupe = new Set<string>();
  const optimizeDepsInclude = new Set<string>();
  const optimizeDepsExclude = new Set<string>();
  const ssrNoExternal = new Set<string>();
  const packageNames = getOpenZeppelinAdapterPackageNames(ecosystems);

  for (const packageName of packageNames) {
    optimizeDepsExclude.add(packageName);
    ssrNoExternal.add(packageName);
  }

  for (const ecosystem of ecosystems) {
    const entry = getAdapterRegistryEntry(ecosystem);

    let fragment: AdapterViteConfigFragment;
    try {
      fragment = await entry.loadConfig(options);
    } catch (error) {
      throw new Error(
        `Failed to load ${entry.packageName} Vite configuration. Ensure the package is installed and exports ./vite-config. ` +
          `Original error: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    appendPlugins(plugins, fragment.plugins);
    appendStringValues(dedupe, fragment.resolve?.dedupe);
    appendStringValues(optimizeDepsInclude, fragment.optimizeDeps?.include);
    appendStringValues(optimizeDepsExclude, fragment.optimizeDeps?.exclude);
    appendStringValues(optimizeDepsExclude, entry.extraOptimizeDepsExclude);

    const noExternal =
      fragment.ssr?.noExternal === true || fragment.ssr?.noExternal === undefined
        ? undefined
        : fragment.ssr.noExternal;

    if (typeof noExternal === 'string' || Array.isArray(noExternal)) {
      appendStringValues(ssrNoExternal, noExternal);
    }
  }

  return {
    plugins,
    resolve: {
      dedupe: [...dedupe],
    },
    optimizeDeps: {
      include: [...optimizeDepsInclude],
      exclude: [...optimizeDepsExclude],
    },
    ssr: {
      noExternal: [...ssrNoExternal],
    },
    packageNames,
  };
}
