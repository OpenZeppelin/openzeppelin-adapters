// @vitest-environment node
/**
 * SF-5 · Published release via `@openzeppelin/adapter-evm` — release-correctness probes.
 *
 * Verifies the 003 terminal release contract (INV-R1, SC-005, V-1–V-7): dual-package changeset,
 * ui-types ^3.3.0 floor, and 003 delta bundled into the npm tarball — not runtime behavior
 * (covered by SF-1–SF-4 suites).
 */
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const ADAPTER_EVM_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ADAPTER_EVM_CORE_ROOT = resolve(ADAPTER_EVM_ROOT, '../adapter-evm-core');
const REPO_ROOT = resolve(ADAPTER_EVM_ROOT, '../..');
const CHANGESET_PATH = resolve(REPO_ROOT, '.changeset/ens-mainnet-l1-opt-in-fallback.md');

const UI_TYPES_FLOOR = '^3.3.0';

/** Design V-1–V-7 markers that must appear in shipped adapter-evm dist JS. */
const BUNDLED_DELTA_MARKERS = [
  { id: 'V-1', pattern: 'enableMainnetL1MissFallback', label: 'SF-1 opt-in seam bundled' },
  { id: 'V-2', pattern: 'mayConsultL1ForMissFallback', label: 'SF-1 gate + SF-3/4 ladder gating' },
  { id: 'V-3', pattern: 'resolvedViaNetworkFallback', label: 'SF-2 triplet discriminant' },
  { id: 'V-4', pattern: 'queriedOnNetworkId', label: 'SF-2 triplet queried network' },
  { id: 'V-5', pattern: 'resolvedOnNetworkId', label: 'SF-2 triplet resolved network' },
  { id: 'V-6', pattern: 'networkFallbackProvenanceFields', label: 'SF-2 provenance builder' },
  { id: 'V-7', pattern: 'ethereum-mainnet', label: 'SF-2 MAINNET_NETWORK_ID literal' },
] as const;

type PackageManifest = {
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function parseChangesetFrontmatter(content: string): Record<string, string> {
  const match = /^---\n([\s\S]*?)\n---/m.exec(content);
  if (!match) {
    throw new Error(
      'INV-R1: changeset frontmatter missing — release-trap guard cannot be verified'
    );
  }
  const entries: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const parsed = /^"([^"]+)":\s*(\S+)\s*$/.exec(line.trim());
    if (parsed) {
      entries[parsed[1]] = parsed[2];
    }
  }
  return entries;
}

function collectBundledJs(distDir: string): string {
  const bundleFiles = readdirSync(distDir).filter(
    (name) => name.endsWith('.mjs') || name.endsWith('.cjs')
  );
  if (bundleFiles.length === 0) {
    throw new Error(`BUNDLED-DELTA: no .mjs/.cjs files under ${distDir}`);
  }
  return bundleFiles.map((name) => readFileSync(join(distDir, name), 'utf8')).join('\n');
}

function assertMarkersPresent(bundle: string, context: string): void {
  for (const { id, pattern, label } of BUNDLED_DELTA_MARKERS) {
    expect(
      bundle.includes(pattern),
      `${id} (${label}): expected "${pattern}" in ${context} — 003 delta not bundled (002 release-trap variant)`
    ).toBe(true);
  }
}

function assertUiTypesFloor(manifest: PackageManifest, packageLabel: string): void {
  for (const slot of ['peerDependencies', 'devDependencies'] as const) {
    const range = manifest[slot]?.['@openzeppelin/ui-types'];
    expect(
      range,
      `FLOOR: ${packageLabel} ${slot} must declare @openzeppelin/ui-types (triplet type fields)`
    ).toBe(UI_TYPES_FLOOR);
  }
}

