import { describe, expect, it } from 'vitest';

import { DEFAULT_LABEL_POLICY, isUserSafeLabel } from '../label-policy';
import type { LabelPolicy } from '../types';

/**
 * Locked corpus for UIKit INV-16 (INV-5) and the policy-override contract (INV-24).
 */

describe('isUserSafeLabel — locked corpus (INV-5)', () => {
  const PASS_LABELS = ['ENS', 'ENS via external gateway', 'SNS', 'ENS via CCIP-Read'];
  const FAIL_LABELS: ReadonlyArray<readonly [string, string]> = [
    ['https://internal-gateway.oz.internal/ccip/...', 'url'],
    ['0xabcdef0123456789', 'hex'],
    ['gw@resolver:node-7', '@/internal-id'],
    ['', 'empty'],
  ];

  it.each(PASS_LABELS)('accepts canonical / SF-5 label %j', (label) => {
    expect(isUserSafeLabel(label).safe).toBe(true);
  });

  it.each(FAIL_LABELS)('rejects SC-004 defect label %j (%s)', (label) => {
    const verdict = isUserSafeLabel(label);
    expect(verdict.safe).toBe(false);
    expect(verdict.reason).toBeTruthy();
  });

  it('rejects an over-length label with a length reason', () => {
    const verdict = isUserSafeLabel('E'.repeat(DEFAULT_LABEL_POLICY.maxLength + 1));
    expect(verdict.safe).toBe(false);
    expect(verdict.reason).toContain('over-length');
  });

  it('rejects a bare-digit / leading-non-letter label (anti-hex allowlist anchor)', () => {
    expect(isUserSafeLabel('123abc').safe).toBe(false);
  });
});

describe('DEFAULT_LABEL_POLICY immutability (INV-7)', () => {
  it('is deep-frozen (policy, deny array, and each rule)', () => {
    expect(Object.isFrozen(DEFAULT_LABEL_POLICY)).toBe(true);
    expect(Object.isFrozen(DEFAULT_LABEL_POLICY.deny)).toBe(true);
    for (const rule of DEFAULT_LABEL_POLICY.deny) {
      expect(Object.isFrozen(rule)).toBe(true);
    }
  });
});

describe('policy override is honored, not merged (INV-24)', () => {
  it('a custom policy that rejects "ENS" makes the canonical label FAIL', () => {
    const strict: LabelPolicy = {
      allow: /^SNS$/,
      maxLength: 8,
      deny: [],
    };
    expect(isUserSafeLabel('ENS', strict).safe).toBe(false); // override wins — no fallback to default
    expect(isUserSafeLabel('SNS', strict).safe).toBe(true);
  });
});
