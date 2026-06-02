// @vitest-environment node
/**
 * RI capability sub-path isolation (US5, FR-015, SC-003).
 *
 * Asserts that the `@openzeppelin/adapter-evm/{erc3643,irs}` sub-paths carry no React,
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
 * NOTE: erc4626 is intentionally absent — its factory ships in US4 (Phase 7); its sub-path
 * isolation assertion is added alongside it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const ADAPTER_EVM_ROOT = resolve(HERE, '..');
const CORE_ROOT = resolve(ADAPTER_EVM_ROOT, '../adapter-evm-core');

/** Browser-only / UI specifiers that must never appear in a server-side capability graph. */
const FORBIDDEN_PATTERNS: RegExp[] = [
  /^react$/,
  /^react\//,
  /^react-dom(\/|$)/,
  /^wagmi(\/|$)/,
  /^@wagmi\//,
  /^@rainbow-me\//,
  /^@tanstack\/react-query(\/|$)/,
  /^@openzeppelin\/ui-react(\/|$)/,
  /^@openzeppelin\/ui-components(\/|$)/,
  /^lucide-react(\/|$)/,
  /^@web3icons\//,
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

/**
 * Walk the import graph from `entryFiles`, following only relative imports. Returns every
 * bare (non-relative) specifier encountered anywhere in the transitive graph.
 */
function collectBareSpecifiers(entryFiles: string[]): Set<string> {
  const bare = new Set<string>();
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
        bare.add(spec);
      }
    }
  }

  return bare;
}

function assertNoForbidden(specifiers: Iterable<string>, context: string): void {
  const offenders = [...specifiers].filter((spec) =>
    FORBIDDEN_PATTERNS.some((pattern) => pattern.test(spec))
  );
  expect(offenders, `${context} pulls forbidden UI modules: ${offenders.join(', ')}`).toEqual([]);
}

const CAPABILITY_ENTRIES = {
  erc3643: resolve(CORE_ROOT, 'src/capabilities/erc3643.ts'),
  irs: resolve(CORE_ROOT, 'src/capabilities/irs.ts'),
} as const;

const REEXPORT_ENTRIES = {
  erc3643: resolve(ADAPTER_EVM_ROOT, 'src/capabilities/erc3643.ts'),
  irs: resolve(ADAPTER_EVM_ROOT, 'src/capabilities/irs.ts'),
} as const;

describe('RI capability sub-path isolation (no React/Wagmi)', () => {
  for (const [name, entry] of Object.entries(CAPABILITY_ENTRIES)) {
    it(`${name} capability source graph contains no browser-only UI modules`, () => {
      expect(existsSync(entry)).toBe(true);
      assertNoForbidden(collectBareSpecifiers([entry]), `${name} capability graph`);
    });
  }

  for (const [name, entry] of Object.entries(REEXPORT_ENTRIES)) {
    it(`${name} adapter-evm re-export only bridges through @openzeppelin/adapter-evm-core`, () => {
      expect(existsSync(entry)).toBe(true);
      const specifiers = extractSpecifiers(readFileSync(entry, 'utf8'));
      assertNoForbidden(specifiers, `${name} re-export`);
      const externalOnly = specifiers.filter((spec) => !spec.startsWith('.'));
      expect(externalOnly).toEqual(externalOnly.map(() => '@openzeppelin/adapter-evm-core'));
    });
  }
});
