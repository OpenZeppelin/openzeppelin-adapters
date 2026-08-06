/**
 * Pattern 1 — deployOnchainId submit-only narrowing (MECHANISM: no onchainId on arm).
 *
 * Copy into a workspace that resolves `@openzeppelin/ui-types@3.5.0` and
 * `@openzeppelin/adapter-evm-core` with SF-2 outcome types.
 * This file does not call Relayer or deploy on-chain; it locks the return shape.
 */
import type {
  DeployOnchainIdOutcome,
  DeployOnchainIdSubmittedResult,
} from '@openzeppelin/adapter-evm-core';
import type { RelayerExecutionConfig, WriteCompletionOptions } from '@openzeppelin/ui-types';

export function buildDeploySubmitOnlyConfig(params: {
  serviceUrl: string;
  relayer: RelayerExecutionConfig['relayer'];
}): RelayerExecutionConfig {
  const transactionOptions: WriteCompletionOptions & Record<string, unknown> = {
    completion: 'submitted',
  };

  return {
    method: 'relayer',
    serviceUrl: params.serviceUrl,
    relayer: params.relayer,
    transactionOptions,
  };
}

/** Handle a deploy outcome after the capability call returns. */
export function handleDeployOutcome(outcome: DeployOnchainIdOutcome): {
  mode: 'submitted' | 'confirmed';
  id: string;
  onchainId?: string;
} {
  if (outcome.completion === 'submitted') {
    assertSubmittedArmHasNoOnchainId(outcome);
    return { mode: 'submitted', id: outcome.id };
  }
  return {
    mode: 'confirmed',
    id: outcome.id,
    onchainId: outcome.onchainId, // string — required on confirmed arm
  };
}

function assertSubmittedArmHasNoOnchainId(outcome: DeployOnchainIdSubmittedResult): void {
  // Compile-time MECHANISM: submit-only arm excludes onchainId.
  // @ts-expect-error — DeployOnchainIdSubmittedResult has no onchainId
  const _forbidden: string | undefined = outcome.onchainId;
  void _forbidden;

  if ('onchainId' in outcome) {
    throw new Error('MECHANISM violated: fabricated onchainId on submit-only arm');
  }
}
