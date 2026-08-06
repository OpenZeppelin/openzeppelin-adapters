// @vitest-environment node
/**
 * SF-4 · Built-package proof for IRS write-completion surface (SC-005 / INV-23..25).
 *
 * Verifies dry-run inventory + packed tarball `dist/` content markers + workspace
 * `dist/` parity. Never greps `src/` or packed `package/src/` (INV-23).
 * Sibling to SF-5 ENS release suite — does not extend SF-5 markers (INV-25).
 * Does not publish (INV-20).
 */
import { execFileSync, execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  assertCompletionMarkersPresent,
  assertDryRunDistInventory,
  collectBundledJs,
  COMPLETION_PACK_MARKERS,
  expectMarkersAbsentOnSyntheticEmpty,
  markerPresent,
  type PackDryRunResult,
} from './sf-4-pack-helpers.js';

const ADAPTER_EVM_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('SF-4 write-completion pack surface', () => {
  let tarballDistBundle: string;
  let workspaceDistBundle: string;
  let dryRunPack: PackDryRunResult;

  beforeAll(() => {
    execSync('pnpm run build', { cwd: ADAPTER_EVM_ROOT, stdio: 'pipe', encoding: 'utf8' });

    workspaceDistBundle = collectBundledJs(resolve(ADAPTER_EVM_ROOT, 'dist'));

    const dryRunRaw = execSync('npm pack --dry-run --json', {
      cwd: ADAPTER_EVM_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const dryRunParsed = JSON.parse(dryRunRaw) as PackDryRunResult | PackDryRunResult[];
    dryRunPack = Array.isArray(dryRunParsed) ? (dryRunParsed[0] ?? {}) : dryRunParsed;

    const extractRoot = mkdtempSync(join(tmpdir(), 'sf4-adapter-evm-pack-'));
    let tarballPath = '';
    try {
      const tarballName = execSync('npm pack --silent', {
        cwd: ADAPTER_EVM_ROOT,
        encoding: 'utf8',
      }).trim();
      tarballPath = resolve(ADAPTER_EVM_ROOT, tarballName);
      execFileSync('tar', ['-xzf', tarballPath], { cwd: extractRoot, stdio: 'pipe' });
      tarballDistBundle = collectBundledJs(join(extractRoot, 'package', 'dist'));
    } finally {
      rmSync(extractRoot, { recursive: true, force: true });
      if (tarballPath) {
        rmSync(tarballPath, { force: true });
      }
    }
  }, 120_000);

  it('INV-23: npm pack --dry-run --json inventory includes dist JS chunks', () => {
    assertDryRunDistInventory(dryRunPack, 'adapter-evm dry-run');
  });

  it('INV-23 / INV-24: packed package/dist contains WriteCompletion / IRS branch markers', () => {
    assertCompletionMarkersPresent(tarballDistBundle, 'npm pack tarball package/dist');
  });

  it('INV-23: workspace dist matches packed dist marker presence (build-without-pack drift)', () => {
    assertCompletionMarkersPresent(workspaceDistBundle, 'packages/adapter-evm/dist');
    for (const { pattern } of COMPLETION_PACK_MARKERS) {
      expect(
        markerPresent(workspaceDistBundle, pattern),
        `workspace dist must contain "${pattern}" (or equivalent) whenever packed dist does`
      ).toBe(markerPresent(tarballDistBundle, pattern));
    }
  });

  it('INV-23: SC-005 never greps src — pack inventory may list src but content gate is dist-only', () => {
    const srcEntries = (dryRunPack.files ?? []).filter((f) => f.path.startsWith('src/'));
    // Package currently ships src in `files`; that must not become the content gate.
    if (srcEntries.length > 0) {
      expect(
        markerPresent(tarballDistBundle, 'resolveWriteCompletion') ||
          markerPresent(workspaceDistBundle, 'resolveWriteCompletion'),
        'markers must be proven in dist JS even when src is also packed'
      ).toBe(true);
    }
    expect(
      COMPLETION_PACK_MARKERS.every((m) => markerPresent(tarballDistBundle, m.pattern)),
      'content assertions target tarball dist only'
    ).toBe(true);
  });

  it('INV-25: SF-4 pack suite is sibling to SF-5 — does not import ENS marker modules', () => {
    // Structural isolation: this file must not pull SF-5 ENS release contract helpers.
    // (Shared collectBundledJs-style helpers are allowed via sf-4-pack-helpers only.)
    const source = readFileSync(fileURLToPath(import.meta.url), 'utf8');
    const ensSuiteStem = 'sf-5' + '-published-release';
    expect(source).not.toMatch(new RegExp(`from\\s+['"][^'"]*${ensSuiteStem}`));
    expect(source).not.toMatch(/from\s+['"][^'"]*ENS_PACK_MARKERS/);
    expect(source).not.toMatch(/from\s+['"][^'"]*assertEnsMarkers/);
  });

  it('C-5 NON-VACUITY: synthetic bundle lacking markers fails assertCompletionMarkersPresent', () => {
    expectMarkersAbsentOnSyntheticEmpty('// empty published-2.5.0-class bundle');
  });
});
