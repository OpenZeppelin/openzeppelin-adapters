// @vitest-environment node
/**
 * RI capability sub-path isolation (US5/US7, FR-015, FR-020, SC-003).
 *
 * Asserts that the `@openzeppelin/adapter-evm/{erc3643,erc4626,irs}` sub-paths carry no React,
 * Wagmi, RainbowKit, or other browser-only UI modules in their transitive import graph,
 * so the RI plugin can consume them in a plain Node/server context.
 *
 * The check is build-free and deterministic: it statically walks the import graph of the
 * capability source that the sub-path bundles (following relative imports within the
 * `adapter-evm-core` package), plus the thin adapter-evm re-export modules, and fails if
 * any forbidden specifier appears. This validates the substance of the tree-shaken bundle
 * without depending on a prior `pnpm build`.
 *
 * Scope note: bare workspace deps (e.g. `@openzeppelin/adapter-runtime-utils`, `viem`,
 * `@openzeppelin/ui-types`) are treated as leaves and checked against the forbidden set;
 * they are framework-agnostic and already used by the server-side `access-control`
 * capability, so they are not followed further.
 *
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  extractSpecifiers,
  findMatchingSpecifiers,
  FORBIDDEN_UI_PATTERNS,
  RI_CAPABILITY_NAMES,
  riAdapterReexportEntry,
  riCoreCapabilityEntry,
  walkImportGraph,
} from '../../../tests/helpers/riCapabilityGraph';

function assertNoForbidden(specifiers: Iterable<string>, context: string): void {
  const offenders = findMatchingSpecifiers(specifiers, FORBIDDEN_UI_PATTERNS);
  expect(offenders, `${context} pulls forbidden UI modules: ${offenders.join(', ')}`).toEqual([]);
}

describe('RI capability sub-path isolation (no React/Wagmi)', () => {
  for (const name of RI_CAPABILITY_NAMES) {
    it(`${name} capability source graph contains no browser-only UI modules`, () => {
      const entry = riCoreCapabilityEntry(name);
      expect(existsSync(entry)).toBe(true);
      assertNoForbidden(walkImportGraph([entry]).bareSpecifiers, `${name} capability graph`);
    });
  }

  for (const name of RI_CAPABILITY_NAMES) {
    it(`${name} adapter-evm re-export only bridges through @openzeppelin/adapter-evm-core`, () => {
      const entry = riAdapterReexportEntry(name);
      expect(existsSync(entry)).toBe(true);
      const specifiers = extractSpecifiers(readFileSync(entry, 'utf8'));
      assertNoForbidden(specifiers, `${name} re-export`);
      const externalOnly = specifiers.filter((spec) => !spec.startsWith('.'));
      expect(externalOnly).toEqual(externalOnly.map(() => '@openzeppelin/adapter-evm-core'));
    });
  }
});
