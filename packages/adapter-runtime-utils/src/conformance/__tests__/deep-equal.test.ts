import { describe, expect, it } from 'vitest';

import type { ResolutionResult, ResolvedAddress, ResolvedName } from '@openzeppelin/ui-types';

import { normalizeResolutionResult, structuralEqual } from '../deep-equal';

/**
 * Unit proof for the INV-12 engine. The comparator/normalizer are conformance-critical — a
 * bug here is a false pass/fail in the gate itself (design D-2 must-do (b)).
 */

describe('structuralEqual (INV-15)', () => {
  it('compares primitives with Object.is semantics, including NaN', () => {
    expect(structuralEqual(1, 1)).toBe(true);
    expect(structuralEqual('a', 'a')).toBe(true);
    expect(structuralEqual(true, true)).toBe(true);
    expect(structuralEqual(null, null)).toBe(true);
    expect(structuralEqual(NaN, NaN)).toBe(true); // Object.is(NaN, NaN) === true
    expect(structuralEqual(1, 2)).toBe(false);
    expect(structuralEqual('a', 'b')).toBe(false);
  });

  it('is order-insensitive over object keys', () => {
    expect(structuralEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  it('detects extra / missing / swapped keys (not just key count)', () => {
    expect(structuralEqual({ a: 1, b: 2 }, { a: 1, c: 2 })).toBe(false); // same count, different keys
    expect(structuralEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it('compares arrays by length then elementwise', () => {
    expect(structuralEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(structuralEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(structuralEqual([1, { x: 1 }], [1, { x: 1 }])).toBe(true);
    expect(structuralEqual([1, { x: 1 }], [1, { x: 2 }])).toBe(false);
  });

  it('recurses through nested plain objects', () => {
    expect(structuralEqual({ p: { q: { r: 1 } } }, { p: { q: { r: 1 } } })).toBe(true);
    expect(structuralEqual({ p: { q: { r: 1 } } }, { p: { q: { r: 2 } } })).toBe(false);
  });

  it('returns false on type mismatch (array vs object, differing typeof)', () => {
    expect(structuralEqual([], {})).toBe(false);
    expect(structuralEqual(1, '1')).toBe(false);
    expect(structuralEqual(null, {})).toBe(false);
  });

  it('falls back to identity for non-plain objects (conservative FAIL, not false pass)', () => {
    const d1 = new Date(0);
    const d2 = new Date(0);
    expect(structuralEqual(d1, d1)).toBe(true); // same reference
    expect(structuralEqual(d1, d2)).toBe(false); // equal-valued but distinct non-plain objects
  });
});

describe('normalizeResolutionResult (INV-14)', () => {
  const includeAvatar = { includeAvatar: true } as const;
  const excludeAvatar = { includeAvatar: false } as const;

  it('makes {avatarUrl: undefined} and absent-key compare EQUAL', () => {
    const withUndef: ResolutionResult<ResolvedName> = {
      ok: true,
      value: {
        address: '0xabc',
        name: 'a.eth',
        forwardVerified: true,
        avatarUrl: undefined,
        provenance: { label: 'ENS', external: false },
      },
    };
    const withoutKey: ResolutionResult<ResolvedName> = {
      ok: true,
      value: {
        address: '0xabc',
        name: 'a.eth',
        forwardVerified: true,
        provenance: { label: 'ENS', external: false },
      },
    };
    expect(
      structuralEqual(
        normalizeResolutionResult(withUndef, includeAvatar),
        normalizeResolutionResult(withoutKey, includeAvatar)
      )
    ).toBe(true);
  });

  it('drops undefined-valued keys recursively (nested provenance)', () => {
    const nestedUndef: ResolutionResult<ResolvedAddress> = {
      ok: true,
      value: {
        name: 'a.eth',
        address: '0xabc',
        provenance: { label: 'ENS', external: false, scopedToNetworkId: undefined },
      },
    };
    const nestedAbsent: ResolutionResult<ResolvedAddress> = {
      ok: true,
      value: { name: 'a.eth', address: '0xabc', provenance: { label: 'ENS', external: false } },
    };
    expect(
      structuralEqual(
        normalizeResolutionResult(nestedUndef, excludeAvatar),
        normalizeResolutionResult(nestedAbsent, excludeAvatar)
      )
    ).toBe(true);
  });

  it('drops avatarUrl only when includeAvatar is false (SF-3 INV-13 carry-in)', () => {
    const withAvatar: ResolutionResult<ResolvedName> = {
      ok: true,
      value: {
        address: '0xabc',
        name: 'a.eth',
        forwardVerified: true,
        avatarUrl: 'https://cdn/a.png',
        provenance: { label: 'ENS', external: false },
      },
    };
    const withoutAvatar: ResolutionResult<ResolvedName> = {
      ok: true,
      value: {
        address: '0xabc',
        name: 'a.eth',
        forwardVerified: true,
        provenance: { label: 'ENS', external: false },
      },
    };
    // excluded → equal despite differing avatar surface
    expect(
      structuralEqual(
        normalizeResolutionResult(withAvatar, excludeAvatar),
        normalizeResolutionResult(withoutAvatar, excludeAvatar)
      )
    ).toBe(true);
    // included → the difference is visible
    expect(
      structuralEqual(
        normalizeResolutionResult(withAvatar, includeAvatar),
        normalizeResolutionResult(withoutAvatar, includeAvatar)
      )
    ).toBe(false);
  });

  it('drops error.cause on {ok:false} but keeps code + typed fields (INV-21)', () => {
    const first: ResolutionResult<ResolvedAddress> = {
      ok: false,
      error: { code: 'ADAPTER_ERROR', message: 'boom', cause: new Error('native-1') },
    };
    const second: ResolutionResult<ResolvedAddress> = {
      ok: false,
      error: { code: 'ADAPTER_ERROR', message: 'boom', cause: new Error('native-2-different') },
    };
    // cause differs, but is excluded → equal
    expect(
      structuralEqual(
        normalizeResolutionResult(first, excludeAvatar),
        normalizeResolutionResult(second, excludeAvatar)
      )
    ).toBe(true);
    // a differing typed field IS compared
    const third: ResolutionResult<ResolvedAddress> = {
      ok: false,
      error: { code: 'ADAPTER_ERROR', message: 'different-message' },
    };
    expect(
      structuralEqual(
        normalizeResolutionResult(first, excludeAvatar),
        normalizeResolutionResult(third, excludeAvatar)
      )
    ).toBe(false);
  });

  it('does not mutate its input (INV-14e)', () => {
    const input: ResolutionResult<ResolvedName> = {
      ok: true,
      value: {
        address: '0xabc',
        name: 'a.eth',
        forwardVerified: true,
        avatarUrl: 'https://cdn/a.png',
        provenance: { label: 'ENS', external: false },
      },
    };
    normalizeResolutionResult(input, excludeAvatar);
    expect(input.ok && input.value.avatarUrl).toBe('https://cdn/a.png'); // untouched
  });
});
