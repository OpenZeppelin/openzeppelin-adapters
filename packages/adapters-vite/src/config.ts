import type { PluginOption, UserConfig } from 'vite';

import {
  getAdapterRegistryEntry,
  getOpenZeppelinAdapterPackageNames,
  normalizeEcosystems,
} from './registry';
import type {
  AdapterViteConfigFragment,
  LoadOpenZeppelinAdapterViteConfigOptions,
  OpenZeppelinAdapterEcosystem,
  OpenZeppelinAdapterViteConfig,
} from './types';

type SsrNoExternalValue = NonNullable<NonNullable<UserConfig['ssr']>['noExternal']>;

const RELAYER_COMPAT_ECOSYSTEMS = new Set<OpenZeppelinAdapterEcosystem>(['evm', 'stellar']);
// Temporary Vite workaround until the upstream package exposes proper ESM exports:
// https://github.com/OpenZeppelin/openzeppelin-relayer-sdk/issues/254
const RELAYER_SDK_ESM_ALIAS = '@openzeppelin/relayer-sdk/dist/esm/index.js';

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

function getSharedAliasEntries(
  ecosystems: readonly OpenZeppelinAdapterEcosystem[]
): Record<string, string> {
  if (!ecosystems.some((ecosystem) => RELAYER_COMPAT_ECOSYSTEMS.has(ecosystem))) {
    return {};
  }

  // Remove this alias once relayer-sdk resolves the upstream ESM packaging issue:
  // https://github.com/OpenZeppelin/openzeppelin-relayer-sdk/issues/254
  return {
    '@openzeppelin/relayer-sdk': RELAYER_SDK_ESM_ALIAS,
  };
}

function appendNoExternalValues(
  target: Array<string | RegExp>,
  seenStrings: Set<string>,
  value: SsrNoExternalValue | undefined
): boolean {
  if (!value) {
    return false;
  }

  if (value === true) {
    return true;
  }

  const values = Array.isArray(value) ? value : [value];

  for (const entry of values) {
    if (typeof entry === 'string') {
      if (!seenStrings.has(entry)) {
        seenStrings.add(entry);
        target.push(entry);
      }
      continue;
    }

    if (entry instanceof RegExp) {
      target.push(entry);
    }
  }

  return false;
}

export async function loadOpenZeppelinAdapterViteConfig(
  options: LoadOpenZeppelinAdapterViteConfigOptions
): Promise<OpenZeppelinAdapterViteConfig> {
  const ecosystems = normalizeEcosystems(options.ecosystems);
  const alias = getSharedAliasEntries(ecosystems);
  const plugins: PluginOption[] = [];
  const dedupe = new Set<string>();
  const optimizeDepsInclude = new Set<string>();
  const optimizeDepsExclude = new Set<string>();
  const ssrNoExternal: Array<string | RegExp> = [];
  const seenSsrNoExternalStrings = new Set<string>();
  let ssrNoExternalAll = false;
  const packageNames = getOpenZeppelinAdapterPackageNames(ecosystems);

  for (const packageName of packageNames) {
    optimizeDepsExclude.add(packageName);
    ssrNoExternalAll =
      appendNoExternalValues(ssrNoExternal, seenSsrNoExternalStrings, packageName) ||
      ssrNoExternalAll;
  }

  for (const ecosystem of ecosystems) {
    const entry = getAdapterRegistryEntry(ecosystem);

    let fragment: AdapterViteConfigFragment;
    try {
      fragment = await entry.loadConfig(options);
    } catch (error) {
      throw new Error(
        `Failed to load ${entry.packageName} Vite configuration. ` +
          `Original error: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    appendPlugins(plugins, fragment.plugins);
    appendStringValues(dedupe, fragment.resolve?.dedupe);
    appendStringValues(optimizeDepsInclude, fragment.optimizeDeps?.include);
    appendStringValues(optimizeDepsExclude, fragment.optimizeDeps?.exclude);
    appendStringValues(optimizeDepsExclude, entry.extraOptimizeDepsExclude);

    ssrNoExternalAll =
      appendNoExternalValues(ssrNoExternal, seenSsrNoExternalStrings, fragment.ssr?.noExternal) ||
      ssrNoExternalAll;
  }

  return {
    plugins,
    resolve: {
      alias,
      dedupe: [...dedupe],
    },
    optimizeDeps: {
      include: [...optimizeDepsInclude],
      exclude: [...optimizeDepsExclude],
    },
    ssr: {
      noExternal: ssrNoExternalAll ? true : ssrNoExternal,
    },
    packageNames,
  };
}
