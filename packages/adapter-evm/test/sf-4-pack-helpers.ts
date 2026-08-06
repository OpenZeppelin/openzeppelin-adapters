/**
 * SF-4 pack helpers — collect bundled JS and assert WriteCompletion / IRS markers.
 * Sibling to SF-5 harness; does not mutate SF-5 marker set (INV-25).
 */
import { readdirSync, readFileSync } from 'node:fs';
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

/** Concatenate packed/workspace `dist` `.mjs`/`.cjs` (SF-5 `collectBundledJs` shape). */
export function collectBundledJs(distDir: string): string {
  const bundleFiles = readdirSync(distDir).filter(
    (name) => name.endsWith('.mjs') || name.endsWith('.cjs')
  );
  if (bundleFiles.length === 0) {
    throw new Error(`SF-4 pack: no .mjs/.cjs files under ${distDir}`);
  }
  return bundleFiles.map((name) => readFileSync(join(distDir, name), 'utf8')).join('\n');
}

/** Accept single- or double-quote forms for the C-3 branch literal. */
export function markerPresent(bundle: string, pattern: string): boolean {
  if (pattern === "completion === 'submitted'") {
    return (
      bundle.includes("completion === 'submitted'") || bundle.includes('completion === "submitted"')
    );
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
