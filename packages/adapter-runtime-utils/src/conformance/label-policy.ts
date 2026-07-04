import type { LabelDenyRule, LabelPolicy } from './types';

/**
 * INV-16 engine — the defense-in-depth `provenance.label` policy this repo owns.
 *
 * Mirrors SF-1's classifier posture: an anchored allowlist is primary, a belt-and-braces
 * denylist is the fallback. The whole policy is overridable via `config.labelPolicy` so an
 * ecosystem can tune it without forking (INV-24).
 */

/**
 * Anchored allowlist the label MUST fully match (D-5):
 * - MUST start with a letter — rejects `0x…` and bare-digit labels.
 * - allows internal single hyphen / apostrophe as prose connectors — accommodates SF-5's
 *   `'ENS via CCIP-Read'` without forcing SF-5 to pick hyphen-free labels.
 * - no `:` / `/` / `@`.
 *
 * Length is checked separately (below) to keep the regex readable and free of catastrophic
 * backtracking.
 */
const DEFAULT_ALLOW = /^[A-Za-z][A-Za-z0-9 ]*(?:[-'][A-Za-z0-9 ]+)*$/;

/** Inclusive maximum label length (D-5). */
const DEFAULT_MAX_LENGTH = 64;

/** Belt-and-braces denylist — reject if ANY rule trips (D-5). */
const DEFAULT_DENY: readonly LabelDenyRule[] = Object.freeze([
  Object.freeze({ name: 'contains-url-scheme', test: (label: string) => label.includes('://') }),
  Object.freeze({
    name: 'contains-hex-run',
    test: (label: string) => /0x[0-9a-fA-F]{4,}/.test(label),
  }),
  Object.freeze({ name: 'contains-at-sign', test: (label: string) => label.includes('@') }),

  Object.freeze({
    name: 'contains-control-char',
    test: (label: string) => /[\x00-\x1F\x7F]/.test(label),
  }),
  Object.freeze({
    name: 'empty-or-whitespace',
    test: (label: string) => label.trim().length === 0,
  }),
]);

/**
 * The default, widened, defense-in-depth label policy. Deep-frozen (INV-7): the policy,
 * its `deny` array, and each rule are immutable — a mutation attempt throws in strict mode.
 */
export const DEFAULT_LABEL_POLICY: LabelPolicy = Object.freeze({
  allow: DEFAULT_ALLOW,
  maxLength: DEFAULT_MAX_LENGTH,
  deny: DEFAULT_DENY,
});

/**
 * INV-16 primitive: is `label` user-safe under `policy`?
 *
 * Returns a structured verdict (not a bare boolean) so a FAIL message can name the rule
 * that tripped. Checks length, then the allowlist, then each denylist rule in order; the
 * first failing gate names the reason.
 */
export function isUserSafeLabel(
  label: string,
  policy: LabelPolicy = DEFAULT_LABEL_POLICY
): { readonly safe: boolean; readonly reason?: string } {
  if (label.length > policy.maxLength) {
    return { safe: false, reason: `over-length (>${policy.maxLength})` };
  }
  if (!policy.allow.test(label)) {
    return { safe: false, reason: 'allow-mismatch' };
  }
  for (const rule of policy.deny) {
    if (rule.test(label)) {
      return { safe: false, reason: rule.name };
    }
  }
  return { safe: true };
}
