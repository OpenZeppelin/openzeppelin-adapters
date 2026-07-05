import { describe, expect, it } from 'vitest';

import type { NameResolutionCapability } from '@openzeppelin/ui-types';

import { checkConformance } from '../checker';
import { structuralEqual } from '../deep-equal';
import type { ConformanceReport, InvariantId, LabelPolicy } from '../types';
import { ConformanceConfigError } from '../types';
import {
  compliantForward,
  compliantReverse,
  FORWARD_VECTORS,
  makeCompliant,
  makeStub,
  REVERSE_VECTORS,
} from './fixtures';

/**
 * SC-004 self-verification (INV-25): a compliant reference passes; one stub per defect class
 * fails with the CORRECT invariant key. Plus harness-hygiene proofs (INV-1/2/7/8/9/10/16/17/24/26).
 * "The TCK tests itself."
 */

const findByInvariant = (report: ConformanceReport, id: InvariantId) =>
  report.results.find((r) => r.invariant === id);

describe('compliant reference (INV-25 baseline)', () => {
  it('passes with all applicable results PASS/SKIPPED', async () => {
    const report = await checkConformance({
      makeCapability: () => makeCompliant(),
      forwardVectors: FORWARD_VECTORS,
      reverseVectors: REVERSE_VECTORS,
    });
    expect(report.passed).toBe(true);
    expect(report.results.some((r) => r.status === 'FAIL')).toBe(false);
    // The four families are represented on the compliant reference.
    expect(findByInvariant(report, 'INV-6')?.status).toBe('PASS');
    expect(findByInvariant(report, 'INV-8')?.status).toBe('PASS');
    expect(findByInvariant(report, 'INV-12')?.status).toBe('PASS');
    expect(findByInvariant(report, 'INV-16')?.status).toBe('PASS');
  });
});

describe('seeded defect stubs — 100% detection with correct key (INV-25)', () => {
  it('(a) throw-on-expected-failure → INV-8 neverThrows FAIL', async () => {
    const report = await checkConformance({
      makeCapability: () =>
        makeStub({
          resolveName: (input) => {
            if (input === 'no-such-name.eth') {
              throw new Error('kaboom'); // must have returned {ok:false}
            }
            return compliantForward(input);
          },
        }),
      forwardVectors: FORWARD_VECTORS,
    });
    expect(report.passed).toBe(false);
    const inv8 = report.results.find((r) => r.invariant === 'INV-8' && r.status === 'FAIL');
    expect(inv8?.key).toBe('inv8_forward_NAME_NOT_FOUND_neverThrows');
  });

  it('(b) undefined forwardVerified → INV-6 concrete-boolean FAIL', async () => {
    const report = await checkConformance({
      makeCapability: () =>
        makeStub({
          resolveAddress: (input) => {
            const r = compliantReverse(input);
            if (r.ok) {
              return {
                ok: true,
                value: { ...r.value, forwardVerified: undefined as unknown as boolean },
              };
            }
            return r;
          },
        }),
      reverseVectors: REVERSE_VECTORS,
    });
    expect(report.passed).toBe(false);
    const inv6 = report.results.find((r) => r.invariant === 'INV-6' && r.status === 'FAIL');
    expect(inv6?.key).toContain('forwardVerifiedConcreteBoolean');
  });

  it('(c) non-user-safe (URL) label → INV-16 FAIL', async () => {
    const report = await checkConformance({
      makeCapability: () =>
        makeStub({
          resolveName: (input) => {
            const r = compliantForward(input);
            if (r.ok) {
              return {
                ok: true,
                value: {
                  ...r.value,
                  provenance: { label: 'https://evil.example/x', external: true },
                },
              };
            }
            return r;
          },
        }),
      forwardVectors: FORWARD_VECTORS,
    });
    expect(report.passed).toBe(false);
    const inv16 = report.results.find((r) => r.invariant === 'INV-16' && r.status === 'FAIL');
    expect(inv16?.key).toContain('labelUserSafe');
    // The anchored allowlist (primary) rejects the URL before the denylist even runs —
    // the FAIL names the tripped rule, whichever gate caught it first.
    expect(inv16?.message).toContain('not user-safe');
  });

  it('(d) non-deterministic-under-stable-state → INV-12 FAIL', async () => {
    const makeNonDeterministic = (): NameResolutionCapability => {
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
    };
    const report = await checkConformance({
      makeCapability: makeNonDeterministic,
      forwardVectors: [{ input: 'vitalik.eth', expect: { ok: true } }],
    });
    expect(report.passed).toBe(false);
    const inv12 = report.results.find((r) => r.invariant === 'INV-12' && r.status === 'FAIL');
    expect(inv12?.key).toContain('deterministic');
  });
});

