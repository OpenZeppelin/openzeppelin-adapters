// @vitest-environment node
/**
 * RI capability tier-isolation conformance (US7, FR-020, SC-003).
 *
 * Consolidates the FR-020 gate for the three RI sub-paths (`erc3643`, `erc4626`, `irs`):
 * - Sub-path `package.json` exports present in both packages (also enforced by `lint:adapters`)
 * - Thin adapter-evm re-exports bridge only through `@openzeppelin/adapter-evm-core`
 * - Core capability import graphs carry no browser-only UI modules (React/Wagmi/RainbowKit)
 * - Core capability import graphs carry no Relayer-plugin-runtime coupling (FR-011)
 *
 * Complements `tier-isolation.test.ts` (Tier 1 only) and the per-concern tests
 * `ri-capabilities-subpath-isolation.test.ts` / `no-plugin-runtime-dep.test.ts`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ADAPTER_EVM_ROOT,
  CORE_ROOT,
  extractSpecifiers,
  findMatchingSources,
  findMatchingSpecifiers,
  FORBIDDEN_PLUGIN_RUNTIME_SOURCE,
  FORBIDDEN_PLUGIN_RUNTIME_SPECIFIERS,
  FORBIDDEN_UI_PATTERNS,
  RI_CAPABILITY_NAMES,
  riAdapterReexportEntry,
  riCoreCapabilityEntry,
  walkImportGraph,
} from '../../../tests/helpers/riCapabilityGraph';

function readPackageExports(packageRoot: string): Record<string, unknown> {
  const pkg = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as {
    exports?: Record<string, unknown>;
  };
  return pkg.exports ?? {};
}

describe('RI capability tier-isolation conformance (FR-020)', () => {
  const coreExports = readPackageExports(CORE_ROOT);
  const adapterExports = readPackageExports(ADAPTER_EVM_ROOT);

  for (const name of RI_CAPABILITY_NAMES) {
    describe(name, () => {
      const subPath = `./${name}`;

      it(`has sub-path exports in adapter-evm-core and adapter-evm package.json`, () => {
        expect(coreExports[subPath], `missing ${subPath} in adapter-evm-core`).toBeDefined();
        expect(adapterExports[subPath], `missing ${subPath} in adapter-evm`).toBeDefined();
      });

      it('adapter-evm re-export bridges only through @openzeppelin/adapter-evm-core', () => {
        const entry = riAdapterReexportEntry(name);
        expect(existsSync(entry)).toBe(true);

        const specifiers = extractSpecifiers(readFileSync(entry, 'utf8'));
        const externalOnly = specifiers.filter((spec) => !spec.startsWith('.'));
        expect(externalOnly).toEqual(['@openzeppelin/adapter-evm-core']);

        const uiOffenders = findMatchingSpecifiers(specifiers, FORBIDDEN_UI_PATTERNS);
        expect(uiOffenders).toEqual([]);
      });

      it('core capability graph has no browser-only UI imports', () => {
        const entry = riCoreCapabilityEntry(name);
        expect(existsSync(entry)).toBe(true);

        const { bareSpecifiers } = walkImportGraph([entry]);
        const offenders = findMatchingSpecifiers(bareSpecifiers, FORBIDDEN_UI_PATTERNS);
        expect(offenders, `${name} pulls UI modules: ${offenders.join(', ')}`).toEqual([]);
      });

      it('core capability graph has no Relayer-plugin-runtime coupling', () => {
        const entry = riCoreCapabilityEntry(name);
        const { files, bareSpecifiers } = walkImportGraph([entry]);

        const specifierOffenders = findMatchingSpecifiers(
          bareSpecifiers,
          FORBIDDEN_PLUGIN_RUNTIME_SPECIFIERS
        );
        const sourceOffenders = findMatchingSources(files, FORBIDDEN_PLUGIN_RUNTIME_SOURCE);

        expect(specifierOffenders).toEqual([]);
        expect(sourceOffenders).toEqual([]);
      });
    });
  }
});
