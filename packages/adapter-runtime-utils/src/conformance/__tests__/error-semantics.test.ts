import { describe, expect, it } from 'vitest';

import type {
  NameResolutionError,
  ResolutionResult,
  ResolvedAddress,
} from '@openzeppelin/ui-types';
import { RuntimeDisposedError } from '@openzeppelin/ui-types';

import { checkConformance } from '../checker';
import { classifyExpectedFailure } from '../checks/never-throws';
import { describeError, isRuntimeDisposedError } from '../internal';
import type { AnyResolutionResult } from '../types';
import { ConformanceConfigError } from '../types';
import { compliantForward, makeStub } from './fixtures';
import { makeDisposedThrowerForward, makeThrowOnSecondCallForward } from './harness-fixtures';

/**
 * Error-semantics coverage — the load-bearing family. INV-8 (never-throw decision table),
 * INV-9 (total exception containment across every call site), INV-10 (ConformanceConfigError
 * is the sole throw, validated up front), INV-11 (single RuntimeDisposedError predicate),
 * INV-12 (no opaque leak / no re-throw of adapter errors).
 */

/** Inject a deliberately-malformed error payload (a fabricated adapter would emit these). */
function failureWith(error: unknown): AnyResolutionResult {
  return { ok: false, error: error as NameResolutionError };
}

const OK_FORWARD: ResolutionResult<ResolvedAddress> = {
  ok: true,
  value: { name: 'a.eth', address: '0xabc', provenance: { label: 'ENS', external: false } },
};

describe('INV-8 — never-throw taxonomy (classifyExpectedFailure decision table)', () => {
  it('in-union code === declared → PASS', () => {
    const leaf = classifyExpectedFailure('NAME_NOT_FOUND', failureWith({ code: 'NAME_NOT_FOUND' }));
    expect(leaf.status).toBe('PASS');
  });

  it('in-union code !== declared → PASS with an SC-002 note', () => {
    const leaf = classifyExpectedFailure(
      'NAME_NOT_FOUND',
      failureWith({ code: 'ADDRESS_NOT_FOUND' })
    );
    expect(leaf.status).toBe('PASS');
    expect(leaf.message).toContain('SC-002');
  });

  it('code missing → FAIL (fabricated code outside the typed contract)', () => {
    expect(classifyExpectedFailure('NAME_NOT_FOUND', failureWith({})).status).toBe('FAIL');
  });

  it('code is a non-string → FAIL', () => {
    expect(classifyExpectedFailure('NAME_NOT_FOUND', failureWith({ code: 42 })).status).toBe(
      'FAIL'
    );
  });

  it('code out of the closed union → FAIL', () => {
    expect(
      classifyExpectedFailure('NAME_NOT_FOUND', failureWith({ code: 'WEIRD_CODE' })).status
    ).toBe('FAIL');
  });

  it('returned {ok:true} on an expected-failure vector → FAIL', () => {
    expect(classifyExpectedFailure('NAME_NOT_FOUND', OK_FORWARD).status).toBe('FAIL');
  });

  it('a thrown RuntimeDisposedError on an expected-failure vector → SKIPPED (not FAIL)', async () => {
    const report = await checkConformance({
      makeCapability: () => makeDisposedThrowerForward(),
      forwardVectors: [{ input: 'x.eth', expect: { ok: false, code: 'NAME_NOT_FOUND' } }],
    });
    const inv8 = report.results.find((r) => r.invariant === 'INV-8');
    expect(inv8?.status).toBe('SKIPPED');
    expect(report.passed).toBe(true); // a SKIP never fails the report
  });
});

