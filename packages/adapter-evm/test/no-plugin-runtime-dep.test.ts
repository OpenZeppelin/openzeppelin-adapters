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
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const ADAPTER_EVM_ROOT = resolve(HERE, '..');
const CORE_ROOT = resolve(ADAPTER_EVM_ROOT, '../adapter-evm-core');

/** Plugin-runtime surface that the injected-callback contract exists to keep out of the adapter. */
const FORBIDDEN_IDENTIFIERS: RegExp[] = [/\bPluginContext\b/, /\bapi\.sendTransaction\b/];

/** Bare specifiers that would indicate a relayer-plugin-runtime dependency (SDK is allowed). */
const FORBIDDEN_SPECIFIER_PATTERNS: RegExp[] = [
  /relayer.*plugin/i,
  /plugin.*runtime/i,
  /ri-tokenized-deposits/i,
];

const SPECIFIER_REGEX =
  /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|(?:^|;|\n)\s*import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

function extractSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = SPECIFIER_REGEX.exec(source)) !== null) {
    const spec = match[1] ?? match[2] ?? match[3];
    if (spec) specifiers.push(spec);
  }
  return specifiers;
}

function resolveRelative(fromFile: string, spec: string): string | null {
  const base = resolve(dirname(fromFile), spec);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, resolve(base, 'index.ts')];
  return candidates.find((candidate) => existsSync(candidate) && candidate.endsWith('.ts')) ?? null;
}

/** Walk the import graph from `entryFiles`, following relative imports; return visited files + bare specs. */
function walkGraph(entryFiles: string[]): { files: string[]; bareSpecifiers: Set<string> } {
  const bareSpecifiers = new Set<string>();
  const visited = new Set<string>();
  const queue = [...entryFiles];

  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (visited.has(file) || !existsSync(file)) continue;
    visited.add(file);

    for (const spec of extractSpecifiers(readFileSync(file, 'utf8'))) {
      if (spec.startsWith('.')) {
        const resolved = resolveRelative(file, spec);
        if (resolved) queue.push(resolved);
      } else {
        bareSpecifiers.add(spec);
      }
    }
  }

  return { files: [...visited], bareSpecifiers };
}

const ENTRIES = [
  resolve(CORE_ROOT, 'src/capabilities/erc3643.ts'),
  resolve(CORE_ROOT, 'src/capabilities/erc4626.ts'),
  resolve(CORE_ROOT, 'src/capabilities/irs.ts'),
  resolve(ADAPTER_EVM_ROOT, 'src/capabilities/erc3643.ts'),
  resolve(ADAPTER_EVM_ROOT, 'src/capabilities/erc4626.ts'),
  resolve(ADAPTER_EVM_ROOT, 'src/capabilities/irs.ts'),
];

describe('RI write path has no Relayer-plugin-runtime dependency (FR-011, SC-005)', () => {
  const { files, bareSpecifiers } = walkGraph(ENTRIES);

  it('visits the capability source graph', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('references no plugin-runtime surface (PluginContext / api.sendTransaction)', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of FORBIDDEN_IDENTIFIERS) {
        if (pattern.test(source)) offenders.push(`${file} :: ${pattern}`);
      }
    }
    expect(offenders, `plugin-runtime surface leaked into: ${offenders.join(', ')}`).toEqual([]);
  });

  it('imports no relayer-plugin-runtime package', () => {
    const offenders = [...bareSpecifiers].filter((spec) =>
      FORBIDDEN_SPECIFIER_PATTERNS.some((pattern) => pattern.test(spec))
    );
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
    const offenders = allDeps.filter((name) =>
      FORBIDDEN_SPECIFIER_PATTERNS.some((pattern) => pattern.test(name))
    );
    expect(offenders, `forbidden plugin-runtime deps: ${offenders.join(', ')}`).toEqual([]);
  });
});
