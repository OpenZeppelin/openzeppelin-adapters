import { describe, expect, it } from 'vitest';

import type { ResolutionResult, ResolvedName } from '@openzeppelin/ui-types';

import { checkConformance } from '../checker';
import { normalizeResolutionResult, structuralEqual } from '../deep-equal';
import { FORWARD_VECTORS, makeCompliant, REVERSE_VECTORS } from './fixtures';
import {
  makeFlappingAvatarReverse,
  makeFlappingCauseReverse,
  makeFlappingErrorDetailReverse,
  makeMemoizingReverse,
} from './harness-fixtures';

/**
 * Idempotency & Retry — the determinism engine and the harness's own self-determinism.
 * INV-13 (UIKit INV-12 determinism, behaviorally through the checker: identity vs equality,
 * avatar surface, failure vectors), INV-14 (normalize preserves the discriminant + typed
 * fields), INV-15 (structuralEqual reflexive + symmetric), INV-16 (checkConformance is a pure
 * function — fixed ordering), INV-21 (cause-blind determinism through the checker).
 *
 * The comparator/normalizer *unit* proofs live in `deep-equal.test.ts` (Code stage); this file
 * exercises them end-to-end through `checkConformance` and adds the reflexive/symmetric
 * property checks and the ordering guarantee.
 */

const inv12 = (results: readonly { readonly invariant: string; readonly status: string }[]) =>
  results.find((r) => r.invariant === 'INV-12');

describe('INV-13 — determinism: object identity is NOT required, equality is', () => {
  it('a memoizer returning the SAME reference PASSes INV-12', async () => {
    const report = await checkConformance({
      makeCapability: () => makeMemoizingReverse(),
      reverseVectors: [{ input: '0xabc', expect: { ok: true } }],
    });
    expect(inv12(report.results)?.status).toBe('PASS');
    expect(report.passed).toBe(true);
  });

  it('a re-querier returning a FRESH-but-equal object PASSes INV-12', async () => {
    const report = await checkConformance({
      makeCapability: () => makeCompliant(), // compliantReverse builds a new object each call
      reverseVectors: [REVERSE_VECTORS[0]], // the success vector
    });
    expect(inv12(report.results)?.status).toBe('PASS');
  });

  it('a flapping avatarUrl PASSes by default and FAILs under stableAvatarSurface', async () => {
    const base = {
      makeCapability: () => makeFlappingAvatarReverse(),
      reverseVectors: [{ input: '0xabc', expect: { ok: true } as const }],
    };
    const relaxed = await checkConformance(base); // stableAvatarSurface defaults false
    expect(inv12(relaxed.results)?.status).toBe('PASS');

    const strict = await checkConformance({ ...base, stableAvatarSurface: true });
    expect(inv12(strict.results)?.status).toBe('FAIL');
    expect(strict.passed).toBe(false);
  });

  it('determinism is graded on expected-FAILURE vectors too: a flapping error detail FAILs', async () => {
    const report = await checkConformance({
      makeCapability: () => makeFlappingErrorDetailReverse(),
      reverseVectors: [{ input: '0xabc', expect: { ok: false, code: 'EXTERNAL_GATEWAY_ERROR' } }],
    });
    expect(inv12(report.results)?.status).toBe('FAIL');
    expect(report.passed).toBe(false);
  });
});

describe('INV-14 — normalize preserves the discriminant and typed fields', () => {
  it('keeps ok:true and its value fields, dropping only undefined keys', () => {
    const value: ResolutionResult<ResolvedName> = {
      ok: true,
      value: {
        address: '0xabc',
        name: 'a.eth',
        forwardVerified: false,
        provenance: { label: 'ENS', external: false },
      },
    };
    const normalized = normalizeResolutionResult(value, { includeAvatar: false });
    expect(normalized).toEqual({
      ok: true,
      value: {
        address: '0xabc',
        name: 'a.eth',
        forwardVerified: false, // a concrete `false` is a real value, never dropped
        provenance: { label: 'ENS', external: false },
      },
    });
  });

  it('keeps ok:false and the typed code, so a differing code is observable', () => {
    const a = normalizeResolutionResult(
      { ok: false, error: { code: 'NAME_NOT_FOUND', name: 'x' } },
      { includeAvatar: false }
    );
    const b = normalizeResolutionResult(
      { ok: false, error: { code: 'UNSUPPORTED_NAME', name: 'x', reason: 'bad' } },
      { includeAvatar: false }
    );
    expect(structuralEqual(a, b)).toBe(false);
  });
});