describe('SF-5 published release correctness', () => {
  // The release-trap guard is a pre-merge check on the pending changeset. On the
  // changeset-release branch `changeset version` has already consumed (deleted) the
  // changeset and applied the version bumps, so the file is absent — skip here (the
  // release is the proof). The floor + bundled-tarball probes below still validate the
  // shipped delta on both feature and release branches.
  describe.skipIf(!existsSync(CHANGESET_PATH))(
    'INV-R1 · RELEASE-TRAP GUARD — dual-package changeset',
    () => {
      it('lists @openzeppelin/adapter-evm with a semver bump (public npm target)', () => {
        const content = readFileSync(CHANGESET_PATH, 'utf8');
        const frontmatter = parseChangesetFrontmatter(content);
        expect(
          frontmatter['@openzeppelin/adapter-evm'],
          'INV-R1: adapter-evm must be bumped — core-only changeset leaves npm consumers on stale 2.2.0 (002 trap)'
        ).toBeTruthy();
      });

      it('lists @openzeppelin/adapter-evm-core with a semver bump (private bundled source)', () => {
        const content = readFileSync(CHANGESET_PATH, 'utf8');
        const frontmatter = parseChangesetFrontmatter(content);
        expect(
          frontmatter['@openzeppelin/adapter-evm-core'],
          'INV-R1: adapter-evm-core must be bumped in lockstep — workspace truth must match bundled bits'
        ).toBeTruthy();
      });

      it('does not ship a core-only changeset (adapter-evm absent)', () => {
        const content = readFileSync(CHANGESET_PATH, 'utf8');
        const frontmatter = parseChangesetFrontmatter(content);
        const publicBump = frontmatter['@openzeppelin/adapter-evm'];
        const coreBump = frontmatter['@openzeppelin/adapter-evm-core'];
        expect(
          publicBump && coreBump,
          `INV-R1: both packages required; got adapter-evm=${publicBump ?? 'MISSING'}, adapter-evm-core=${coreBump ?? 'MISSING'}`
        ).toBeTruthy();
      });
    }
  );

  describe('FLOOR CORRECTNESS — @openzeppelin/ui-types ^3.3.0', () => {
    it('adapter-evm declares ui-types ^3.3.0 in peerDependencies and devDependencies', () => {
      const manifest = readJson<PackageManifest>(resolve(ADAPTER_EVM_ROOT, 'package.json'));
      assertUiTypesFloor(manifest, '@openzeppelin/adapter-evm');
    });

    it('adapter-evm-core declares ui-types ^3.3.0 in peerDependencies and devDependencies', () => {
      const manifest = readJson<PackageManifest>(resolve(ADAPTER_EVM_CORE_ROOT, 'package.json'));
      assertUiTypesFloor(manifest, '@openzeppelin/adapter-evm-core');
    });
  });

  describe('SC-005 · BUNDLED-DELTA in published tarball', () => {
    let tarballDistBundle: string;
    let workspaceDistBundle: string;

    beforeAll(() => {
      execSync('pnpm run build', { cwd: ADAPTER_EVM_ROOT, stdio: 'pipe', encoding: 'utf8' });

      workspaceDistBundle = collectBundledJs(resolve(ADAPTER_EVM_ROOT, 'dist'));

      const extractRoot = mkdtempSync(join(tmpdir(), 'sf5-adapter-evm-pack-'));
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

    it('workspace dist contains V-1–V-7 markers after build', () => {
      assertMarkersPresent(workspaceDistBundle, 'packages/adapter-evm/dist');
    });

    it('npm pack tarball dist contains V-1–V-7 markers (consumer install path)', () => {
      assertMarkersPresent(tarballDistBundle, 'npm pack tarball package/dist');
    });

    it('threads enableMainnetL1MissFallback through createRuntime wiring in tarball', () => {
      expect(
        tarballDistBundle.includes('enableMainnetL1MissFallback'),
        'SC-005: opt-in miss-fallback must be bundled into published JS via createRuntime profile wiring'
      ).toBe(true);
    });

    it('emits cross-network provenance triplet fields in tarball', () => {
      for (const field of [
        'resolvedViaNetworkFallback',
        'queriedOnNetworkId',
        'resolvedOnNetworkId',
      ] as const) {
        expect(
          tarballDistBundle.includes(field),
          `SC-005: provenance triplet field "${field}" must ship in npm tarball dist`
        ).toBe(true);
      }
    });
  });
});
