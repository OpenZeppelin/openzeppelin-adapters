'use strict';

/**
 * Ensure every RC version produced by `changeset version` is unique on npm.
 *
 * Problem: publish-rc.yml runs on a fresh checkout every time, so
 * `changeset pre enter rc` + `changeset version` always starts from the
 * versions in package.json on main and produces the same X.Y.Z-rc.0.
 *
 * This script runs AFTER `changeset version` and BEFORE `changeset publish`.
 * For each non-private package whose computed RC version already exists on
 * npm, it queries the current `rc` dist-tag and bumps the pre-release number
 * to the next available slot (e.g. 2.0.0-rc.0 → 2.0.0-rc.1).
 *
 * Usage:  node scripts/bump-rc-if-published.cjs
 */

const { execSync } = require('child_process');
const { readFileSync, writeFileSync, readdirSync, statSync } = require('fs');
const { join } = require('path');

const PACKAGES_DIR = join(__dirname, '..', 'packages');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPackageDirs() {
  return readdirSync(PACKAGES_DIR)
    .map((name) => join(PACKAGES_DIR, name))
    .filter((dir) => {
      try {
        return statSync(join(dir, 'package.json')).isFile();
      } catch {
        return false;
      }
    });
}

function readPkg(dir) {
  return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'));
}

function writePkg(dir, data) {
  writeFileSync(join(dir, 'package.json'), JSON.stringify(data, null, 2) + '\n');
}

/**
 * Parse an RC pre-release version string.
 * @param {string} version  e.g. "2.0.0-rc.3"
 * @returns {{ base: string, num: number } | null}
 */
function parseRc(version) {
  const m = version.match(/^(.+)-rc\.(\d+)$/);
  return m ? { base: m[1], num: Number(m[2]) } : null;
}

/**
 * Check whether an exact version exists on the npm registry.
 * @param {string} name  package name
 * @param {string} version  exact version
 * @returns {boolean}
 */
function npmVersionExists(name, version) {
  try {
    const out = execSync(`npm view "${name}@${version}" version`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return out === version;
  } catch {
    return false;
  }
}

/**
 * Get the version that a dist-tag points to on npm.
 * @param {string} name  package name
 * @param {string} tag   e.g. "rc"
 * @returns {string | null}
 */
function npmTagVersion(name, tag) {
  try {
    return (
      execSync(`npm view "${name}@${tag}" version`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim() || null
    );
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const dirs = getPackageDirs();

  /** @type {Array<{ dir: string, name: string, from: string, to: string }>} */
  const bumps = [];

  for (const dir of dirs) {
    const pkg = readPkg(dir);
    if (pkg.private) continue;

    const rc = parseRc(pkg.version);
    if (!rc) continue;

    if (!npmVersionExists(pkg.name, pkg.version)) continue;

    const currentRcVersion = npmTagVersion(pkg.name, 'rc');
    if (!currentRcVersion) {
      console.warn(`⚠️  ${pkg.name}@${pkg.version} exists on npm but has no rc dist-tag`);
      continue;
    }

    const currentRc = parseRc(currentRcVersion);
    if (!currentRc) continue;

    if (currentRc.base !== rc.base) {
      // Different base version means a new RC sequence; rc.0 is fine.
      continue;
    }

    const nextNum = currentRc.num + 1;
    const newVersion = `${rc.base}-rc.${nextNum}`;

    bumps.push({ dir, name: pkg.name, from: pkg.version, to: newVersion });
  }

  if (bumps.length === 0) {
    console.log('✅ All RC versions are unique — no bumps needed.');
    return;
  }

  console.log('\n📦 Bumping RC pre-release numbers:\n');
  for (const { dir, name, from, to } of bumps) {
    console.log(`  ${name}: ${from} → ${to}`);
    const pkg = readPkg(dir);
    pkg.version = to;
    writePkg(dir, pkg);
  }
  console.log(`\n✅ Bumped ${bumps.length} package(s).\n`);
}

main();