describe('INV-9 — total exception containment across every call site', () => {
  it('a throw on the SECOND (determinism) call → INV-12 FAIL, never a double-counted INV-8', async () => {
    const report = await checkConformance({
      makeCapability: () => makeThrowOnSecondCallForward(),
      forwardVectors: [{ input: 'vitalik.eth', expect: { ok: true } }],
    });
    expect(report.passed).toBe(false);
    expect(report.results.find((r) => r.invariant === 'INV-12')?.status).toBe('FAIL');
    // call #1 succeeded, so the value check saw a real value and passed…
    expect(report.results.find((r) => r.invariant === 'INV-16')?.status).toBe('PASS');
    // …and the throw is attributed to INV-12 only, not re-counted as an INV-8 violation.
    expect(report.results.some((r) => r.invariant === 'INV-8')).toBe(false);
  });

  it('makeCapability() throwing is contained → INV-8 FAIL, checkConformance resolves', async () => {
    const report = await checkConformance({
      makeCapability: () => {
        throw new Error('construction-boom');
      },
      forwardVectors: [{ input: 'x.eth', expect: { ok: false, code: 'NAME_NOT_FOUND' } }],
    });
    const inv8 = report.results.find((r) => r.invariant === 'INV-8');
    expect(inv8?.status).toBe('FAIL');
    expect(inv8?.message).toContain('construction threw');
    expect(report.passed).toBe(false);
  });

  it('a throw on a forward SUCCESS vector → INV-8 FAIL + INV-16/INV-12 SKIPPED, no INV-6', async () => {
    const report = await checkConformance({
      makeCapability: () =>
        makeStub({
          resolveName: () => {
            throw new Error('boom-on-forward-success');
          },
        }),
      forwardVectors: [{ input: 'vitalik.eth', expect: { ok: true } }],
    });
    expect(report.passed).toBe(false);
    expect(report.results.find((r) => r.invariant === 'INV-8')?.status).toBe('FAIL');
    expect(report.results.find((r) => r.invariant === 'INV-16')?.status).toBe('SKIPPED');
    expect(report.results.find((r) => r.invariant === 'INV-12')?.status).toBe('SKIPPED');
    expect(report.results.some((r) => r.invariant === 'INV-6')).toBe(false); // forward has no INV-6
  });
});

