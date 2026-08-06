/**
 * SF-4 pack helpers — collect bundled JS and assert WriteCompletion / IRS markers.
 * Sibling to SF-5 harness; does not mutate SF-5 marker set (INV-25).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from 'vitest';

/** Design C-1..C-4 markers that must appear in shipped adapter-evm dist JS (INV-24). */
export const COMPLETION_PACK_MARKERS = [
  {
    id: 'C-1',
    pattern: 'resolveWriteCompletion',
    label: 'SF-1 choke shipped',
  },
  {
    id: 'C-2',
    pattern: 'WriteCompletionDisagreementError',
    label: 'Fail-closed disagreement shipped',
  },
  {
    id: 'C-3',
    // Source uses single quotes; bundlers may emit either form (Design: "or equivalent").
    pattern: "completion === 'submitted'",
    label: 'SF-2/SF-3 branch literal shipped',
  },
  {
    id: 'C-4',
    pattern: 'submit-only early return',
    label: 'Deploy submit-only branch shipped',
  },
] as const;

export type PackDryRunEntry = {
  path: string;
  size?: number;
  mode?: number;
};

export type PackDryRunResult = {
  id?: string;
  name?: string;
  version?: string;
  files?: PackDryRunEntry[];
};

/**
 * Fail loudly when the workspace `dist/` this suite reads is absent.
 *
 * Pack suites MUST consume the `dist/` produced by the build that runs before the test step
 * (`ci.yml`, `publish.yml`), and must never invoke `pnpm run build` themselves. `tsdown` cleans
 * `dist/` before emitting, so a mid-suite rebuild races every other file in the shared vitest
 * run — notably `ri-capabilities-dist-isolation.test.ts`, which asserts those same
 * `dist/<capability>.mjs` entries and sees them vanish.
 *
 * Same contract and failure class as that suite: a missing `dist/` fails loudly rather than
 * skipping, because a guard that can silently no-op is the hole these suites exist to close.
 */
export function assertWorkspaceDistPresent(distDir: string, context: string): void {
  expect(
    existsSync(distDir),
    `${distDir} is missing — run \`pnpm build\` before this suite (CI builds first). ` +
      `${context} must consume the pre-built workspace dist; it must not rebuild during the ` +
      `shared vitest run (that wipes dist for concurrent suites).`
  ).toBe(true);
}

/** Concatenate packed/workspace `dist` `.mjs`/`.cjs` (SF-5 `collectBundledJs` shape). */
export function collectBundledJs(distDir: string): string {
  if (!existsSync(distDir)) {
    throw new Error(
      `SF-4 pack: ${distDir} is missing — run \`pnpm build\` before this suite (CI builds first).`
    );
  }
  const bundleFiles = readdirSync(distDir).filter(
    (name) => name.endsWith('.mjs') || name.endsWith('.cjs')
  );
  if (bundleFiles.length === 0) {
    throw new Error(`SF-4 pack: no .mjs/.cjs files under ${distDir}`);
  }
  return bundleFiles.map((name) => readFileSync(join(distDir, name), 'utf8')).join('\n');
}

/**
 * C-3 branch literal, tolerant of formatting but still pinned to the real comparison.
 *
 * A plain `includes` of `completion === 'submitted'` is brittle: bundlers and minifiers legally
 * rewrite quote style, collapse or insert whitespace around `===`, and rename the local holding
 * the value. Matching the exact source spelling would report the branch as missing on a
 * cosmetically different but behaviourally identical bundle.
 *
 * So: allow any whitespace (including none) around `===`, either quote style, and an optional
 * property access before `completion` (`x.completion`, `meta.completion`). Deliberately still
 * requires both the `completion` identifier and the `submitted` string literal in one comparison
 * — a bundle that dropped the branch cannot satisfy that, which is what C-5 non-vacuity checks.
 */
const C3_BRANCH_LITERAL = /(?:\.\s*)?\bcompletion\b\s*===\s*(['"`])submitted\1/;

/** Accept formatting variants for the C-3 branch literal; exact match otherwise. */
export function markerPresent(bundle: string, pattern: string): boolean {
  if (pattern === "completion === 'submitted'") {
    return C3_BRANCH_LITERAL.test(bundle);
  }
  return bundle.includes(pattern);
}

/** INV-24 / C-1..C-4 — assert completion surface markers in a JS bundle. */
export function assertCompletionMarkersPresent(bundle: string, context: string): void {
  for (const { id, pattern, label } of COMPLETION_PACK_MARKERS) {
    expect(
      markerPresent(bundle, pattern),
      `${id} (${label}): expected "${pattern}" (or equivalent) in ${context} — published-2.5.0 empty-completion class`
    ).toBe(true);
  }
}

/**
 * INV-23 — dry-run inventory must include at least one `dist/*.mjs` or `dist/*.cjs`
 * that would ship (files present; content gate is separate).
 */
export function assertDryRunDistInventory(pack: PackDryRunResult, context: string): void {
  const files = pack.files ?? [];
  const distJs = files.filter(
    (f) => f.path.startsWith('dist/') && (f.path.endsWith('.mjs') || f.path.endsWith('.cjs'))
  );
  expect(
    distJs.length,
    `${context}: npm pack --dry-run inventory must list dist .mjs/.cjs (would-publish set)`
  ).toBeGreaterThan(0);
}

/** C-5 NON-VACUITY: synthetic bundle lacking markers must fail the assert helper. */
export function expectMarkersAbsentOnSyntheticEmpty(synthetic: string): void {
  expect(() => assertCompletionMarkersPresent(synthetic, 'synthetic-empty-bundle')).toThrow();
}