describe('INV-8 decision table', () => {
  it('in-union-but-wrong code → PASS with note (code precision is SC-002)', async () => {
    const report = await checkConformance({
      makeCapability: () =>
        makeStub({
          resolveName: () => ({ ok: false, error: { code: 'ADDRESS_NOT_FOUND', address: 'x' } }),
        }),
      forwardVectors: [{ input: 'x.eth', expect: { ok: false, code: 'NAME_NOT_FOUND' } }],
    });
    expect(report.passed).toBe(true);
    const inv8 = findByInvariant(report, 'INV-8');
    expect(inv8?.status).toBe('PASS');
    expect(inv8?.message).toContain('SC-002');
  });

  it('out-of-union (fabricated) code → FAIL', async () => {
    const report = await checkConformance({
      makeCapability: () =>
        makeStub({
          resolveName: () => ({ ok: false, error: { code: 'WEIRD_CODE' } as never }),
        }),
      forwardVectors: [{ input: 'x.eth', expect: { ok: false, code: 'NAME_NOT_FOUND' } }],
    });
    expect(report.passed).toBe(false);
    expect(findByInvariant(report, 'INV-8')?.status).toBe('FAIL');
  });

  it('returns {ok:true} on an expected-failure vector → FAIL', async () => {
    const report = await checkConformance({
      makeCapability: () => makeStub({ resolveName: compliantForward }),
      forwardVectors: [{ input: 'vitalik.eth', expect: { ok: false, code: 'NAME_NOT_FOUND' } }],
    });
    expect(report.passed).toBe(false);
    expect(findByInvariant(report, 'INV-8')?.status).toBe('FAIL');
  });

  it('a returned ADAPTER_ERROR is a compliant returned code (PASS)', async () => {
    const report = await checkConformance({
      makeCapability: () =>
        makeStub({
          resolveName: () => ({ ok: false, error: { code: 'ADAPTER_ERROR', message: 'internal' } }),
        }),
      forwardVectors: [{ input: 'x.eth', expect: { ok: false, code: 'ADAPTER_ERROR' } }],
    });
    expect(report.passed).toBe(true);
    expect(findByInvariant(report, 'INV-8')?.status).toBe('PASS');
  });
});

describe('vector-expectation fidelity (EXPECT / INV-6 local closure)', () => {
  it('declared ok:true returning {ok:false} → EXPECT FAIL + dependents SKIPPED', async () => {
    const report = await checkConformance({
      makeCapability: () =>
        makeStub({
          resolveAddress: (input) => ({
            ok: false,
            error: { code: 'ADDRESS_NOT_FOUND', address: input },
          }),
        }),
      reverseVectors: [{ input: '0xabc', expect: { ok: true } }],
    });
    expect(report.passed).toBe(false);
    expect(findByInvariant(report, 'EXPECT')?.status).toBe('FAIL');
    expect(findByInvariant(report, 'INV-6')?.status).toBe('SKIPPED');
    expect(findByInvariant(report, 'INV-16')?.status).toBe('SKIPPED');
    expect(findByInvariant(report, 'INV-12')?.status).toBe('SKIPPED');
  });
});

describe('total exception containment (INV-9)', () => {
  it('a throw on a SUCCESS vector resolves (never rejects): INV-8 FAIL + dependents SKIPPED', async () => {
    const report = await checkConformance({
      makeCapability: () =>
        makeStub({
          resolveAddress: () => {
            throw new Error('boom-on-success');
          },
        }),
      reverseVectors: [{ input: '0xabc', expect: { ok: true } }],
    });
    expect(report.passed).toBe(false);
    expect(findByInvariant(report, 'INV-8')?.status).toBe('FAIL');
    expect(findByInvariant(report, 'INV-6')?.status).toBe('SKIPPED');
    expect(findByInvariant(report, 'INV-16')?.status).toBe('SKIPPED');
    expect(findByInvariant(report, 'INV-12')?.status).toBe('SKIPPED');
  });

  it('does not leak the raw error object into the report (INV-12 no-leak)', async () => {
    const marker = new Error('secret-stack');
    const report = await checkConformance({
      makeCapability: () =>
        makeStub({
          resolveName: () => {
            throw marker;
          },
        }),
      forwardVectors: [{ input: 'x.eth', expect: { ok: false, code: 'NAME_NOT_FOUND' } }],
    });
    const serialized = JSON.stringify(report.results);
    expect(serialized).toContain('Error'); // the constructor name is surfaced as a string
    expect(report.results.every((r) => !Object.values(r).includes(marker))).toBe(true);
  });
});

