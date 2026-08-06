/**
 * SF-5 example — grant already-onboarded recovery.
 *
 * Type-shape demo only: no live Relayer / RPC. Requires
 * @openzeppelin/ui-types with IdentityAlreadyRegistered.
 */
import {
  IdentityAlreadyRegistered,
  IdentityOperationFailed,
  type OperationResult,
  type RelayerExecutionConfig,
} from '@openzeppelin/ui-types';

type GrantFn = (
  input: { onchainId: string; holder: string },
  executionConfig: RelayerExecutionConfig
) => Promise<OperationResult>;

export type GrantRecovery =
  | { kind: 'submitted'; id: string }
  | { kind: 'already_onboarded'; holder: string; onchainId?: string }
  | { kind: 'ambiguous_or_failed'; error: IdentityOperationFailed };

/**
 * Re-drive-safe grant: specific already-onboarded vs ambiguous generic.
 * MECHANISM: adapter throws IdentityAlreadyRegistered before execute when
 * key-purpose probe returns `has`.
 */
export async function grantWithRecovery(
  grant: GrantFn,
  onchainId: `0x${string}`,
  holder: `0x${string}`,
  executionConfig: RelayerExecutionConfig
): Promise<GrantRecovery> {
  try {
    const { id } = await grant({ onchainId, holder }, executionConfig);
    return { kind: 'submitted', id };
  } catch (e) {
    if (e instanceof IdentityAlreadyRegistered) {
      // code === 'ALREADY_ONBOARDED' — dig maps to conflict / finished
      return {
        kind: 'already_onboarded',
        holder: e.holder,
        onchainId: e.onchainId,
      };
    }
    if (e instanceof IdentityOperationFailed) {
      // Includes pre-submit read_failed (no tx) — not already-onboarded
      return { kind: 'ambiguous_or_failed', error: e };
    }
    throw e;
  }
}
