/**
 * SF-4 example — passthrough wire honesty under submit-only.
 *
 * Type-shape demo only: no live Relayer / RPC. Requires linked
 * @openzeppelin/ui-types@3.5.0 and adapters on 004-irs-submit-only-completion.
 */
import type {
  OnboardingClaim,
  OperationResult,
  RelayerExecutionConfig,
} from '@openzeppelin/ui-types';

/** Minimal stand-in for createIRS().attachClaim / registerIdentity return. */
type IdOnlyWrite = (
  input: unknown,
  executionConfig: RelayerExecutionConfig
) => Promise<OperationResult>;

export async function attachThenRegister(
  attachClaim: IdOnlyWrite,
  registerIdentity: IdOnlyWrite,
  onchainId: `0x${string}`,
  claim: OnboardingClaim,
  holder: `0x${string}`,
  base: Omit<RelayerExecutionConfig, 'transactionOptions'>
): Promise<{ attachedId: string; registeredId: string }> {
  const submitted: RelayerExecutionConfig = {
    ...base,
    transactionOptions: { completion: 'submitted' },
  };

  const attached: OperationResult = await attachClaim({ onchainId, claim }, submitted);
  // MECHANISM: exact { id } — no completion excess property on the public wire
  const attachedId: string = attached.id;
  assertNoCompletion(attached);

  const registered: OperationResult = await registerIdentity({ holder, onchainId }, submitted);
  const registeredId: string = registered.id;
  assertNoCompletion(registered);

  return { attachedId, registeredId };
}

function assertNoCompletion(result: OperationResult): void {
  if ('completion' in result) {
    throw new Error(
      'SF-4 strip violated: passthrough write leaked completion onto OperationResult'
    );
  }
}
