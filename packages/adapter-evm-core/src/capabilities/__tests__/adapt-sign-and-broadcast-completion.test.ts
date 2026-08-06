/**
 * SF-1 choke-point tests: adaptSignAndBroadcast + runCapabilityWrite.
 *
 * Covers INV-3, INV-7, INV-11 (through mapper), INV-14, INV-15, INV-19, INV-21, INV-22.
 * NON-VACUITY: constructs the pre-fix result-strip defect (RED), then asserts real adapt (GREEN).
 *
 * SF-1 INV-17 (blanket forbid of `completion === 'submitted'` in `irs/service.ts`) was retired by
 * SF-3 INV-16: grant/deploy early-returns are method-level (see irs.onboard-management-keys /
 * deploy suites). Source-scan residual dropped — SF-2 Code is on this branch.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import type {
  DeployOnchainIdResult,
  ExecutionConfig,
  RelayerExecutionConfig,
  WriteCompletion,
} from '@openzeppelin/ui-types';
import { IdentityOperationFailed } from '@openzeppelin/ui-types';

import { runCapabilityWrite, type CapabilityExecutor } from '../../shared/executor';
import {
  adaptSignAndBroadcast,
  WriteCompletionDisagreementError,
  type SignAndBroadcast,
  type WriteExecutionResult,
} from '../helpers';

const PLACEHOLDER_TX = '0x0000000000000000000000000000000000000000000000000000000000000000';
const REAL_TX = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const RELAYER_TX_ID = 'relayer-sub-42';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORE_SRC_ROOT = join(__dirname, '../..');

function relayerConfig(
  transactionOptions?: RelayerExecutionConfig['transactionOptions']
): RelayerExecutionConfig {
  return {
    method: 'relayer',
    serviceUrl: 'https://relayer.example',
    relayer: {
      relayerId: 'r1',
      name: 'test-relayer',
      address: '0x1111111111111111111111111111111111111111',
      network: 'sepolia',
      paused: false,
    },
    ...(transactionOptions !== undefined ? { transactionOptions } : {}),
  };
}

/** Pre-fix strip at the adapt boundary: discards `result`, returns bare `{ id: txHash }`. */
function stripAdaptSignAndBroadcast(signAndBroadcast: SignAndBroadcast): CapabilityExecutor {
  return async (txData, executionConfig, onStatusChange, runtimeApiKey) => {
    const sab = await signAndBroadcast(
      txData,
      executionConfig,
      onStatusChange ?? (() => {}),
      runtimeApiKey
    );
    // Pre-fix defect: no completion, no relayerTxId preference
    return { id: sab.txHash, completion: 'confirmed' };
  };
}

function mockSab(returnValue: { txHash: string; result?: unknown }): SignAndBroadcast {
  return vi.fn().mockResolvedValue(returnValue);
}

const TX_DATA = {
  address: '0x2222222222222222222222222222222222222222',
  abi: [],
  functionName: 'createIdentity',
  args: [],
} as never;

describe('adaptSignAndBroadcast — Request/Response (INV-3, INV-7)', () => {
  it('INV-3 / INV-7 happy: result-only submitted + relayerTxId → submit-only with preferred id', async () => {
    const sab = mockSab({
      txHash: PLACEHOLDER_TX,
      result: { completion: 'submitted', relayerTxId: RELAYER_TX_ID },
    });
    const executor = adaptSignAndBroadcast(sab);
    const out = await executor(TX_DATA, relayerConfig(), undefined, undefined);
    expect(out, 'INV-3 violated: WriteExecutionResult must carry completion').toEqual({
      id: RELAYER_TX_ID,
      completion: 'submitted',
    });
    expect(out).not.toHaveProperty('onchainId');
  });

  it('INV-3 boundary: both signals absent → confirmed with txHash id (byte-identical default)', async () => {
    const sab = mockSab({ txHash: REAL_TX });
    const out = await adaptSignAndBroadcast(sab)(TX_DATA, relayerConfig(), undefined, undefined);
    expect(out).toEqual({ id: REAL_TX, completion: 'confirmed' });
  });

  it('INV-7 NON-VACUITY: strip defect loses submit-only id preference (RED); real adapt preserves (GREEN)', async () => {
    const sab = mockSab({
      txHash: PLACEHOLDER_TX,
      result: { completion: 'submitted', relayerTxId: RELAYER_TX_ID },
    });
    const stripped = await stripAdaptSignAndBroadcast(sab)(
      TX_DATA,
      relayerConfig(),
      undefined,
      undefined
    );
    expect(
      stripped.id,
      'NON-VACUITY: strip defect must return placeholder txHash (RED construction)'
    ).toBe(PLACEHOLDER_TX);
    expect(stripped.completion).toBe('confirmed');

    const fixed = await adaptSignAndBroadcast(sab)(TX_DATA, relayerConfig(), undefined, undefined);
    expect(fixed, 'INV-7 GREEN: real adapt must preserve result and prefer relayerTxId').toEqual({
      id: RELAYER_TX_ID,
      completion: 'submitted',
    });
  });

  it('INV-7: options-only submitted (no result) → submit-only with txHash id', async () => {
    const sab = mockSab({ txHash: REAL_TX });
    const out = await adaptSignAndBroadcast(sab)(
      TX_DATA,
      relayerConfig({ completion: 'submitted' }),
      undefined,
      undefined
    );
    expect(out).toEqual({ id: REAL_TX, completion: 'submitted' });
  });
});

