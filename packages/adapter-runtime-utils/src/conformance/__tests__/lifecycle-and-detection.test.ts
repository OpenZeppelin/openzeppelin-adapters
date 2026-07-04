import { describe, expect, it } from 'vitest';

import type { NameResolutionCapability } from '@openzeppelin/ui-types';

import { checkConformance } from '../checker';
import { structuralEqual } from '../deep-equal';
import type { ConformanceReport, InvariantId } from '../types';
import {
  compliantForward,
  compliantReverse,
  FORWARD_VECTORS,
  makeCompliant,
  makeStub,
  REVERSE_VECTORS,
} from './fixtures';

/**
 * INV-26 (optional lifecycle family — the branches the Code-stage seeded suite left uncovered)
 * and INV-25 (SC-004 detection tightened: each single-defect stub FAILs EXACTLY its own
 * invariant, proving no collateral mis-attribution).
 */

/** The sorted set of invariants that FAILed in a report. */
function failingInvariants(report: ConformanceReport): InvariantId[] {
  return [
    ...new Set(report.results.filter((r) => r.status === 'FAIL').map((r) => r.invariant)),
  ].sort();
}

const findInvariant = (report: ConformanceReport, id: InvariantId) =>
  report.results.find((r) => r.invariant === id);

describe('INV-26 — optional lifecycle sanctioned-throw: uncovered branches', () => {
  it("dispose() itself throwing → FAIL naming 'dispose() itself threw'", async () => {
    const report = await checkConformance({
      makeCapability: () => {
        const inst = makeStub({ resolveName: compliantForward });
        inst.dispose = () => {
          throw new Error('dispose-boom');
        };
        return inst;
      },
      lifecycleProbe: true,
    });
    const inv26 = findInvariant(report, 'INV-26');
    expect(inv26?.status).toBe('FAIL');
    expect(inv26?.message).toContain('dispose() itself threw');
  });

  it('a post-dispose call throwing a NON-RuntimeDisposedError → FAIL', async () => {
    const report = await checkConformance({
      makeCapability: () =>
        makeStub({
          resolveName: () => {
            throw new Error('not-a-disposed-error'); // wrong error post-dispose
          },
        }),
      lifecycleProbe: true,
    });
    const inv26 = findInvariant(report, 'INV-26');
    expect(inv26?.status).toBe('FAIL');
    expect(inv26?.message).toContain('non-RuntimeDisposedError');
  });

  it('a construction failure in the lifecycle probe → FAIL (isolated to INV-26)', async () => {
    const report = await checkConformance({
      makeCapability: () => {
        throw new Error('construction-boom');
      },
      lifecycleProbe: true,
      // no vectors — only the lifecycle family runs, so the FAIL is unambiguously INV-26's
    });
    expect(report.results).toHaveLength(1);
    const inv26 = findInvariant(report, 'INV-26');
    expect(inv26?.status).toBe('FAIL');
    expect(inv26?.message).toContain('could not construct');
  });

  it('opting in does NOT perturb the four required families (INV-17 isolation)', async () => {
    const config = {
      makeCapability: (): NameResolutionCapability => makeCompliant(true), // guarded
      forwardVectors: FORWARD_VECTORS,
      reverseVectors: REVERSE_VECTORS,
    };
    const off = await checkConformance(config);
    const on = await checkConformance({ ...config, lifecycleProbe: true });

    expect(findInvariant(on, 'INV-26')?.status).toBe('PASS'); // probe ran and passed
    // stripping the lifecycle result, the required-family results are byte-identical.
    const onRequired = on.results.filter((r) => r.invariant !== 'INV-26');
    expect(structuralEqual(onRequired, off.results)).toBe(true);
    expect(off.results.some((r) => r.invariant === 'INV-26')).toBe(false);
  });
});

describe('INV-25 — SC-004 detection: each defect FAILs EXACTLY its own invariant', () => {
  it('(a) throw-on-expected-failure → only INV-8 FAILs', async () => {
    const report = await checkConformance({
      makeCapability: () =>
        makeStub({
          resolveName: (input) => {
            if (input === 'no-such-name.eth') {
              throw new Error('kaboom');
            }
            return compliantForward(input);
          },
        }),
      forwardVectors: FORWARD_VECTORS,
    });
    expect(failingInvariants(report)).toEqual(['INV-8']);
  });

  it('(b) undefined forwardVerified → only INV-6 FAILs', async () => {
    const report = await checkConformance({
      makeCapability: () =>
        makeStub({
          resolveAddress: (input) => {
            const r = compliantReverse(input);
            return r.ok
              ? {
                  ok: true,
                  value: { ...r.value, forwardVerified: undefined as unknown as boolean },
                }
              : r;
          },
        }),
      reverseVectors: REVERSE_VECTORS,
    });
    expect(failingInvariants(report)).toEqual(['INV-6']);
  });

  it('(c) non-user-safe URL label → only INV-16 FAILs', async () => {
    const report = await checkConformance({
      makeCapability: () =>
        makeStub({
          resolveName: (input) => {
            const r = compliantForward(input);
            return r.ok
              ? {
                  ok: true,
                  value: { ...r.value, provenance: { label: 'https://evil/x', external: true } },
                }
              : r;
          },
        }),
      forwardVectors: FORWARD_VECTORS,
    });
    expect(failingInvariants(report)).toEqual(['INV-16']);
  });

  it('(d) non-deterministic-under-stable-state → only INV-12 FAILs', async () => {
    const report = await checkConformance({
      makeCapability: () => {
        let n = 0;
        return makeStub({
          resolveName: (input) => {
            n += 1;
            return {
              ok: true,
              value: {
                name: input,
                address: `0xchanging${n}`,
                provenance: { label: 'ENS', external: false },
              },
            };
          },
        });
      },
      forwardVectors: [{ input: 'vitalik.eth', expect: { ok: true } }],
    });
    expect(failingInvariants(report)).toEqual(['INV-12']);
  });

  it('the compliant reference FAILs nothing (no false positives)', async () => {
    const report = await checkConformance({
      makeCapability: () => makeCompliant(),
      forwardVectors: FORWARD_VECTORS,
      reverseVectors: REVERSE_VECTORS,
    });
    expect(failingInvariants(report)).toEqual([]);
    expect(report.passed).toBe(true);
  });
});
