/**
 * SF-5 example — read_failed stays ambiguous.
 *
 * Type-shape demo only. Never invent already-onboarded or lacks from a
 * generic IRS_OPERATION_FAILED after a failed key-purpose / factory probe.
 */
import { IdentityAlreadyRegistered, IdentityOperationFailed } from '@openzeppelin/ui-types';

export type FidelityClass = 'already_onboarded' | 'ambiguous_generic' | 'unknown';

/**
 * Classify adapter errors for saga branching.
 *
 * MECHANISM (adapter): read_failed → IdentityOperationFailed, no submit.
 * CONVENTION (host): whether/when to retry the probe after RPC recovers.
 */
export function classifyFidelityError(e: unknown): FidelityClass {
  if (e instanceof IdentityAlreadyRegistered) {
    return 'already_onboarded';
  }
  if (e instanceof IdentityOperationFailed) {
    // Do NOT parse message text into ALREADY_ONBOARDED
    return 'ambiguous_generic';
  }
  return 'unknown';
}

/** Anti-pattern — documented so callers never ship it. */
export function wronglyPromoteToAlreadyOnboarded(e: unknown): boolean {
  // WRONG: message sniffing or "any grant failure means done"
  void e;
  return false;
}
