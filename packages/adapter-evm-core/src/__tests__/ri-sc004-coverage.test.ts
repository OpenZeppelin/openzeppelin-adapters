/**
 * SC-004 mocked-behavior coverage audit for the three RI capabilities (US7).
 *
 * Asserts that every read/write method enumerated in spec.md §SC-004 appears in at least
 * one behavioral test file (factory tests alone do not satisfy SC-004). This is a static
 * regression guard — the tests themselves must still pass (`pnpm test`).
 *
 * Method inventory (SC-004):
 * - ERC-3643: balanceOf, isVerified, isFrozen, getJurisdiction, simulateTransfer;
 *   mint, burn, transfer, freeze, unfreeze
 * - ERC-4626: convertToAssets, convertToShares, totalAssets; deposit, withdraw
 * - IRS: getOnchainId, isVerified, getJurisdiction;
 *   deployOnchainId, registerTrustedIssuer, attachClaim, registerIdentity
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = resolve(HERE, '../..');

interface CapabilityCoverage {
  reads: readonly string[];
  writes: readonly string[];
  /** Relative to adapter-evm-core package root — behavioral test dirs only (excludes *.factory.test.ts). */
  testDirs: readonly string[];
}

const SC004_COVERAGE: Record<string, CapabilityCoverage> = {
  erc3643: {
    reads: ['balanceOf', 'isVerified', 'isFrozen', 'getJurisdiction', 'simulateTransfer'],
    writes: ['mint', 'burn', 'transfer', 'freeze', 'unfreeze'],
    testDirs: ['src/erc3643/__tests__'],
  },
  erc4626: {
    reads: ['convertToAssets', 'convertToShares', 'totalAssets'],
    writes: ['deposit', 'withdraw'],
    testDirs: ['src/erc4626/__tests__'],
  },
  irs: {
    reads: ['getOnchainId', 'isVerified', 'getJurisdiction'],
    writes: ['deployOnchainId', 'registerTrustedIssuer', 'attachClaim', 'registerIdentity'],
    testDirs: ['src/irs/__tests__'],
  },
};

function collectBehavioralTestSources(testDirs: readonly string[]): string {
  const chunks: string[] = [];

  for (const dir of testDirs) {
    const absDir = resolve(CORE_ROOT, dir);
    expect(existsSync(absDir), `missing test dir ${dir}`).toBe(true);

    for (const file of readdirSync(absDir)) {
      if (!file.endsWith('.test.ts') || file.includes('.factory.')) continue;
      chunks.push(readFileSync(resolve(absDir, file), 'utf8'));
    }
  }

  return chunks.join('\n');
}

function assertMethodCovered(sources: string, method: string, capability: string, kind: string) {
  const pattern = new RegExp(`\\b${method}\\b`);
  expect(
    pattern.test(sources),
    `SC-004: ${capability} ${kind} "${method}" has no mocked-behavior test reference`
  ).toBe(true);
}

describe('SC-004: every RI capability read/write has ≥1 behavioral test reference', () => {
  for (const [capability, { reads, writes, testDirs }] of Object.entries(SC004_COVERAGE)) {
    describe(capability, () => {
      const sources = collectBehavioralTestSources(testDirs);

      it('has behavioral test files', () => {
        expect(sources.length).toBeGreaterThan(0);
      });

      for (const method of reads) {
        it(`read ${method} is covered`, () => {
          assertMethodCovered(sources, method, capability, 'read');
        });
      }

      for (const method of writes) {
        it(`write ${method} is covered`, () => {
          assertMethodCovered(sources, method, capability, 'write');
        });
      }
    });
  }
});
