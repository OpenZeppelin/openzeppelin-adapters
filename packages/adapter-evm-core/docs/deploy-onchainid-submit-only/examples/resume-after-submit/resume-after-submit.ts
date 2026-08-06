/**
 * Pattern 3 — caller-owned resume after submit-only deploy (no CREATE2 fabrication).
 *
 * Copy into a workspace with `@openzeppelin/adapter-evm-core`. Demonstrates the
 * FactoryIdentityLookup discriminated union; does not hit RPC.
 */
import type { FactoryIdentityLookup } from '@openzeppelin/adapter-evm-core/irs';

export type ResumeDecision =
  | { action: 'proceed'; onchainId: string }
  | { action: 'keep_polling' }
  | { action: 'retry_read'; cause: Error };

/**
 * Map a factory lookup to saga next steps.
 *
 * - found → use the real onchainId from the factory
 * - not_found → still pending or failed; keep polling (do not invent an address)
 * - read_failed → RPC broke; opposite safety from not_found — do not redeploy blind
 */
export function decideResume(lookup: FactoryIdentityLookup): ResumeDecision {
  switch (lookup.status) {
    case 'found':
      return { action: 'proceed', onchainId: lookup.onchainId };
    case 'not_found':
      return { action: 'keep_polling' };
    case 'read_failed':
      return { action: 'retry_read', cause: lookup.cause };
  }
}

/** Illustrative async wrapper matching EvmIRSCapability.getFactoryIdentity. */
export async function resumeAfterSubmitOnly(params: {
  getFactoryIdentity: (holder: string) => Promise<FactoryIdentityLookup>;
  holder: string;
}): Promise<ResumeDecision> {
  const lookup = await params.getFactoryIdentity(params.holder);
  return decideResume(lookup);
}
