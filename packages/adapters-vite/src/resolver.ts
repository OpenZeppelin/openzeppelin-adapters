import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { Plugin } from 'vite';

import {
  getOpenZeppelinAdapterImportSpecifier,
  getOpenZeppelinAdapterPackageNames,
} from './registry';
import type {
  OpenZeppelinAdapterExportPath,
  ResolveInstalledOpenZeppelinAdapterEntriesOptions,
} from './types';

type PackageExportEntry =
  | string
  | {
      import?: string | { default?: string };
      default?: string;
    };

function readPackageJson(packageDirectory: string): {
  exports?: Record<string, PackageExportEntry>;
} {
  return JSON.parse(fs.readFileSync(path.join(packageDirectory, 'package.json'), 'utf8')) as {
    exports?: Record<string, PackageExportEntry>;
  };
}

function getImportTarget(entry: PackageExportEntry | undefined): string | null {
  if (!entry) {
    return null;
  }

  if (typeof entry === 'string') {
    return entry;
  }

  if (typeof entry.import === 'string') {
    return entry.import;
  }

  if (
    entry.import &&
    typeof entry.import === 'object' &&
    typeof entry.import.default === 'string'
  ) {
    return entry.import.default;
  }

  if (typeof entry.default === 'string') {
    return entry.default;
  }

  return null;
}

function resolveInstalledPackageDirectory(packageName: string, importMetaUrl: string): string {
  const require = createRequire(importMetaUrl);
  const installedEntryPath = require.resolve(packageName);
  return path.resolve(path.dirname(installedEntryPath), '..');
}

function resolveInstalledExportEntry(
  packageName: string,
  packageDirectory: string,
  exportPath: OpenZeppelinAdapterExportPath
): string {
  const packageJson = readPackageJson(packageDirectory);
  const target = getImportTarget(packageJson.exports?.[exportPath]);

  if (!target) {
    throw new Error(`Missing import export "${exportPath}" in ${packageName}/package.json`);
  }

  return path.resolve(packageDirectory, target);
}

export function resolveInstalledOpenZeppelinAdapterEntries(
  options: ResolveInstalledOpenZeppelinAdapterEntriesOptions
): Record<string, string> {
  const exportPaths = options.exportPaths ?? ['.', './metadata', './networks'];
  const entries: Record<string, string> = {};

  for (const packageName of getOpenZeppelinAdapterPackageNames(options.ecosystems)) {
    const packageDirectory = resolveInstalledPackageDirectory(packageName, options.importMetaUrl);

    for (const exportPath of exportPaths) {
      entries[getOpenZeppelinAdapterImportSpecifier(packageName, exportPath)] =
        resolveInstalledExportEntry(packageName, packageDirectory, exportPath);
    }
  }

  return entries;
}

export function createOpenZeppelinAdapterResolverPlugin(
  options: ResolveInstalledOpenZeppelinAdapterEntriesOptions
): Plugin {
  const entries = resolveInstalledOpenZeppelinAdapterEntries(options);

  return {
    name: 'openzeppelin-adapter-package-resolver',
    enforce: 'pre',
    resolveId(id) {
      return entries[id] ?? null;
    },
  };
}
