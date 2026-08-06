/**
 * Pattern 2 — strategy early-return carries completion + relayerTxId.
 *
 * Nested plugin option bags (e.g. tokenizedDeposit) stay consumer-owned.
 * Adapter contract is: put signals on SignAndBroadcast `result`.
 */

/** Zero hash used as a non-waitable placeholder by submit-early strategies. */
export const ASYNC_SUBMIT_PLACEHOLDER_TX_HASH =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

export type SubmitOnlySignAndBroadcastReturn = {
  txHash: typeof ASYNC_SUBMIT_PLACEHOLDER_TX_HASH;
  result: {
    completion: 'submitted';
    relayerTxId: string;
  };
};

/**
 * Shape a strategy should return after async Relayer submit when completion
 * is submit-only. Fire `onSubmitted` here if configured — the adapter must not.
 */
export function buildSubmitOnlyStrategyReturn(
  relayerTxId: string
): SubmitOnlySignAndBroadcastReturn {
  if (relayerTxId.length === 0) {
    throw new Error('relayerTxId must be a non-empty string');
  }
  return {
    txHash: ASYNC_SUBMIT_PLACEHOLDER_TX_HASH,
    result: {
      completion: 'submitted',
      relayerTxId,
    },
  };
}

/**
 * Illustrative executor outcome after adaptSignAndBroadcast (SF-1):
 * preferSubmissionId replaces the placeholder with relayerTxId.
 */
export function expectedAdaptedResult(relayerTxId: string): {
  id: string;
  completion: 'submitted';
} {
  const sab = buildSubmitOnlyStrategyReturn(relayerTxId);
  return {
    id: sab.result.relayerTxId,
    completion: 'submitted',
  };
}
