import type { ResolutionProvenance } from '@openzeppelin/ui-types';

import type { CheckOutcome } from '../internal';
import { isUserSafeLabel } from '../label-policy';
import type { LabelPolicy } from '../types';

/**
 * UIKit INV-16 — `provenance.label` is user-safe.
 *
 * On a realized `{ok:true}` value (either direction), runs the policy over
 * `value.provenance.label`; a `safe:false` verdict FAILs, naming the rule that tripped.
 * Thin delegation to {@link isUserSafeLabel} keeps the policy engine the single source of truth.
 */
export function checkLabel(provenance: ResolutionProvenance, policy: LabelPolicy): CheckOutcome {
  const label = provenance.label;
  const verdict = isUserSafeLabel(label, policy);
  if (verdict.safe) {
    return { status: 'PASS', message: `label ${JSON.stringify(label)} is user-safe` };
  }
  return {
    status: 'FAIL',
    message: `label ${JSON.stringify(label)} is not user-safe — ${verdict.reason ?? 'rejected'}`,
  };
}