describe('report shape, coverage, and skips (INV-1 / INV-2)', () => {
  it('a forward-only capability SKIPs the reverse family AND INV-6', async () => {
    const report = await checkConformance({
      makeCapability: () => makeStub({ resolveName: compliantForward }), // no resolveAddress
      forwardVectors: FORWARD_VECTORS,
      reverseVectors: REVERSE_VECTORS,
    });
    expect(report.passed).toBe(true);
    const reverseResults = report.results.filter(
      (r) => r.key.includes('reverse') || r.invariant === 'INV-6'
    );
    expect(reverseResults.length).toBeGreaterThan(0);
    expect(reverseResults.every((r) => r.status === 'SKIPPED')).toBe(true);
  });

  it('a capability with neither method + vectors → all SKIPPED, passed:true', async () => {
    const report = await checkConformance({
      makeCapability: () => makeStub({}), // only isValidName
      forwardVectors: FORWARD_VECTORS,
      reverseVectors: REVERSE_VECTORS,
    });
    expect(report.passed).toBe(true);
    expect(report.results.length).toBeGreaterThan(0);
    expect(report.results.every((r) => r.status === 'SKIPPED')).toBe(true);
  });

  it('empty applicable families (no vectors) → empty results, passed:true', async () => {
    const report = await checkConformance({ makeCapability: () => makeStub({}) });
    expect(report.results).toHaveLength(0);
    expect(report.passed).toBe(true);
  });

  it('report keys are unique within a report (INV-3)', async () => {
    const report = await checkConformance({
      makeCapability: () => makeCompliant(),
      forwardVectors: FORWARD_VECTORS,
      reverseVectors: REVERSE_VECTORS,
    });
    const keys = report.results.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('config validation is the sole throw (INV-10)', () => {
  it('throws ConformanceConfigError for a non-function makeCapability', async () => {
    await expect(checkConformance({ makeCapability: null as never })).rejects.toBeInstanceOf(
      ConformanceConfigError
    );
  });

  it('throws ConformanceConfigError for a non-string vector input', async () => {
    await expect(
      checkConformance({
        makeCapability: () => makeStub({ resolveName: compliantForward }),
        forwardVectors: [{ input: 123 as never, expect: { ok: true } }],
      })
    ).rejects.toBeInstanceOf(ConformanceConfigError);
  });

  it('a well-formed config over a throwing adapter never throws (INV-9 vs INV-10)', async () => {
    await expect(
      checkConformance({
        makeCapability: () =>
          makeStub({
            resolveName: () => {
              throw new Error('adapter bug');
            },
          }),
        forwardVectors: [{ input: 'x.eth', expect: { ok: false, code: 'NAME_NOT_FOUND' } }],
      })
    ).resolves.toBeDefined();
  });
});

describe('immutability and self-determinism (INV-7 / INV-16)', () => {
  it('does not mutate a frozen config across repeated runs', async () => {
    const config = Object.freeze({
      makeCapability: () => makeCompliant(),
      forwardVectors: Object.freeze([...FORWARD_VECTORS]),
      reverseVectors: Object.freeze([...REVERSE_VECTORS]),
    });
    const first = await checkConformance(config);
    const second = await checkConformance(config);
    expect(first.passed).toBe(true);
    expect(second.passed).toBe(true);
  });

  it('two runs over a fixed stub produce structurally-equal reports', async () => {
    const config = {
      makeCapability: () => makeCompliant(),
      forwardVectors: FORWARD_VECTORS,
      reverseVectors: REVERSE_VECTORS,
    };
    const first = await checkConformance(config);
    const second = await checkConformance(config);
    expect(structuralEqual(first, second)).toBe(true);
  });
});

describe('policy override pluggability (INV-24)', () => {
  it('a custom labelPolicy rejecting "ENS" makes the compliant label FAIL', async () => {
    const policy: LabelPolicy = { allow: /^NOPE$/, maxLength: 8, deny: [] };
    const report = await checkConformance({
      makeCapability: () => makeStub({ resolveName: compliantForward }),
      forwardVectors: [{ input: 'vitalik.eth', expect: { ok: true } }],
      labelPolicy: policy,
    });
    expect(report.passed).toBe(false);
    expect(findByInvariant(report, 'INV-16')?.status).toBe('FAIL');
  });
});

describe('optional lifecycle family (INV-26)', () => {
  it('a guard-wrapped compliant stub PASSes when opted in', async () => {
    const report = await checkConformance({
      makeCapability: () => makeCompliant(true), // guarded
      forwardVectors: [{ input: 'vitalik.eth', expect: { ok: true } }],
      lifecycleProbe: true,
    });
    expect(findByInvariant(report, 'INV-26')?.status).toBe('PASS');
    expect(report.passed).toBe(true);
  });

  it('a stub that swallows post-dispose calls FAILs', async () => {
    const report = await checkConformance({
      makeCapability: () => makeStub({ resolveName: compliantForward }), // non-guarded no-op dispose
      forwardVectors: [{ input: 'vitalik.eth', expect: { ok: true } }],
      lifecycleProbe: true,
    });
    expect(findByInvariant(report, 'INV-26')?.status).toBe('FAIL');
  });

  it('an un-disposable stub is SKIPPED', async () => {
    const report = await checkConformance({
      makeCapability: () => makeStub({ resolveName: compliantForward, includeDispose: false }),
      forwardVectors: [{ input: 'vitalik.eth', expect: { ok: true } }],
      lifecycleProbe: true,
    });
    expect(findByInvariant(report, 'INV-26')?.status).toBe('SKIPPED');
  });

  it('with the flag off, no lifecycle result appears', async () => {
    const report = await checkConformance({
      makeCapability: () => makeCompliant(true),
      forwardVectors: [{ input: 'vitalik.eth', expect: { ok: true } }],
    });
    expect(findByInvariant(report, 'INV-26')).toBeUndefined();
  });
});

/**
 * SC-004 robustness (INV-9): a malformed adapter RETURN (not a throw) is a non-compliance the
 * harness must DETECT and record as FAIL data — never crash on. Every member of the
 * malformed-return family must make `checkConformance` RESOLVE with `passed:false`, not reject
 * with a TypeError from an unguarded dereference outside the containment wrapper.
 */
describe('malformed adapter returns are graded, never thrown (SC-004 / INV-9)', () => {
  it('a non-object result (forgotten return) → resolves, INV-8 FAIL', async () => {
    const report = await checkConformance({
      makeCapability: () => makeStub({ resolveName: () => undefined as never }),
      forwardVectors: [{ input: 'vitalik.eth', expect: { ok: true } }],
    });
    expect(report.passed).toBe(false);
    const inv8 = report.results.find((r) => r.invariant === 'INV-8' && r.status === 'FAIL');
    expect(inv8?.key).toBe('inv8_forward_vitalik_eth_neverThrows');
    expect(inv8?.message).toContain('malformed');
  });

  it('a primitive (number) result → resolves, INV-8 FAIL (no throw)', async () => {
    const report = await checkConformance({
      makeCapability: () => makeStub({ resolveName: () => 42 as never }),
      forwardVectors: [{ input: 'x.eth', expect: { ok: false, code: 'NAME_NOT_FOUND' } }],
    });
    expect(report.passed).toBe(false);
    expect(findByInvariant(report, 'INV-8')?.status).toBe('FAIL');
  });

  it('a result whose `ok` is not a boolean → resolves, INV-8 FAIL', async () => {
    const report = await checkConformance({
      makeCapability: () => makeStub({ resolveName: () => ({ ok: 'yes' }) as never }),
      forwardVectors: [{ input: 'vitalik.eth', expect: { ok: true } }],
    });
    expect(report.passed).toBe(false);
    expect(findByInvariant(report, 'INV-8')?.status).toBe('FAIL');
  });

  it('a success result with a missing `value.provenance` → resolves, INV-16 FAIL', async () => {
    const report = await checkConformance({
      makeCapability: () =>
        makeStub({
          resolveName: (input) => {
            const r = compliantForward(input);
            return r.ok ? { ok: true, value: { ...r.value, provenance: undefined as never } } : r;
          },
        }),
      forwardVectors: [{ input: 'vitalik.eth', expect: { ok: true } }],
    });
    expect(report.passed).toBe(false);
    const inv16 = report.results.find((r) => r.invariant === 'INV-16' && r.status === 'FAIL');
    expect(inv16?.key).toContain('labelUserSafe');
    expect(inv16?.message).toContain('provenance');
  });

  it('a success result with a missing `value` object → resolves, INV-16 + INV-6 FAIL', async () => {
    const report = await checkConformance({
      makeCapability: () => makeStub({ resolveAddress: () => ({ ok: true }) as never }),
      reverseVectors: [{ input: '0xabc', expect: { ok: true } }],
    });
    expect(report.passed).toBe(false);
    expect(findByInvariant(report, 'INV-16')?.status).toBe('FAIL');
    expect(findByInvariant(report, 'INV-6')?.status).toBe('FAIL');
    expect(findByInvariant(report, 'INV-12')?.status).toBe('SKIPPED');
  });

  it('a non-string `provenance.label` → resolves, INV-16 FAIL (no `.trim` crash)', async () => {
    const report = await checkConformance({
      makeCapability: () =>
        makeStub({
          resolveName: (input) => {
            const r = compliantForward(input);
            return r.ok
              ? {
                  ok: true,
                  value: { ...r.value, provenance: { label: 123 as never, external: false } },
                }
              : r;
          },
        }),
      forwardVectors: [{ input: 'vitalik.eth', expect: { ok: true } }],
    });
    expect(report.passed).toBe(false);
    const inv16 = report.results.find((r) => r.invariant === 'INV-16' && r.status === 'FAIL');
    expect(inv16?.message).toContain('not user-safe');
    expect(inv16?.message).toContain('non-string-label');
  });

  it('an {ok:false} with no `error` on an EXPECTED-FAILURE vector → resolves, INV-8 FAIL', async () => {
    const report = await checkConformance({
      makeCapability: () => makeStub({ resolveName: () => ({ ok: false }) as never }),
      forwardVectors: [{ input: 'x.eth', expect: { ok: false, code: 'NAME_NOT_FOUND' } }],
    });
    expect(report.passed).toBe(false);
    const inv8 = report.results.find((r) => r.invariant === 'INV-8' && r.status === 'FAIL');
    expect(inv8?.message).toContain('without a typed error object');
  });

  it('an {ok:false} with no `error` on a SUCCESS vector → resolves, EXPECT FAIL (no code deref)', async () => {
    const report = await checkConformance({
      makeCapability: () => makeStub({ resolveAddress: () => ({ ok: false }) as never }),
      reverseVectors: [{ input: '0xabc', expect: { ok: true } }],
    });
    expect(report.passed).toBe(false);
    expect(findByInvariant(report, 'EXPECT')?.status).toBe('FAIL');
    expect(findByInvariant(report, 'EXPECT')?.message).toContain('no error payload');
  });

  it('a `makeCapability` that returns null → resolves, INV-8 FAIL (no null deref)', async () => {
    const report = await checkConformance({
      makeCapability: () => null as unknown as NameResolutionCapability,
      forwardVectors: [{ input: 'x.eth', expect: { ok: false, code: 'NAME_NOT_FOUND' } }],
    });
    expect(report.passed).toBe(false);
    const inv8 = report.results.find((r) => r.invariant === 'INV-8' && r.status === 'FAIL');
    expect(inv8?.message).toContain('non-capability');
  });

  it('a well-formed first call but a malformed SECOND (determinism) call → INV-12 FAIL, INV-16 PASS', async () => {
    const report = await checkConformance({
      makeCapability: () => {
        let n = 0;
        return makeStub({
          resolveName: (input) => {
            n += 1;
            return n >= 2 ? (undefined as never) : compliantForward(input);
          },
        });
      },
      forwardVectors: [{ input: 'vitalik.eth', expect: { ok: true } }],
    });
    expect(report.passed).toBe(false);
    expect(findByInvariant(report, 'INV-16')?.status).toBe('PASS');
    const inv12 = report.results.find((r) => r.invariant === 'INV-12' && r.status === 'FAIL');
    expect(inv12?.message).toContain('malformed');
  });

  it('the whole family RESOLVES (never rejects) — checkConformance is total', async () => {
    const malformed: Array<() => NameResolutionCapability> = [
      () => makeStub({ resolveName: () => undefined as never }),
      () => makeStub({ resolveName: () => null as never }),
      () => makeStub({ resolveName: () => 'oops' as never }),
      () => makeStub({ resolveName: () => ({ ok: false }) as never }),
      () => makeStub({ resolveName: () => ({ ok: true }) as never }),
    ];
    for (const makeCapability of malformed) {
      await expect(
        checkConformance({
          makeCapability,
          forwardVectors: [{ input: 'vitalik.eth', expect: { ok: true } }],
        })
      ).resolves.toMatchObject({ passed: false });
    }
    // …and a null-returning factory too.
    await expect(
      checkConformance({
        makeCapability: () => null as unknown as NameResolutionCapability,
        forwardVectors: [{ input: 'x.eth', expect: { ok: false, code: 'NAME_NOT_FOUND' } }],
      })
    ).resolves.toMatchObject({ passed: false });
  });
});
