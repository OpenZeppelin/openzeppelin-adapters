import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  collectStaticDependencyGraph,
  findRestrictedDependencies,
} from '../../../../tests/helpers/tierIsolation';
import { ethereumSepolia } from '../networks';
import { capabilityFactories, createRuntime } from '../profiles/shared';

const packageRoot = process.cwd();
const workspaceRoot = resolve(packageRoot, '../..');
const restrictedPathPatterns = [
  'wallet/',
  'transaction/',
  'access-control/',
  'query/',
  'proxy/',
  'abi/',
  'contract/',
  'mapping/',
  'transform/',
  'configuration/rpc',
];
const restrictedExternalSpecifiers = ['@openzeppelin/adapter-evm-core'];
const coreTierOneEntryMap = {
  '@openzeppelin/adapter-evm-core/addressing': resolve(
    packageRoot,
    '../adapter-evm-core/src/capabilities/addressing.ts'
  ),
  '@openzeppelin/adapter-evm-core/explorer': resolve(
    packageRoot,
    '../adapter-evm-core/src/capabilities/explorer.ts'
  ),
  '@openzeppelin/adapter-evm-core/network-catalog': resolve(
    packageRoot,
    '../adapter-evm-core/src/capabilities/network-catalog.ts'
  ),
  '@openzeppelin/adapter-evm-core/ui-labels': resolve(
    packageRoot,
    '../adapter-evm-core/src/capabilities/ui-labels.ts'
  ),
};
const tierOneEntries = [
  {
    publicSpecifier: '@openzeppelin/adapter-evm/addressing',
    sourceFile: resolve(packageRoot, 'src/capabilities/addressing.ts'),
    factoryName: 'createAddressing',
  },
  {
    publicSpecifier: '@openzeppelin/adapter-evm/explorer',
    sourceFile: resolve(packageRoot, 'src/capabilities/explorer.ts'),
    factoryName: 'createExplorer',
  },
  {
    publicSpecifier: '@openzeppelin/adapter-evm/network-catalog',
    sourceFile: resolve(packageRoot, 'src/capabilities/network-catalog.ts'),
    factoryName: 'createNetworkCatalog',
  },
  {
    publicSpecifier: '@openzeppelin/adapter-evm/ui-labels',
    sourceFile: resolve(packageRoot, 'src/capabilities/ui-labels.ts'),
    factoryName: 'createUiLabels',
  },
] as const;

const deferredFactoryKeys = [
  'contractLoading',
  'schema',
  'typeMapping',
  'query',
  'execution',
  'wallet',
  'uiKit',
  'relayer',
  'accessControl',
] as const;

function spyOnDeferredFactories() {
  const mutableFactories = capabilityFactories as Record<string, (...args: unknown[]) => unknown>;
  const originals = new Map<string, (...args: unknown[]) => unknown>();
  const spies = new Map<string, ReturnType<typeof vi.fn>>();

  for (const key of deferredFactoryKeys) {
    const original = mutableFactories[key];
    originals.set(key, original);

    const spy = vi.fn((...args: unknown[]) => original(...args));
    spies.set(key, spy);
    mutableFactories[key] = spy;
  }

  return {
    spies,
    restore() {
      for (const [key, original] of originals) {
        mutableFactories[key] = original;
      }
    },
  };
}

describe('EVM Tier 1 isolation', () => {
  it.each(tierOneEntries)(
    'loads $publicSpecifier without Tier 2 or Tier 3 source dependencies',
    async ({ factoryName, publicSpecifier, sourceFile }) => {
      const importedModule = (await import(publicSpecifier)) as Record<string, unknown>;

      expect(importedModule[factoryName]).toEqual(expect.any(Function));

      const graph = collectStaticDependencyGraph({
        entryFile: sourceFile,
        externalEntryMap: coreTierOneEntryMap,
      });
      const { offendingExternalSpecifiers, offendingFiles } = findRestrictedDependencies(graph, {
        workspaceRoot,
        restrictedPathPatterns,
        restrictedExternalSpecifiers,
      });

      expect(offendingExternalSpecifiers).toEqual([]);
      expect(offendingFiles).toEqual([]);
    }
  );

  it('creates a declarative runtime without initializing deferred capabilities', () => {
    const trackedFactories = spyOnDeferredFactories();

    try {
      const runtime = createRuntime('declarative', ethereumSepolia);

      expect(runtime.networkConfig).toBe(ethereumSepolia);
      expect(runtime.addressing).toBeDefined();
      expect(runtime.explorer).toBeDefined();
      expect(runtime.networkCatalog).toBeDefined();
      expect(runtime.uiLabels).toBeDefined();
      expect(runtime.contractLoading).toBeUndefined();
      expect(runtime.schema).toBeUndefined();
      expect(runtime.typeMapping).toBeUndefined();
      expect(runtime.query).toBeUndefined();
      expect(runtime.execution).toBeUndefined();
      expect(runtime.wallet).toBeUndefined();
      expect(runtime.uiKit).toBeUndefined();
      expect(runtime.relayer).toBeUndefined();
      expect(runtime.accessControl).toBeUndefined();

      for (const key of deferredFactoryKeys) {
        expect(trackedFactories.spies.get(key)).not.toHaveBeenCalled();
      }

      runtime.dispose();
    } finally {
      trackedFactories.restore();
    }
  });
});
