/**
 * Pattern 2 — confirmed / default grantHolderManagementKey (SF-3 non-regression).
 *
 * MECHANISM: absent / 'confirmed' ⇒ assert holder MANAGEMENT after submit;
 * lacks / RPC fail ⇒ IdentityOperationFailed (byte-identical to pre-SF-3).
 */
import type { EvmIRSCapability } from '@openzeppelin/adapter-evm-core';
import type { RelayerExecutionConfig } from '@openzeppelin/ui-types';
import { IdentityOperationFailed } from '@openzeppelin/ui-types';

export function buildGrantConfirmedConfig(params: {
  serviceUrl: string;
  relayer: RelayerExecutionConfig['relayer'];
}): RelayerExecutionConfig {
  return {
    method: 'relayer',
    serviceUrl: params.serviceUrl,
    relayer: params.relayer,
    // transactionOptions omitted → SF-1 defaults completion to 'confirmed'
  };
}

export async function grantWithConfirmedAssert(params: {
  irs: EvmIRSCapability;
  onchainId: string;
  holder: string;
  executionConfig: RelayerExecutionConfig;
}): Promise<{ id: string }> {
  try {
    const { id } = await params.irs.grantHolderManagementKey(
      { onchainId: params.onchainId, holder: params.holder },
      params.executionConfig
    );
    return { id };
  } catch (error) {
    if (error instanceof IdentityOperationFailed) {
      // Resume using onchainId from the message / error fields — do not
      // confuse with WRITE_COMPLETION_DISAGREEMENT wiring bugs.
      throw error;
    }
    throw error;
  }
}
