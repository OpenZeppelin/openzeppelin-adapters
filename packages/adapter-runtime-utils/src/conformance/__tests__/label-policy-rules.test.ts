import { describe, expect, it } from 'vitest';

import { DEFAULT_LABEL_POLICY, isUserSafeLabel } from '../label-policy';
import type { LabelDenyRule, LabelPolicy } from '../types';

/**
 * UIKit INV-16 defense-in-depth internals the Code-stage locked corpus does not reach:
 * INV-5 (each denylist rule fires with its named reason, and the allowlist-primary ordering
 * is observable) and INV-7 (the default policy is not merely `Object.isFrozen` but genuinely
 * immutable — a mutation THROWS in strict mode).
 *
 * The default anchored allowlist is so strict it shadows most denylist rules (a URL trips
 * `allow-mismatch` before the denylist runs). To exercise the belt-and-braces denylist in
 * isolation we pair the DEFAULT `deny` rules with a permissive `allow`, proving each rule
 * independently and preserving the shipped rules verbatim.
 */

describe('INV-5 — denylist rules each fire with their named reason', () => {
  const permissive: LabelPolicy = {
    allow: /^[\s\S]*$/, // permit anything, so the denylist is what rejects
    maxLength: 1000,
    deny: DEFAULT_LABEL_POLICY.deny, // the shipped rules, verbatim
  };

  const BELL = String.fromCharCode(7); // an ASCII control char, spelled out (no invisible byte)
  const cases: ReadonlyArray<readonly [string, string, string]> = [
    ['contains-url-scheme', 'gateway://internal', 'contains-url-scheme'],
    ['contains-hex-run', 'label 0xabcdef here', 'contains-hex-run'],
    ['contains-at-sign', 'gw@resolver', 'contains-at-sign'],
    ['contains-control-char', `ENS${BELL}bell`, 'contains-control-char'],
    ['empty-or-whitespace', '   ', 'empty-or-whitespace'],
  ];

  it.each(cases)('a %s label is rejected with reason %s', (_desc, label, expectedReason) => {
    const verdict = isUserSafeLabel(label, permissive);
    expect(verdict.safe).toBe(false);
    expect(verdict.reason).toBe(expectedReason);
  });

  it('the empty string trips empty-or-whitespace under the permissive policy', () => {
    expect(isUserSafeLabel('', permissive).reason).toBe('empty-or-whitespace');
  });
});

describe('INV-5 — allowlist is primary: it rejects before the denylist runs', () => {
  it('a URL under the DEFAULT policy reports allow-mismatch, not contains-url-scheme', () => {
    const verdict = isUserSafeLabel('https://internal-gateway/x', DEFAULT_LABEL_POLICY);
    expect(verdict.safe).toBe(false);
    expect(verdict.reason).toBe('allow-mismatch'); // anchored allowlist catches it first
  });

  it('length is checked before the allowlist (an over-length canonical label reports over-length)', () => {
    const label = 'ENS'.repeat(30); // > 64 chars but allowlist-shaped
    const verdict = isUserSafeLabel(label, DEFAULT_LABEL_POLICY);
    expect(verdict.safe).toBe(false);
    expect(verdict.reason).toContain('over-length');
  });
});

describe('INV-7 — DEFAULT_LABEL_POLICY is genuinely immutable (mutation THROWS)', () => {
  it('reassigning a scalar field throws in strict mode', () => {
    expect(() => {
      (DEFAULT_LABEL_POLICY as { maxLength: number }).maxLength = 1;
    }).toThrow();
  });

  it('mutating the frozen deny array throws in strict mode', () => {
    expect(() => {
      (DEFAULT_LABEL_POLICY.deny as LabelDenyRule[]).push({ name: 'x', test: () => false });
    }).toThrow();
  });
});
