/**
 * Write-completion signal detection for capability executors.
 *
 * Pure parse/merge/id-preference helpers plus the fail-closed disagreement error.
 * Consumed by {@link adaptSignAndBroadcast}; SF-2/SF-3 read `WriteExecutionResult.completion`.
 *
 * @module shared/completion
 */

import type { ExecutionConfig, OperationResult, WriteCompletion } from '@openzeppelin/ui-types';

/**
 * Strategy-carried metadata parsed from SignAndBroadcast `result`.
 * Only `relayerTxId` is accepted as the submission-id field (no aliases in SF-1).
 */
export interface SignAndBroadcastResultMeta {
  readonly completion?: WriteCompletion;
  readonly relayerTxId?: string;
}

/**
 * Executor-facing write result. Structurally extends {@link OperationResult} so
 * confirmed-path callers that only read `.id` remain valid.
 * `completion` is always set (default `'confirmed'` when both signals absent).
 */
export interface WriteExecutionResult extends OperationResult {
  readonly completion: WriteCompletion;
}

export interface ResolveWriteCompletionInput {
  readonly optionsCompletion?: WriteCompletion;
  readonly resultCompletion?: WriteCompletion;
  /**
   * Submission ids for diagnostics only — they never affect the merge outcome, they are
   * attached to {@link WriteCompletionDisagreementError} so an operator can correlate a
   * fail-closed wiring bug with the actual transaction. Optional: callers that only exercise
   * the truth table may omit them.
   */
  readonly txHash?: string;
  readonly relayerTxId?: string;
}

/** Diagnostic ids carried by {@link WriteCompletionDisagreementError}. */
export interface WriteCompletionDisagreementIds {
  readonly txHash?: string;
  readonly relayerTxId?: string;
}

/**
 * Fail-closed wiring bug: `transactionOptions.completion` and SignAndBroadcast
 * `result.completion` disagree. Shared across capabilities — not
 * `IdentityOperationFailed` (IRS-domain).
 *
 * Because the write has already been submitted by the time the disagreement is detected, the
 * error carries whatever submission ids were available (`txHash` / `relayerTxId`). Without them
 * a caller sees a thrown error with no way to find the transaction it belongs to.
 */
export class WriteCompletionDisagreementError extends Error {
  readonly code = 'WRITE_COMPLETION_DISAGREEMENT' as const;

  /** Tx hash reported by the strategy, when known. */
  readonly txHash: string | undefined;

  /** Relayer submission id reported by the strategy, when known. */
  readonly relayerTxId: string | undefined;

  constructor(
    readonly optionsCompletion: WriteCompletion | undefined,
    readonly resultCompletion: WriteCompletion | undefined,
    ids: WriteCompletionDisagreementIds = {}
  ) {
    const idSuffix = [
      ids.txHash !== undefined ? ` txHash=${ids.txHash}` : '',
      ids.relayerTxId !== undefined ? ` relayerTxId=${ids.relayerTxId}` : '',
    ].join('');
    super(
      `Write completion signals disagree: options=${String(optionsCompletion)} result=${String(resultCompletion)}${idSuffix}`
    );
    this.name = 'WriteCompletionDisagreementError';
    this.txHash = ids.txHash;
    this.relayerTxId = ids.relayerTxId;
  }
}

const WRITE_COMPLETIONS = new Set<WriteCompletion>(['submitted', 'confirmed']);

function asWriteCompletion(value: unknown): WriteCompletion | undefined {
  // INV-8: invalid / non-enum → absent (never coerce to 'submitted')
  if (typeof value === 'string' && WRITE_COMPLETIONS.has(value as WriteCompletion)) {
    return value as WriteCompletion;
  }
  return undefined;
}

/**
 * Merge dual completion signals per locked truth table.
 *
 * @throws {WriteCompletionDisagreementError} when options and result disagree
 *         (either direction: confirmed↔submitted). // INV-9, INV-10
 */
export function resolveWriteCompletion(input: ResolveWriteCompletionInput): WriteCompletion {
  const { optionsCompletion, resultCompletion, txHash, relayerTxId } = input;

  // INV-9 / INV-10: disagreement either direction → THROW (fail closed)
  if (
    optionsCompletion !== undefined &&
    resultCompletion !== undefined &&
    optionsCompletion !== resultCompletion
  ) {
    throw new WriteCompletionDisagreementError(optionsCompletion, resultCompletion, {
      ...(txHash !== undefined ? { txHash } : {}),
      ...(relayerTxId !== undefined ? { relayerTxId } : {}),
    });
  }

  // INV-4: exactly one present → honor it; both absent → confirmed; both agree → that value
  return optionsCompletion ?? resultCompletion ?? 'confirmed';
}

/**
 * Read top-level `transactionOptions.completion` when executionConfig is relayer
 * and the value is `'submitted' | 'confirmed'`. Ignores nested plugin namespaces.
 * Non-relayer configs → undefined.
 */
export function readOptionsCompletion(
  executionConfig: ExecutionConfig
): WriteCompletion | undefined {
  // INV-6: top-level relayer options only
  if (executionConfig.method !== 'relayer') {
    return undefined;
  }
  const options = executionConfig.transactionOptions;
  if (options === undefined || typeof options !== 'object' || options === null) {
    return undefined;
  }
  return asWriteCompletion(options.completion);
}

/**
 * Narrow unknown SignAndBroadcast.result into typed meta.
 * Accepts only object shapes; unknown keys ignored; invalid completion strings ignored
 * (treated as absent — do not invent 'submitted').
 */
export function parseSignAndBroadcastResult(result: unknown): SignAndBroadcastResultMeta {
  // INV-8: non-object → empty meta
  if (typeof result !== 'object' || result === null) {
    return {};
  }
  const record = result as Record<string, unknown>;
  const completion = asWriteCompletion(record.completion);
  const relayerTxId =
    typeof record.relayerTxId === 'string' && record.relayerTxId.length > 0
      ? record.relayerTxId
      : undefined;
  return {
    ...(completion !== undefined ? { completion } : {}),
    ...(relayerTxId !== undefined ? { relayerTxId } : {}),
  };
}

/**
 * Choose OperationResult.id: when completion === 'submitted' and relayerTxId is a
 * non-empty string, return relayerTxId; otherwise return txHash.
 */
export function preferSubmissionId(params: {
  completion: WriteCompletion;
  txHash: string;
  relayerTxId?: string;
}): string {
  // INV-5: prefer non-empty relayerTxId on submit-only only
  if (
    params.completion === 'submitted' &&
    params.relayerTxId !== undefined &&
    params.relayerTxId.length > 0
  ) {
    return params.relayerTxId;
  }
  return params.txHash;
}
