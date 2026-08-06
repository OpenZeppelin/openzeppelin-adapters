/**
 * Invariant-driven unit tests for SF-1 completion-signal helpers.
 *
 * Pure parse/merge/id-preference — no RPC, no chain. Every case names the INV-N it verifies.
 * NON-VACUITY: disagreement and default rows construct the unsafe merge defect and prove it RED,
 * then assert the real helpers GREEN.
 */
import { describe, expect, expectTypeOf, it } from 'vitest';

import type {
  ExecutionConfig,
  RelayerExecutionConfig,
  WriteCompletion,
  WriteCompletionOptions,
} from '@openzeppelin/ui-types';

import {
  parseSignAndBroadcastResult,
  preferSubmissionId,
  readOptionsCompletion,
  resolveWriteCompletion,
  WriteCompletionDisagreementError,
  type WriteExecutionResult,
} from '../completion';

/** Pre-fix / unsafe merge: "either says submitted ⇒ submitted" (Specify Rev 1 forbid). */
function unsafePreferSubmittedMerge(input: {
  optionsCompletion?: WriteCompletion;
  resultCompletion?: WriteCompletion;
}): WriteCompletion {
  if (input.optionsCompletion === 'submitted' || input.resultCompletion === 'submitted') {
    return 'submitted';
  }
  return input.optionsCompletion ?? input.resultCompletion ?? 'confirmed';
}

const PLACEHOLDER_TX = '0x0000000000000000000000000000000000000000000000000000000000000000';
const RELAYER_TX_ID = 'relayer-tx-abc-123';

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

describe('Request/Response — resolveWriteCompletion (INV-4)', () => {
  it.each([
    {
      name: 'both absent → confirmed',
      optionsCompletion: undefined,
      resultCompletion: undefined,
      expected: 'confirmed' as const,
    },
    {
      name: 'both confirmed → confirmed',
      optionsCompletion: 'confirmed' as const,
      resultCompletion: 'confirmed' as const,
      expected: 'confirmed' as const,
    },
    {
      name: 'both submitted → submitted',
      optionsCompletion: 'submitted' as const,
      resultCompletion: 'submitted' as const,
      expected: 'submitted' as const,
    },
    {
      name: 'options submitted, result absent → submitted',
      optionsCompletion: 'submitted' as const,
      resultCompletion: undefined,
      expected: 'submitted' as const,
    },
    {
      name: 'options absent, result submitted → submitted',
      optionsCompletion: undefined,
      resultCompletion: 'submitted' as const,
      expected: 'submitted' as const,
    },
    {
      name: 'options confirmed, result absent → confirmed',
      optionsCompletion: 'confirmed' as const,
      resultCompletion: undefined,
      expected: 'confirmed' as const,
    },
    {
      name: 'options absent, result confirmed → confirmed',
      optionsCompletion: undefined,
      resultCompletion: 'confirmed' as const,
      expected: 'confirmed' as const,
    },
  ])('INV-4 happy/boundary: $name', ({ optionsCompletion, resultCompletion, expected }) => {
    expect(
      resolveWriteCompletion({ optionsCompletion, resultCompletion }),
      `INV-4 violated: expected ${expected} for options=${String(optionsCompletion)} result=${String(resultCompletion)}`
    ).toBe(expected);
  });

  it('INV-4 NON-VACUITY: unsafe either-submitted merge wrongly skips confirmed on disagree A', () => {
    const input = {
      optionsCompletion: 'confirmed' as const,
      resultCompletion: 'submitted' as const,
    };
    expect(
      unsafePreferSubmittedMerge(input),
      'NON-VACUITY defect must prefer submitted (RED construction)'
    ).toBe('submitted');
    expect(
      () => resolveWriteCompletion(input),
      'INV-4/9: real resolve must THROW, not take submit-only'
    ).toThrow(WriteCompletionDisagreementError);
  });

  it('INV-4 NON-VACUITY: unsafe either-submitted merge wrongly skips confirmed on disagree B', () => {
    const input = {
      optionsCompletion: 'submitted' as const,
      resultCompletion: 'confirmed' as const,
    };
    expect(unsafePreferSubmittedMerge(input)).toBe('submitted');
    expect(() => resolveWriteCompletion(input)).toThrow(WriteCompletionDisagreementError);
  });
});

