/**
 * Example — Pattern 2: a runner-agnostic CI gate over the pure `checkConformance` core.
 *
 * No vitest. Run with any TS runner (`tsx ci-gate.ts`, `node --import tsx ci-gate.ts`, …) or
 * wire it into a build step. Exits non-zero on the first non-conformant run.
 *
 * This file is self-contained: it inlines a minimal abstract capability stub so it runs as-is.
 * Swap `makeStubCapability` for your real `makeCapability` factory over a pinned substrate.
 */
import { checkConformance } from '@openzeppelin/adapter-runtime-utils/conformance';
import type { NameResolutionCapability } from '@openzeppelin/ui-types';

// --- Replace this stub with your real adapter factory over a pinned substrate ----------------
// A compliant, deterministic forward-only stub — enough to demonstrate a green gate.
function makeStubCapability(): NameResolutionCapability {
  return {
    isValidName: (name: string) => name.endsWith('.eth'),
    resolveName: async (name: string) => {
      if (name === 'demo.eth') {
        return {
          ok: true,
          value: {
            name,
            address: '0x1111111111111111111111111111111111111111',
            provenance: { label: 'ENS', external: false },
          },
        };
      }
      return { ok: false, error: { code: 'NAME_NOT_FOUND', name } };
    },
  } as NameResolutionCapability;
}
// ---------------------------------------------------------------------------------------------

const report = await checkConformance({
  suiteName: 'CI gate',
  makeCapability: makeStubCapability,
  forwardVectors: [
    { input: 'demo.eth', expect: { ok: true } },
    { input: 'missing.eth', expect: { ok: false, code: 'NAME_NOT_FOUND' } },
  ],
  // No reverseVectors — the reverse family and INV-6 are reported as SKIPPED (not failures).
});

const failures = report.results.filter((r) => r.status === 'FAIL');
const skipped = report.results.filter((r) => r.status === 'SKIPPED');
const passed = report.results.filter((r) => r.status === 'PASS');

if (!report.passed) {
  console.error(`✗ Adapter is non-conformant (${failures.length} failure(s)):`);
  for (const f of failures) console.error(`    ${f.key}: ${f.message}`);
  process.exit(1);
}

console.log(`✓ Conformant — ${passed.length} passed, ${skipped.length} skipped.`);
if (skipped.length > 0) {
  console.log('  (SKIPPED means the method is not implemented — not a certification.)');
  for (const s of skipped) console.log(`    ${s.key}: ${s.message}`);
}
