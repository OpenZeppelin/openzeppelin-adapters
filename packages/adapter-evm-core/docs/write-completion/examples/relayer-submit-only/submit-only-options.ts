/**
 * Pattern 1 — top-level typed WriteCompletionOptions (MECHANISM at compile time).
 *
 * Copy into a workspace that resolves `@openzeppelin/ui-types@3.5.0`.
 * This file does not call Relayer or adapters; it locks the option shape.
 */
import type { RelayerExecutionConfig, WriteCompletionOptions } from '@openzeppelin/ui-types';

export function buildSubmitOnlyRelayerConfig(params: {
  serviceUrl: string;
  relayer: RelayerExecutionConfig['relayer'];
  onSubmitted?: (relayerTxId: string) => void | Promise<void>;
}): RelayerExecutionConfig {
  const transactionOptions: WriteCompletionOptions & Record<string, unknown> = {
    completion: 'submitted',
    onSubmitted: params.onSubmitted,
    // residual passthrough keys remain valid:
    // customGasHint: 'fast',
  };

  return {
    method: 'relayer',
    serviceUrl: params.serviceUrl,
    relayer: params.relayer,
    transactionOptions,
  };
}

// Compile-time MECHANISM: invalid completion literals fail typecheck at call sites.
export function assertCompletionLiteralIsChecked(options: WriteCompletionOptions): void {
  if (options.completion === 'submitted' || options.completion === 'confirmed') {
    return;
  }
  // absent completion ≡ confirmed (runtime resolve default)
}