describe('Request/Response — preferSubmissionId (INV-5)', () => {
  it('INV-5 happy: submit-only + non-empty relayerTxId prefers relayer id over placeholder txHash', () => {
    expect(
      preferSubmissionId({
        completion: 'submitted',
        txHash: PLACEHOLDER_TX,
        relayerTxId: RELAYER_TX_ID,
      }),
      'INV-5 violated: submit-only must prefer relayerTxId when present'
    ).toBe(RELAYER_TX_ID);
  });

  it('INV-5 boundary: confirmed path always uses txHash even when relayerTxId is present', () => {
    expect(
      preferSubmissionId({
        completion: 'confirmed',
        txHash: PLACEHOLDER_TX,
        relayerTxId: RELAYER_TX_ID,
      }),
      'INV-5 violated: confirmed path must stay byte-identical on txHash'
    ).toBe(PLACEHOLDER_TX);
  });

  it('INV-5 failure: empty relayerTxId falls back to txHash under submit-only', () => {
    expect(
      preferSubmissionId({
        completion: 'submitted',
        txHash: PLACEHOLDER_TX,
        relayerTxId: '',
      })
    ).toBe(PLACEHOLDER_TX);
  });

  it('INV-5 failure: absent relayerTxId falls back to txHash under submit-only', () => {
    expect(
      preferSubmissionId({
        completion: 'submitted',
        txHash: PLACEHOLDER_TX,
      })
    ).toBe(PLACEHOLDER_TX);
  });
});

describe('Request/Response — readOptionsCompletion (INV-6)', () => {
  it('INV-6 happy: top-level relayer completion: submitted is honored', () => {
    expect(readOptionsCompletion(relayerConfig({ completion: 'submitted' }))).toBe('submitted');
  });

  it('INV-6 boundary: nested-only plugin bag without top-level completion → absent', () => {
    const config = relayerConfig({
      tokenizedDeposit: { completion: 'submitted' },
    } as WriteCompletionOptions & Record<string, unknown>);
    expect(
      readOptionsCompletion(config),
      'INV-6 violated: nested plugin keys must never be read'
    ).toBeUndefined();
  });

  it('INV-6 failure: non-relayer config ignores any transactionOptions bag', () => {
    const eoa = {
      method: 'eoa',
      transactionOptions: { completion: 'submitted' },
    } as unknown as ExecutionConfig;
    expect(readOptionsCompletion(eoa)).toBeUndefined();
  });

  it('INV-6 happy: top-level confirmed is honored', () => {
    expect(readOptionsCompletion(relayerConfig({ completion: 'confirmed' }))).toBe('confirmed');
  });
});

describe('Error Semantics — invalid enum → absent (INV-8)', () => {
  it.each([
    ['async', 'string outside enum'],
    [1, 'number'],
    [true, 'boolean'],
    [null, 'null completion'],
    // Both tuple members are declared: `it.each` over `as const` rows types the callback as
    // receiving the whole row, so omitting `_label` is a type error.
  ] as const)('INV-8 parse: completion=%j (%s) → absent meta', (completion, _label) => {
    expect(parseSignAndBroadcastResult({ completion, relayerTxId: RELAYER_TX_ID })).toEqual({
      relayerTxId: RELAYER_TX_ID,
    });
  });

  it('INV-8 parse: non-object result → empty meta', () => {
    expect(parseSignAndBroadcastResult(null)).toEqual({});
    expect(parseSignAndBroadcastResult('submitted')).toEqual({});
    expect(parseSignAndBroadcastResult(undefined)).toEqual({});
  });

  it('INV-8 options: invalid completion string → absent (never coerce to submitted)', () => {
    const config = relayerConfig({
      completion: 'async',
    } as unknown as WriteCompletionOptions & Record<string, unknown>);
    expect(readOptionsCompletion(config)).toBeUndefined();
    expect(
      resolveWriteCompletion({
        optionsCompletion: readOptionsCompletion(config),
        resultCompletion: undefined,
      }),
      'INV-8 violated: garbage must default to confirmed, never submitted'
    ).toBe('confirmed');
  });

  it('INV-8: other source still supplies valid signal when one side is garbage', () => {
    expect(
      resolveWriteCompletion({
        optionsCompletion: undefined,
        resultCompletion: parseSignAndBroadcastResult({ completion: 'submitted' }).completion,
      })
    ).toBe('submitted');
  });
});

describe('Error Semantics — disagreement THROW both directions (INV-9, INV-10, INV-11)', () => {
  it('INV-9: options confirmed + result submitted → WriteCompletionDisagreementError', () => {
    try {
      resolveWriteCompletion({
        optionsCompletion: 'confirmed',
        resultCompletion: 'submitted',
      });
      expect.fail('INV-9 violated: expected THROW, got return');
    } catch (error) {
      expect(error).toBeInstanceOf(WriteCompletionDisagreementError);
      const e = error as WriteCompletionDisagreementError;
      expect(e.code).toBe('WRITE_COMPLETION_DISAGREEMENT');
      expect(e.optionsCompletion).toBe('confirmed');
      expect(e.resultCompletion).toBe('submitted');
      expect(e.name).toBe('WriteCompletionDisagreementError');
    }
  });

  it('INV-10: options submitted + result confirmed → WriteCompletionDisagreementError (dedicated direction)', () => {
    try {
      resolveWriteCompletion({
        optionsCompletion: 'submitted',
        resultCompletion: 'confirmed',
      });
      expect.fail('INV-10 violated: expected THROW for reverse direction');
    } catch (error) {
      expect(error).toBeInstanceOf(WriteCompletionDisagreementError);
      const e = error as WriteCompletionDisagreementError;
      expect(e.code).toBe('WRITE_COMPLETION_DISAGREEMENT');
      expect(e.optionsCompletion).toBe('submitted');
      expect(e.resultCompletion).toBe('confirmed');
    }
  });

  it('INV-11 / INV-19: disagreement error exposes enums only — not IdentityOperationFailed shape', () => {
    const err = new WriteCompletionDisagreementError('confirmed', 'submitted');
    expect(err.code).toBe('WRITE_COMPLETION_DISAGREEMENT');
    expect(err.code).not.toBe('IRS_OPERATION_FAILED');
    expect(err.message).toContain('confirmed');
    expect(err.message).toContain('submitted');
    expect(err.message).not.toMatch(/serviceUrl|apiKey|runtimeApiKey|0x[a-fA-F0-9]{40}/);
  });
});

