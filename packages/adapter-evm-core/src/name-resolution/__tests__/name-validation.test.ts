/**
 * SF-2 · `name-validation.ts` — `isValidName` / `normalizeName` test suite.
 *
 * Verifies the pure, synchronous, client-free shape gate against INV-3 (total/pure/never-throw),
 * INV-4 (semantics: reject hex → require dot → require ENSIP-15 normalizability, NOT a TLD regex),
 * and INV-21 (independently importable, no service/client dependency). These are the cheapest,
 * hottest-path predicates in SF-2 (the UIKit calls `isValidName` per keystroke), so the never-throw
 * and no-I/O guarantees are load-bearing.
 *
 * Every `describe` block names the invariant(s) it covers.
 */
import { describe, expect, it } from 'vitest';

// INV-21: imported DIRECTLY from the module — no service constructed, no client wired. If this
// import required a capability instance or a viem client, the per-keystroke hot-path use would break.
import { isValidName, normalizeName } from '../name-validation';
import { VITALIK_ADDRESS } from './fixtures';

describe('isValidName — total, pure, synchronous boolean predicate (INV-3)', () => {
  // A representative corpus spanning every input class INV-3 promises a boolean for, incl. inputs
  // whose ENSIP-15 normalization throws internally (must be swallowed → `false`, never propagated).
  const CORPUS: ReadonlyArray<readonly [string, string, boolean]> = [
    ['empty string', '', false],
    ['bare single label (dotless)', 'vitalik', false],
    ['raw hex address', VITALIK_ADDRESS, false],
    ['lowercase hex address', VITALIK_ADDRESS.toLowerCase(), false],
    ['canonical .eth name', 'vitalik.eth', true],
    ['mixed-case .eth name', 'Vitalik.ETH', true],
    ['subdomain name', 'pay.vitalik.eth', true],
    ['non-.eth TLD (.box)', 'vitalik.box', true],
    ['non-.eth TLD (.xyz)', 'nick.xyz', true],
    ['emoji label', '🚀.eth', true],
    ['empty-label name (normalize throws)', 'test..eth', false],
    ['leading-dot name (normalize throws)', '.eth', false],
  ];

  it.each(CORPUS)('returns a boolean for %s and never throws', (_label, input, expected) => {
    let result: boolean | undefined;
    expect(() => {
      result = isValidName(input);
    }).not.toThrow();
    expect(typeof result).toBe('boolean');
    expect(result).toBe(expected);
  });
});

describe('isValidName — shape-gate semantics (INV-4)', () => {
  it('rejects a raw EVM hex address (an address is not a name)', () => {
    expect(isValidName(VITALIK_ADDRESS)).toBe(false);
  });

  it('rejects a dotless bare label (Design Open Q3 — dot required)', () => {
    expect(isValidName('vitalik')).toBe(false);
  });

  it('accepts a canonical dotted ENS name', () => {
    expect(isValidName('vitalik.eth')).toBe(true);
  });

  it('accepts legitimate non-.eth names — proves it is NOT a hardcoded TLD allowlist', () => {
    // A `/\.(eth)$/` allowlist would wrongly reject these resolvable inputs (INV-4 violation scenario).
    expect(isValidName('vitalik.box')).toBe(true);
    expect(isValidName('nick.xyz')).toBe(true);
  });

  it('rejects a name that fails UTS-46 normalization (empty label)', () => {
    expect(isValidName('test..eth')).toBe(false);
  });

  it('true is NECESSARY but not SUFFICIENT — asserts shape, not record existence', () => {
    // `nonexistent-name-99999.eth` is well-formed (→ true) yet resolves to nothing at runtime;
    // the record-existence check is `resolveName`'s job (→ NAME_NOT_FOUND), never `isValidName`'s.
    expect(isValidName('nonexistent-name-99999.eth')).toBe(true);
  });
});

describe('normalizeName — ENSIP-15/UTS-46 normalization (INV-4 backstop, INV-21)', () => {
  it('normalizes a well-formed name (folds case per UTS-46)', () => {
    expect(normalizeName('Vitalik.ETH')).toBe('vitalik.eth');
  });

  it('is idempotent on an already-normalized name', () => {
    expect(normalizeName('vitalik.eth')).toBe('vitalik.eth');
  });

  it('THROWS on a structurally-invalid name (unlike isValidName, it does not swallow)', () => {
    // This is the D-D backstop path `resolveName` catches → UNSUPPORTED_NAME.
    expect(() => normalizeName('test..eth')).toThrow();
  });
});