describe('INV-15 — structuralEqual is reflexive and symmetric', () => {
  const samples: readonly unknown[] = [
    1,
    'a',
    null,
    NaN,
    { a: 1, b: { c: [1, 2, 3] } },
    [1, { x: 'y' }],
    { list: [{ n: 1 }, { n: 2 }] },
  ];

  it('is reflexive: every value equals itself', () => {
    for (const s of samples) {
      expect(structuralEqual(s, s)).toBe(true);
    }
  });

  it('is symmetric: equal(a,b) === equal(b,a) for equal and unequal pairs', () => {
    const pairs: ReadonlyArray<readonly [unknown, unknown]> = [
      [
        { a: 1, b: 2 },
        { b: 2, a: 1 },
      ], // equal, reordered keys
      [{ a: 1 }, { a: 1, b: 2 }], // unequal, extra key
      [
        [1, 2],
        [1, 2, 3],
      ], // unequal, length
      [{ list: [{ n: 1 }] }, { list: [{ n: 2 }] }], // unequal, nested
    ];
    for (const [a, b] of pairs) {
      expect(structuralEqual(a, b)).toBe(structuralEqual(b, a));
    }
  });

  it('recurses into an array nested inside an object', () => {
    expect(structuralEqual({ list: [{ n: 1 }, { n: 2 }] }, { list: [{ n: 1 }, { n: 2 }] })).toBe(
      true
    );
    expect(structuralEqual({ list: [{ n: 1 }] }, { list: [{ n: 1 }, { n: 2 }] })).toBe(false);
  });
});

describe('INV-16 — checkConformance is a pure function with fixed ordering', () => {
  it('emits all forward-family results before any reverse-family result, in caller order', async () => {
    const report = await checkConformance({
      makeCapability: () => makeCompliant(),
      forwardVectors: FORWARD_VECTORS, // [vitalik.eth, no-such-name.eth]
      reverseVectors: REVERSE_VECTORS,
    });
    const keys = report.results.map((r) => r.key);
    const isReverse = (k: string) => k.includes('_reverse_') || k.startsWith('inv6_');

    const lastForward = keys.reduce((acc, k, i) => (k.includes('_forward_') ? i : acc), -1);
    const firstReverse = keys.findIndex(isReverse);
    expect(lastForward).toBeGreaterThanOrEqual(0);
    expect(firstReverse).toBeGreaterThan(lastForward); // forward block precedes reverse block

    // within the forward block, caller vector order is preserved
    const lastVitalik = keys.reduce((acc, k, i) => (k.includes('vitalik_eth') ? i : acc), -1);
    const firstNoSuch = keys.findIndex((k) => k.includes('no_such_name_eth'));
    expect(firstNoSuch).toBeGreaterThan(lastVitalik);
  });

  it('two runs over a fixed stub produce structurally-equal reports (dog-foods the comparator)', async () => {
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

describe('INV-21 — error.cause is never inspected, compared, or surfaced', () => {
  it('a fresh native error.cause each call still PASSes INV-12, and no cause content leaks', async () => {
    const report = await checkConformance({
      makeCapability: () => makeFlappingCauseReverse(),
      reverseVectors: [{ input: '0xabc', expect: { ok: false, code: 'ADAPTER_ERROR' } }],
    });
    expect(inv12(report.results)?.status).toBe('PASS');
    expect(report.passed).toBe(true);
    // the native cause's message must not surface anywhere in the report
    expect(JSON.stringify(report.results)).not.toContain('fresh-native');
  });
});