describe('Idempotency & Retry (INV-12, INV-13)', () => {
  it('INV-12: identical signal pairs always yield the same outcome (pure)', () => {
    const rows: Array<{
      optionsCompletion?: WriteCompletion;
      resultCompletion?: WriteCompletion;
    }> = [
      {},
      { optionsCompletion: 'submitted' },
      { resultCompletion: 'submitted' },
      { optionsCompletion: 'confirmed', resultCompletion: 'confirmed' },
      { optionsCompletion: 'submitted', resultCompletion: 'submitted' },
    ];
    for (const row of rows) {
      expect(resolveWriteCompletion(row)).toBe(resolveWriteCompletion(row));
    }
  });

  it('INV-12: disagreement throws twice with the same class/code', () => {
    const input = {
      optionsCompletion: 'confirmed' as const,
      resultCompletion: 'submitted' as const,
    };
    for (let i = 0; i < 2; i++) {
      expect(() => resolveWriteCompletion(input)).toThrow(WriteCompletionDisagreementError);
    }
  });

  it.each([
    {
      name: 'options-only submitted',
      optionsCompletion: 'submitted' as const,
      resultCompletion: undefined,
      expected: 'submitted' as const,
    },
    {
      name: 'result-only submitted',
      optionsCompletion: undefined,
      resultCompletion: 'submitted' as const,
      expected: 'submitted' as const,
    },
    {
      name: 'options-only confirmed',
      optionsCompletion: 'confirmed' as const,
      resultCompletion: undefined,
      expected: 'confirmed' as const,
    },
    {
      name: 'result-only confirmed',
      optionsCompletion: undefined,
      resultCompletion: 'confirmed' as const,
      expected: 'confirmed' as const,
    },
  ])(
    'INV-13: exactly-one signal stable across double invoke — $name',
    ({ optionsCompletion, resultCompletion, expected }) => {
      const first = resolveWriteCompletion({ optionsCompletion, resultCompletion });
      const second = resolveWriteCompletion({ optionsCompletion, resultCompletion });
      expect(first).toBe(expected);
      expect(second).toBe(expected);
    }
  );
});

describe('Side-effect purity & sensitive data (INV-16, INV-18, INV-20)', () => {
  it('INV-16 / INV-18: helpers accept oversized result bags and only read known keys (O(1))', () => {
    const fat: Record<string, unknown> = { completion: 'submitted', relayerTxId: RELAYER_TX_ID };
    for (let i = 0; i < 500; i++) {
      fat[`pluginKey${i}`] = { nested: { completion: 'confirmed', secret: `leak-${i}` } };
    }
    expect(parseSignAndBroadcastResult(fat)).toEqual({
      completion: 'submitted',
      relayerTxId: RELAYER_TX_ID,
    });
  });

  it('INV-20: WriteExecutionResult shape has only id + completion (no onchainId)', () => {
    expectTypeOf<WriteExecutionResult>().toMatchTypeOf<{
      readonly id: string;
      readonly completion: WriteCompletion;
    }>();
    type Forbidden = keyof WriteExecutionResult & 'onchainId';
    expectTypeOf<Forbidden>().toEqualTypeOf<never>();
  });
});

describe('Vocabulary / type contract (INV-1, INV-2)', () => {
  it('INV-1: WriteCompletion resolves from @openzeppelin/ui-types as submitted | confirmed', () => {
    expectTypeOf<WriteCompletion>().toEqualTypeOf<'submitted' | 'confirmed'>();
  });

  it('INV-2: WriteCompletionOptions known keys compile; residual passthrough accepted on RelayerExecutionConfig', () => {
    const options: WriteCompletionOptions & Record<string, unknown> = {
      completion: 'submitted',
      onSubmitted: async () => {},
      gasPrice: '1',
    };
    const config: RelayerExecutionConfig = relayerConfig(options);
    expect(config.transactionOptions?.completion).toBe('submitted');
    expect(config.transactionOptions?.gasPrice).toBe('1');
  });
});