describe('INV-10 — ConformanceConfigError is the sole throw, validated up front', () => {
  const goodMake = () => makeStub({ resolveName: compliantForward });

  const MALFORMED: ReadonlyArray<readonly [string, unknown]> = [
    ['config is null', null],
    ['makeCapability is not a function', { makeCapability: 'nope' }],
    ['forwardVectors is not an array', { makeCapability: goodMake, forwardVectors: 'x' }],
    ['a vector is not an object', { makeCapability: goodMake, forwardVectors: ['x'] }],
    [
      'vector.input is not a string',
      { makeCapability: goodMake, forwardVectors: [{ input: 1, expect: { ok: true } }] },
    ],
    [
      'vector.label is not a string',
      {
        makeCapability: goodMake,
        forwardVectors: [{ input: 'a', label: 5, expect: { ok: true } }],
      },
    ],
    [
      'vector.expect is not an object',
      { makeCapability: goodMake, forwardVectors: [{ input: 'a', expect: 'nope' }] },
    ],
    [
      'expect.ok is not a boolean',
      { makeCapability: goodMake, forwardVectors: [{ input: 'a', expect: { ok: 'yes' } }] },
    ],
    [
      'expect.code missing on a failure vector',
      { makeCapability: goodMake, forwardVectors: [{ input: 'a', expect: { ok: false } }] },
    ],
    ['reverseVectors is not an array', { makeCapability: goodMake, reverseVectors: 42 }],
    [
      'stableAvatarSurface is not a boolean',
      { makeCapability: goodMake, stableAvatarSurface: 'y' },
    ],
    ['suiteName is not a string', { makeCapability: goodMake, suiteName: 7 }],
    ['lifecycleProbe is not a boolean', { makeCapability: goodMake, lifecycleProbe: 'y' }],
    ['labelPolicy is not an object', { makeCapability: goodMake, labelPolicy: 'nope' }],
    [
      'labelPolicy.allow is not a RegExp',
      { makeCapability: goodMake, labelPolicy: { allow: 'x', maxLength: 8, deny: [] } },
    ],
    [
      'labelPolicy.maxLength is not finite',
      { makeCapability: goodMake, labelPolicy: { allow: /x/, maxLength: Infinity, deny: [] } },
    ],
    [
      'labelPolicy.deny is not an array',
      { makeCapability: goodMake, labelPolicy: { allow: /x/, maxLength: 8, deny: 'nope' } },
    ],
    [
      'labelPolicy.deny rule is not an object',
      { makeCapability: goodMake, labelPolicy: { allow: /x/, maxLength: 8, deny: ['x'] } },
    ],
    [
      'labelPolicy.deny rule.name is not a string',
      {
        makeCapability: goodMake,
        labelPolicy: { allow: /x/, maxLength: 8, deny: [{ name: 1, test: () => false }] },
      },
    ],
    [
      'labelPolicy.deny rule.test is not a function',
      {
        makeCapability: goodMake,
        labelPolicy: { allow: /x/, maxLength: 8, deny: [{ name: 'r', test: 'nope' }] },
      },
    ],
  ];

  it.each(MALFORMED)('rejects with ConformanceConfigError when %s', async (_label, config) => {
    await expect(checkConformance(config as never)).rejects.toBeInstanceOf(ConformanceConfigError);
  });

  it('validation runs BEFORE any capability construction (makeCapability never called)', async () => {
    let calls = 0;
    const spyMake = () => {
      calls += 1;
      return makeStub({ resolveName: compliantForward });
    };
    await expect(
      checkConformance({
        makeCapability: spyMake,
        forwardVectors: [{ input: 1 as never, expect: { ok: true } }],
      })
    ).rejects.toBeInstanceOf(ConformanceConfigError);
    expect(calls).toBe(0);
  });

  it('the thrown error carries code CONFORMANCE_CONFIG', async () => {
    let caught: unknown;
    try {
      await checkConformance({ makeCapability: null as never });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ConformanceConfigError);
    if (caught instanceof ConformanceConfigError) {
      expect(caught.code).toBe('CONFORMANCE_CONFIG');
    }
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

describe('INV-11 — single RuntimeDisposedError detection predicate', () => {
  it('classifies same-realm, cross-realm-by-name, and non-disposed values correctly', () => {
    expect(isRuntimeDisposedError(new RuntimeDisposedError('name-resolution'))).toBe(true);
    // cross-realm: a structurally-cloned error from a duplicated bundle copy.
    expect(isRuntimeDisposedError({ name: 'RuntimeDisposedError' })).toBe(true);
    expect(
      isRuntimeDisposedError(Object.assign(new Error('x'), { name: 'RuntimeDisposedError' }))
    ).toBe(true);
    expect(isRuntimeDisposedError(new Error('plain'))).toBe(false);
    expect(isRuntimeDisposedError(new TypeError('type'))).toBe(false);
    expect(isRuntimeDisposedError('RuntimeDisposedError')).toBe(false); // a bare string is not disposed
  });

  it('is total — never throws on null / undefined / a number', () => {
    expect(isRuntimeDisposedError(null)).toBe(false);
    expect(isRuntimeDisposedError(undefined)).toBe(false);
    expect(isRuntimeDisposedError(42)).toBe(false);
  });

  it('the predicate is what the checker uses: a cross-realm disposed throw → INV-8 SKIPPED', async () => {
    const report = await checkConformance({
      makeCapability: () =>
        makeStub({
          resolveName: () => {
            throw Object.assign(new Error('cross-realm disposed'), {
              name: 'RuntimeDisposedError',
            });
          },
        }),
      forwardVectors: [{ input: 'x.eth', expect: { ok: false, code: 'NAME_NOT_FOUND' } }],
    });
    expect(report.results.find((r) => r.invariant === 'INV-8')?.status).toBe('SKIPPED');
  });
});

describe('INV-12 — no opaque leak / no re-throw of adapter errors', () => {
  it('describeError yields `<constructorName>: <String(err)>` and retains no raw object', () => {
    class BoomError extends Error {
      constructor() {
        super('boom-detail');
        this.name = 'BoomError';
      }
    }
    const described = describeError(new BoomError());
    expect(described).toContain('BoomError');
    expect(described).toContain('boom-detail');
    // primitives fall back to `typeof`
    expect(describeError('a-string')).toContain('string');
    expect(describeError(42)).toContain('number');
  });

  it('a custom-class throw surfaces the class name as a STRING, and the raw object never leaks', async () => {
    class BoomError extends Error {
      constructor() {
        super('secret-internal-detail');
        this.name = 'BoomError';
      }
    }
    const marker = new BoomError();
    const report = await checkConformance({
      makeCapability: () =>
        makeStub({
          resolveName: () => {
            throw marker;
          },
        }),
      forwardVectors: [{ input: 'x.eth', expect: { ok: false, code: 'NAME_NOT_FOUND' } }],
    });
    const inv8 = report.results.find((r) => r.invariant === 'INV-8');
    expect(inv8?.status).toBe('FAIL');
    expect(inv8?.message).toContain('BoomError');
    // the live error object is nowhere in the returned report
    expect(report.results.every((r) => !Object.values(r).includes(marker))).toBe(true);
  });
});
