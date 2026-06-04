// @vitest-environment node
/**
 * No Relayer-plugin-runtime coupling in the RI write path (US6, FR-011, SC-005).
 *
 * The RI capabilities submit writes through an injected `signAndBroadcast` callback, never by
 * reaching into the RI plugin's in-process Relayer runtime. This guards that decoupling: it
 * statically walks the transitive import graph of the three capability sub-paths (following
 * relative imports inside `adapter-evm-core`) plus the thin `adapter-evm` re-exports, and fails
 * if any source references the plugin-runtime surface (`PluginContext`, `api.sendTransaction`)
 * or imports a relayer-plugin-runtime package.
 *
 * The dependency direction is plugin → adapter (the plugin implements `signAndBroadcast` and
 * passes it in), so the adapter must never import the plugin. `@openzeppelin/relayer-sdk` (the
 * client SDK used by the EVM `ExecutionCapability`) is NOT a plugin runtime and is allowed.
 *
 * Build-free and deterministic — no prior `pnpm build` required.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ADAPTER_EVM_ROOT,
  findMatchingSources,
  findMatchingSpecifiers,
  FORBIDDEN_PLUGIN_RUNTIME_SOURCE,
  FORBIDDEN_PLUGIN_RUNTIME_SPECIFIERS,
  RI_CAPABILITY_NAMES,
  riAdapterReexportEntry,
  riCoreCapabilityEntry,
  walkImportGraph,
} from '../../../tests/helpers/riCapabilityGraph';

const ENTRIES = [
  ...RI_CAPABILITY_NAMES.map(riCoreCapabilityEntry),
  ...RI_CAPABILITY_NAMES.map(riAdapterReexportEntry),
];

describe('RI write path has no Relayer-plugin-runtime dependency (FR-011, SC-005)', () => {
  const { files, bareSpecifiers } = walkImportGraph(ENTRIES);

  it('visits the capability source graph', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('references no plugin-runtime surface (PluginContext / api.sendTransaction)', () => {
    const offenders = findMatchingSources(files, FORBIDDEN_PLUGIN_RUNTIME_SOURCE);
    expect(offenders, `plugin-runtime surface leaked into: ${offenders.join(', ')}`).toEqual([]);
  });

  it('imports no relayer-plugin-runtime package', () => {
    const offenders = findMatchingSpecifiers(bareSpecifiers, FORBIDDEN_PLUGIN_RUNTIME_SPECIFIERS);
    expect(offenders, `forbidden plugin-runtime imports: ${offenders.join(', ')}`).toEqual([]);
  });

  it('declares no relayer-plugin-runtime package in adapter-evm dependencies', () => {
    const pkg = JSON.parse(readFileSync(resolve(ADAPTER_EVM_ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const allDeps = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ];
    const offenders = findMatchingSpecifiers(allDeps, FORBIDDEN_PLUGIN_RUNTIME_SPECIFIERS);
    expect(offenders, `forbidden plugin-runtime deps: ${offenders.join(', ')}`).toEqual([]);
  });
});
