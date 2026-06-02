/**
 * Shared static import-graph utilities for RI capability conformance tests (FR-015, FR-020).
 *
 * Build-free traversal of capability source trees: follows relative imports within
 * `adapter-evm-core`, collects bare specifiers, and supports forbidden-pattern checks.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const ADAPTER_EVM_ROOT = resolve(REPO_ROOT, 'packages/adapter-evm');
export const CORE_ROOT = resolve(REPO_ROOT, 'packages/adapter-evm-core');

/** Browser-only / UI specifiers forbidden in server-side RI capability graphs. */
export const FORBIDDEN_UI_PATTERNS: RegExp[] = [
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

/** Plugin-runtime package specifiers forbidden in RI capability graphs (FR-011). */
export const FORBIDDEN_PLUGIN_RUNTIME_SPECIFIERS: RegExp[] = [
  /relayer.*plugin/i,
  /plugin.*runtime/i,
  /ri-tokenized-deposits/i,
];

/** Plugin-runtime API surface that must appear only as imports/calls, not in RI adapter code (FR-011). */
export const FORBIDDEN_PLUGIN_RUNTIME_SOURCE: RegExp[] = [
  /\bPluginContext\b/,
  /api\.sendTransaction\s*\(/,
];

const SPECIFIER_REGEX =
  /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|(?:^|;|\n)\s*import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

export function extractSpecifiers(source: string): string[] {
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

/** Walk relative imports from `entryFiles`; return visited source files and bare specifiers. */
export function walkImportGraph(entryFiles: string[]): {
  files: string[];
  bareSpecifiers: Set<string>;
} {
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

export function findMatchingSpecifiers(specifiers: Iterable<string>, patterns: RegExp[]): string[] {
  return [...specifiers].filter((spec) => patterns.some((pattern) => pattern.test(spec)));
}

export function findMatchingSources(files: string[], patterns: RegExp[]): string[] {
  const offenders: string[] = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    if (patterns.some((pattern) => pattern.test(source))) {
      offenders.push(file);
    }
  }
  return offenders;
}

export const RI_CAPABILITY_NAMES = ['erc3643', 'erc4626', 'irs'] as const;

export function riCoreCapabilityEntry(name: (typeof RI_CAPABILITY_NAMES)[number]): string {
  return resolve(CORE_ROOT, `src/capabilities/${name}.ts`);
}

export function riAdapterReexportEntry(name: (typeof RI_CAPABILITY_NAMES)[number]): string {
  return resolve(ADAPTER_EVM_ROOT, `src/capabilities/${name}.ts`);
}
