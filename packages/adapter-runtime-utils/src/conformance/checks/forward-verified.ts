import type { ResolvedName } from '@openzeppelin/ui-types';

import { safeJsonHint, type CheckOutcome } from '../internal';

/**
 * UIKit INV-6 — `forwardVerified` is a concrete boolean.
 *
 * Reverse direction only, on a realized `{ok:true}` value. Asserts ONLY that
 * `forwardVerified` is a concrete `boolean` (`true` OR `false` both PASS) — a missing key,
 * `undefined`, or any non-boolean FAILs. Uses `typeof`, never truthiness, so a legitimate
 * `false` is not misread as "missing". The harness does NOT re-assert SF-3's constant-`true`
 * property; that is the adapter's own contract.
 */
export function checkForwardVerified(value: ResolvedName): CheckOutcome {
  const observed: unknown = value.forwardVerified;
  if (typeof observed === 'boolean') {
    return { status: 'PASS', message: `forwardVerified is a concrete boolean (${observed})` };
  }
  return {
    status: 'FAIL',
    message: `forwardVerified must be a concrete boolean, got ${typeof observed} (${safeJsonHint(observed)})`,
  };
}
