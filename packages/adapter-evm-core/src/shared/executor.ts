/**
 * Shared capability write skeleton.
 *
 * Every write-capable RI capability service submits assembled calldata through an
 * injected executor and maps failures to a typed `RICapabilityError`. The submit →
 * catch → log → wrap control flow is identical across capabilities; only the
 * error-mapping policy differs (IRS wraps everything as `IdentityOperationFailed`,
 * ERC-3643 decodes reverts into `RecipientNotVerified` / `ComplianceModuleRejected` / …).
 *
 * This module owns that shared skeleton and the executor type, so services depend
 * sideways on `shared/` rather than on the factory layer.
 *
 * @module shared/executor
 */

import type { ExecutionConfig, TransactionStatusUpdate, TxStatus } from '@openzeppelin/ui-types';
import { logger } from '@openzeppelin/ui-utils';

import type { WriteContractParameters } from '../types';
import { WriteCompletionDisagreementError, type WriteExecutionResult } from './completion';

const LOG_SYSTEM = 'CapabilityWrite';

/**
 * Executor shape consumed by capability services: assembled calldata in, a
 * {@link WriteExecutionResult} out. Implemented by adapting the injected `signAndBroadcast`.
 */
export type CapabilityExecutor = (
  txData: WriteContractParameters,
  executionConfig: ExecutionConfig,
  onStatusChange?: (status: TxStatus, details: TransactionStatusUpdate) => void,
  runtimeApiKey?: string
) => Promise<WriteExecutionResult>;

/**
 * Maps a raw execution failure to the typed error a capability should throw.
 *
 * Receives the operation name and target contract address for context so each
 * capability can produce specific, actionable errors.
 */
export type WriteErrorMapper = (error: Error, operation: string, contractAddress?: string) => Error;

/**
 * Run a capability write: submit `action` via `executor`, returning its
 * {@link WriteExecutionResult}; on failure, log and rethrow the result of `mapError`.
 *
 * {@link WriteCompletionDisagreementError} is rethrown unchanged (INV-11) so IRS
 * (and other) mappers never wrap a wiring bug as an identity-domain failure.
 *
 * Centralizes the shared control flow so each capability only supplies its
 * error-mapping policy.
 */
export async function runCapabilityWrite(
  params: {
    operation: string;
    action: WriteContractParameters;
    executor: CapabilityExecutor;
    executionConfig: ExecutionConfig;
    onStatusChange?: (status: TxStatus, details: TransactionStatusUpdate) => void;
    runtimeApiKey?: string;
  },
  mapError: WriteErrorMapper
): Promise<WriteExecutionResult> {
  const { operation, action, executor, executionConfig, onStatusChange, runtimeApiKey } = params;

  try {
    return await executor(action, executionConfig, onStatusChange, runtimeApiKey);
  } catch (error) {
    // INV-11: disagreement is a cross-capability wiring bug — never map to IdentityOperationFailed
    if (error instanceof WriteCompletionDisagreementError) {
      throw error;
    }
    logger.error(LOG_SYSTEM, `${operation} failed:`, error);
    throw mapError(error as Error, operation, action.address);
  }
}
