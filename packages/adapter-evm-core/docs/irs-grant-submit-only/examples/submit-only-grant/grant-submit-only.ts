/**
 * Pattern 1 — submit-only grantHolderManagementKey (SF-3).
 *
 * Copy into a workspace that resolves:
 * - `@openzeppelin/ui-types@3.5.0`
 * - `@openzeppelin/adapter-evm-core` (branch with SF-1 + SF-3)
 *
 * This file demonstrates option shape + resume probe typing. It does not
 * call Relayer or RPC unless you wire real `irs` / `executionConfig` values.
 */
import type { EvmIRSCapability } from '@openzeppelin/adapter-evm-core';
import type { RelayerExecutionConfig, WriteCompletionOptions } from '@openzeppelin/ui-types';

/** ERC-734 MANAGEMENT purpose (constant not on package root barrel). */
const IDENTITY_KEY_PURPOSE_MANAGEMENT = 1;

export function buildGrantSubmitOnlyConfig(params: {
  serviceUrl: string;
  relayer: RelayerExecutionConfig['relayer'];
}): RelayerExecutionConfig {
  const transactionOptions: WriteCompletionOptions & Record<string, unknown> = {
    completion: 'submitted',
    // onSubmitted: fire from strategy — adapter will NOT re-invoke (CONVENTION)
  };

  return {
    method: 'relayer',
    serviceUrl: params.serviceUrl,
    relayer: params.relayer,
    transactionOptions,
  };
}

/**
 * Submit-only grant then caller-owned MANAGEMENT probe.
 *
 * MECHANISM: grant returns `{ id }` without asserting key purpose.
 * CONVENTION: when / how often to poll `hasIdentityKeyPurpose` is yours.
 */
export async function grantThenConfirmHolderManagement(params: {
  irs: EvmIRSCapability;
  onchainId: string;
  holder: string;
  executionConfig: RelayerExecutionConfig;
}): Promise<{ submissionId: string; managementPresent: boolean }> {
  const { id } = await params.irs.grantHolderManagementKey(
    { onchainId: params.onchainId, holder: params.holder },
    params.executionConfig
  );

  // Submit-only { id } ≠ MANAGEMENT-present (MECHANISM + docs obligation)
  const probe = await params.irs.hasIdentityKeyPurpose({
    onchainId: params.onchainId,
    address: params.holder,
    purpose: IDENTITY_KEY_PURPOSE_MANAGEMENT,
  });

  return {
    submissionId: id,
    managementPresent: probe.status === 'has',
  };
}
