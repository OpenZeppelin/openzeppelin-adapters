import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  collectStaticDependencyGraph,
  findRestrictedDependencies,
} from '../../../../tests/helpers/tierIsolation';
import * as capabilities from '../capabilities';
import { midnightTestnet } from '../networks/testnet';
import { createRuntime } from '../profiles/shared-state';

const packageRoot = process.cwd();
const workspaceRoot = resolve(packageRoot, '../..');
const restrictedPathPatterns = ['wallet/', 'transaction/', 'query/', 'configuration/rpc'];

const tierOneEntries = [
  {
    publicSpecifier: '@openzeppelin/adapter-midnight/addressing',
    sourceFile: resolve(packageRoot, 'src/capabilities/addressing.ts'),
    factoryName: 'createAddressing',
  },
  {
    publicSpecifier: '@openzeppelin/adapter-midnight/explorer',
    sourceFile: resolve(packageRoot, 'src/capabilities/explorer.ts'),
    factoryName: 'createExplorer',
  },
  {
    publicSpecifier: '@openzeppelin/adapter-midnight/network-catalog',
    sourceFile: resolve(packageRoot, 'src/capabilities/network-catalog.ts'),
    factoryName: 'createNetworkCatalog',
  },
  {
    publicSpecifier: '@openzeppelin/adapter-midnight/ui-labels',
    sourceFile: resolve(packageRoot, 'src/capabilities/ui-labels.ts'),
    factoryName: 'createUiLabels',
  },
] as const;

const deferredFactoryCreators = {
  contractLoading: 'createContractLoading',
  schema: 'createSchema',
  typeMapping: 'createTypeMapping',
  query: 'createQuery',
  execution: 'createExecution',
  wallet: 'createWallet',
  uiKit: 'createUiKit',
  relayer: 'createRelayer',
} as const;

function spyOnDeferredFactories() {
  const spies = new Map<string, ReturnType<typeof vi.spyOn>>();

  for (const [key, creatorName] of Object.entries(deferredFactoryCreators)) {
    const spy = vi.spyOn(capabilities, creatorName);
    spies.set(key, spy);
  }

  return {
    spies,
    restore() {
      for (const spy of spies.values()) {
        spy.mockRestore();
      }
    },
  };
}

describe('Midnight Tier 1 isolation', () => {
  it.each(tierOneEntries)(
    'loads $publicSpecifier without Tier 2 or Tier 3 source dependencies',
    async ({ factoryName, publicSpecifier, sourceFile }) => {
      const importedModule = (await import(publicSpecifier)) as Record<string, unknown>;

      expect(importedModule[factoryName]).toEqual(expect.any(Function));

      const graph = collectStaticDependencyGraph({
        entryFile: sourceFile,
      });
      const { offendingFiles } = findRestrictedDependencies(graph, {
        workspaceRoot,
        restrictedPathPatterns,
      });

      expect(offendingFiles).toEqual([]);
    }
  );

  it('creates a declarative runtime without initializing deferred capabilities', () => {
    const trackedFactories = spyOnDeferredFactories();

    try {
      const runtime = createRuntime('declarative', midnightTestnet);

      expect(runtime.networkConfig).toBe(midnightTestnet);
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

      for (const key of Object.keys(deferredFactoryCreators)) {
        expect(trackedFactories.spies.get(key)).not.toHaveBeenCalled();
      }

      runtime.dispose();
    } finally {
      trackedFactories.restore();
    }
  });
});