describe('adaptSignAndBroadcast — Error Semantics via choke point (INV-9, INV-10)', () => {
  it('INV-9 through adapt: options confirmed + result submitted → THROW', async () => {
    const sab = mockSab({
      txHash: REAL_TX,
      result: { completion: 'submitted' },
    });
    await expect(
      adaptSignAndBroadcast(sab)(
        TX_DATA,
        relayerConfig({ completion: 'confirmed' }),
        undefined,
        undefined
      )
    ).rejects.toBeInstanceOf(WriteCompletionDisagreementError);
  });

  it('INV-10 through adapt: options submitted + result confirmed → THROW', async () => {
    const sab = mockSab({
      txHash: REAL_TX,
      result: { completion: 'confirmed' },
    });
    await expect(
      adaptSignAndBroadcast(sab)(
        TX_DATA,
        relayerConfig({ completion: 'submitted' }),
        undefined,
        undefined
      )
    ).rejects.toMatchObject({
      name: 'WriteCompletionDisagreementError',
      code: 'WRITE_COMPLETION_DISAGREEMENT',
      optionsCompletion: 'submitted',
      resultCompletion: 'confirmed',
    });
  });

  it('F5: disagreement carries the submission ids so the failed write is identifiable', async () => {
    const sab = mockSab({
      txHash: REAL_TX,
      result: { completion: 'confirmed', relayerTxId: RELAYER_TX_ID },
    });

    // The write is already submitted when the disagreement is detected, so an error without
    // ids leaves the caller unable to correlate it with the on-chain / relayer transaction.
    const error = await adaptSignAndBroadcast(sab)(
      TX_DATA,
      relayerConfig({ completion: 'submitted' }),
      undefined,
      undefined
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(WriteCompletionDisagreementError);
    expect(error).toMatchObject({ txHash: REAL_TX, relayerTxId: RELAYER_TX_ID });
    expect((error as Error).message).toContain(REAL_TX);
    expect((error as Error).message).toContain(RELAYER_TX_ID);
  });
});

describe('runCapabilityWrite — disagreement never becomes IdentityOperationFailed (INV-11)', () => {
  it('INV-11: mapper that wraps everything as IdentityOperationFailed still rethrows disagreement', async () => {
    const executor: CapabilityExecutor = async () => {
      throw new WriteCompletionDisagreementError('confirmed', 'submitted');
    };
    const mapError = vi.fn(
      (error: Error, operation: string) =>
        new IdentityOperationFailed(error.message, operation, error)
    );

    await expect(
      runCapabilityWrite(
        {
          operation: 'deployOnchainId',
          action: TX_DATA,
          executor,
          executionConfig: relayerConfig() as ExecutionConfig,
        },
        mapError
      )
    ).rejects.toBeInstanceOf(WriteCompletionDisagreementError);

    expect(
      mapError,
      'INV-11 violated: mapError must not be invoked for disagreement'
    ).not.toHaveBeenCalled();
  });

  it('INV-11 boundary: non-disagreement errors still go through mapError', async () => {
    const executor: CapabilityExecutor = async () => {
      throw new Error('rpc down');
    };
    const mapError = vi.fn(
      (error: Error, operation: string) =>
        new IdentityOperationFailed(error.message, operation, error)
    );

    await expect(
      runCapabilityWrite(
        {
          operation: 'deployOnchainId',
          action: TX_DATA,
          executor,
          executionConfig: relayerConfig() as ExecutionConfig,
        },
        mapError
      )
    ).rejects.toBeInstanceOf(IdentityOperationFailed);
    expect(mapError).toHaveBeenCalledOnce();
  });
});

describe('Side-Effect Ordering — onSubmitted non-invocation (INV-15)', () => {
  it('INV-15: adapter never invokes transactionOptions.onSubmitted (CONVENTION asserted)', async () => {
    const onSubmitted = vi.fn();
    const sab = mockSab({
      txHash: PLACEHOLDER_TX,
      result: { completion: 'submitted', relayerTxId: RELAYER_TX_ID },
    });
    await adaptSignAndBroadcast(sab)(
      TX_DATA,
      relayerConfig({ completion: 'submitted', onSubmitted }),
      undefined,
      undefined
    );
    expect(
      onSubmitted,
      'INV-15 violated: adapter must not re-fire onSubmitted'
    ).not.toHaveBeenCalled();
  });
});

describe('Auth / sensitive / SF boundary (INV-14, INV-19, INV-21)', () => {
  it('INV-14: confirmed-path write with no completion options succeeds under existing fixture shape', async () => {
    const sab = mockSab({ txHash: REAL_TX });
    const out = await adaptSignAndBroadcast(sab)(
      TX_DATA,
      { method: 'eoa' } as ExecutionConfig,
      undefined,
      undefined
    );
    expect(out).toEqual({ id: REAL_TX, completion: 'confirmed' });
  });

  it('INV-19: disagreement through adapt does not leak serviceUrl / api key in message', async () => {
    const sab = mockSab({
      txHash: REAL_TX,
      result: { completion: 'submitted' },
    });
    const config = relayerConfig({ completion: 'confirmed' });
    const secretKey = 'super-secret-runtime-api-key-xyz';
    try {
      await adaptSignAndBroadcast(sab)(TX_DATA, config, undefined, secretKey);
      expect.fail('expected disagreement throw');
    } catch (error) {
      expect(error).toBeInstanceOf(WriteCompletionDisagreementError);
      const message = (error as Error).message;
      expect(message).not.toContain(config.serviceUrl);
      expect(message).not.toContain(secretKey);
      expect(message).not.toContain(config.relayer.relayerId);
    }
  });

  it('INV-21: single adapt choke point — same default id semantics for eoa and relayer absent signals', async () => {
    const sab = mockSab({ txHash: REAL_TX });
    const executor = adaptSignAndBroadcast(sab);
    const eoaOut = await executor(
      TX_DATA,
      { method: 'eoa' } as ExecutionConfig,
      undefined,
      undefined
    );
    const relayerOut = await executor(TX_DATA, relayerConfig(), undefined, undefined);
    expect(eoaOut).toEqual(relayerOut);
    expect(eoaOut).toEqual({ id: REAL_TX, completion: 'confirmed' });
  });
});

describe('Vocabulary reuse / no duplicate (INV-1, INV-20, INV-22)', () => {
  it('INV-1 / INV-22: adapter-evm-core src has no local WriteCompletion type alias / module', () => {
    const completionSrc = readFileSync(join(CORE_SRC_ROOT, 'shared/completion.ts'), 'utf8');
    expect(completionSrc).toMatch(/from '@openzeppelin\/ui-types'/);
    expect(completionSrc).not.toMatch(/type WriteCompletion\s*=/);
    expect(completionSrc).not.toMatch(/interface WriteCompletionOptions/);

    // No second vocabulary module under src/
    const walk = (dir: string): string[] => {
      const entries = readdirSync(dir);
      const files: string[] = [];
      for (const entry of entries) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (entry === '__tests__' || entry === 'node_modules' || entry === 'dist') continue;
          files.push(...walk(full));
        } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
          files.push(full);
        }
      }
      return files;
    };
    const offenders = walk(CORE_SRC_ROOT).filter((f) => f.endsWith('write-completion.ts'));
    expect(offenders, 'INV-22: no vendored write-completion.ts under adapter-evm-core').toEqual([]);
  });

  it('INV-20: DeployOnchainIdResult.onchainId remains required (SF-1 must not optionalize)', () => {
    expectTypeOf<DeployOnchainIdResult['onchainId']>().toEqualTypeOf<string>();
    const sample: DeployOnchainIdResult = { id: 'x', onchainId: '0x1' };
    expect(sample.onchainId).toBe('0x1');
    expectTypeOf<WriteExecutionResult>().not.toMatchTypeOf<DeployOnchainIdResult>();
  });

  it('INV-1: WriteCompletion import from ui-types is the single vocabulary', () => {
    expectTypeOf<WriteCompletion>().toEqualTypeOf<'submitted' | 'confirmed'>();
  });
});
