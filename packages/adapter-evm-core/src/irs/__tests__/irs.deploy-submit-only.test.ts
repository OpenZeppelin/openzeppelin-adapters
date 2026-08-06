/**
 * SF-2 deploy-onchainid-submit-only — invariant-driven Vitest suite.
 *
 * Submit-only skips wait → parse → operator MANAGEMENT assert; confirmed path stays
 * byte-identical with required `onchainId` + `completion: 'confirmed'`.
 *
 * NON-VACUITY: constructs the pre-fix always-wait hang (RED), then asserts real
 * `deployOnchainId` GREEN (wait/assert call count === 0 on submit-only).
 *
 * INV ids below refer to SF-2 invariants unless noted.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeEventTopics } from 'viem';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import type { ExecutionConfig, RelayerExecutionConfig } from '@openzeppelin/ui-types';
import { IdentityOperationFailed } from '@openzeppelin/ui-types';
import { logger } from '@openzeppelin/ui-utils';

import {
  WriteCompletionDisagreementError,
  type SignAndBroadcast,
} from '../../capabilities/helpers';
import {
  createIRS,
  type CreateIRSOptions,
  type DeployOnchainIdConfirmedResult,
  type DeployOnchainIdOutcome,
  type DeployOnchainIdSubmittedResult,
  type EvmIRSCapability,
} from '../../capabilities/irs';
import { ID_FACTORY_EVENTS_ABI } from '../abis';

const mockReadContract = vi.fn();
const mockGetTransactionReceipt = vi.fn(() =>
  Promise.reject(new Error('TransactionReceiptNotFoundError: not mined yet'))
);
const mockWaitForTransactionReceipt = vi.fn();

vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem');
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      readContract: mockReadContract,
      getTransactionReceipt: mockGetTransactionReceipt,
      waitForTransactionReceipt: mockWaitForTransactionReceipt,
    })),
    http: vi.fn((url: string) => ({ url, type: 'http' })),
  };
});

const EXEC_CONFIG = { method: 'eoa' } as unknown as ExecutionConfig;

const ADDRESSES = {
  identityRegistry: '0x1111111111111111111111111111111111111111',
  identityFactory: '0x2222222222222222222222222222222222222222',
  trustedIssuersRegistry: '0x3333333333333333333333333333333333333333',
} as const;

const HOLDER = '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa';
const OPERATOR = '0xDD601cb1dDb4471e88C51A5f64A9d54294179142';
const ONCHAINID = '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB';
const ZERO = '0x0000000000000000000000000000000000000000';
const TX_HASH = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
const PLACEHOLDER_TX = '0x0000000000000000000000000000000000000000000000000000000000000000';
const RELAYER_TX_ID = 'relayer-deploy-sub-42';
const RUNTIME_API_KEY = 'super-secret-runtime-api-key-deploy';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVICE_SRC = join(__dirname, '../service.ts');
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

function walletLinkedReceipt() {
  const topics = encodeEventTopics({
    abi: ID_FACTORY_EVENTS_ABI,
    eventName: 'WalletLinked',
    args: { wallet: HOLDER, identity: ONCHAINID },
  });
  return {
    status: 'success' as const,
    logs: [
      {
        address: ADDRESSES.identityFactory,
        topics,
        data: '0x' as const,
        blockHash: '0x0',
        blockNumber: 1n,
        logIndex: 0,
        transactionHash: TX_HASH,
        transactionIndex: 0,
        removed: false,
      },
    ],
  };
}

function makeCapability(signAndBroadcastImpl?: ReturnType<typeof vi.fn>): {
  capability: EvmIRSCapability;
  signAndBroadcast: ReturnType<typeof vi.fn>;
} {
  const signAndBroadcast = signAndBroadcastImpl ?? vi.fn().mockResolvedValue({ txHash: TX_HASH });
  const options: CreateIRSOptions = {
    // Test double: `vi.fn()` is intentionally loosely typed so `.mock.calls` stay inspectable.
    signAndBroadcast: signAndBroadcast as unknown as SignAndBroadcast,
    addresses: { ...ADDRESSES },
    operatorManagementKey: OPERATOR,
  };
  const capability = createIRS(
    {
      id: 'evm-testnet',
      exportConstName: 'evmTestnet',
      name: 'EVM Testnet',
      ecosystem: 'evm',
      network: 'ethereum',
      type: 'testnet',
      isTestnet: true,
      chainId: 11155111,
      rpcUrl: 'https://rpc.example.com',
      nativeCurrency: { name: 'Test Ether', symbol: 'TETH', decimals: 18 },
    } as never,
    options
  );
  return { capability, signAndBroadcast };
}

/** Submit-early strategy: result carries completion + preferred relayer id (SF-1 path). */
function submitOnlySignAndBroadcast(): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({
    txHash: PLACEHOLDER_TX,
    result: { completion: 'submitted', relayerTxId: RELAYER_TX_ID },
  });
}

/**
 * Pre-SF-2 hang defect: ignore `completion` and always wait for receipt.
 * Constructs the ~120s hang / misreport class for NON-VACUITY (RED).
 */
async function hangAlwaysWaitPostExecute(input: {
  completion: 'submitted' | 'confirmed';
  id: string;
  wait: typeof mockWaitForTransactionReceipt;
}): Promise<'waited'> {
  void input.completion; // defect: completion ignored — always wait
  await input.wait({
    hash: input.id as `0x${string}`,
    confirmations: 1,
    timeout: 120_000,
  });
  return 'waited';
}

/** Fixed branch predicate matching INV-1 (exact enum). */
function fixedPostExecuteBranch(completion: 'submitted' | 'confirmed'): 'early' | 'wait' {
  return completion === 'submitted' ? 'early' : 'wait';
}

describe('deployOnchainId — confirmed path non-regression (SF-2)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('INV-3 / INV-4 / INV-14: confirmed return has required onchainId + completion discriminant', async () => {
    mockWaitForTransactionReceipt.mockResolvedValueOnce(walletLinkedReceipt());
    // SF-5: factory not_found, then operator MANAGEMENT assert
    mockReadContract.mockResolvedValueOnce(ZERO).mockResolvedValueOnce(true);
    const { capability } = makeCapability();

    const outcome = await capability.deployOnchainId({ holder: HOLDER }, EXEC_CONFIG);

    expect(outcome).toEqual({
      id: TX_HASH,
      onchainId: ONCHAINID,
      completion: 'confirmed',
    });
    expect(mockWaitForTransactionReceipt).toHaveBeenCalledOnce();
    expect(mockGetTransactionReceipt).not.toHaveBeenCalled();
    expect(mockReadContract).toHaveBeenCalledTimes(2);
  });

  it('INV-8 / INV-20: wait timeout still INDETERMINATE — no guessed onchainId', async () => {
    mockReadContract.mockResolvedValueOnce(ZERO); // SF-5 factory not_found → proceed
    mockWaitForTransactionReceipt.mockRejectedValueOnce(
      new Error('WaitForTransactionReceiptTimeoutError: timed out')
    );
    const { capability } = makeCapability();

    const error = await capability
      .deployOnchainId({ holder: HOLDER }, EXEC_CONFIG)
      .then(() => undefined)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(IdentityOperationFailed);
    const message = (error as Error).message;
    expect(message).toContain('INDETERMINATE');
    expect(message).toContain('MAY STILL LAND');
    expect(message).toMatch(/do NOT retry blind/i);
    expect(message).not.toMatch(/onchainId\s+0x/i);
  });

  it('INV-1 / INV-10: explicit completion confirmed still waits + asserts', async () => {
    mockWaitForTransactionReceipt.mockResolvedValueOnce(walletLinkedReceipt());
    mockReadContract.mockResolvedValueOnce(ZERO).mockResolvedValueOnce(true);
    const { capability, signAndBroadcast } = makeCapability();

    const outcome = await capability.deployOnchainId(
      { holder: HOLDER },
      relayerConfig({ completion: 'confirmed' })
    );

    expect(outcome.completion).toBe('confirmed');
    if (outcome.completion === 'confirmed') {
      expect(outcome.onchainId).toBe(ONCHAINID);
    }
    expect(signAndBroadcast).toHaveBeenCalledOnce();
    expect(mockWaitForTransactionReceipt).toHaveBeenCalledOnce();
    expect(mockReadContract).toHaveBeenCalledTimes(2);
  });

  it('INV-10: two confirmed deploys both wait (no outcome cache / flapping)', async () => {
    mockWaitForTransactionReceipt.mockResolvedValue(walletLinkedReceipt());
    // Each deploy: factory not_found + operator assert
    mockReadContract
      .mockResolvedValueOnce(ZERO)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(ZERO)
      .mockResolvedValueOnce(true);
    const { capability, signAndBroadcast } = makeCapability();

    await capability.deployOnchainId({ holder: HOLDER }, EXEC_CONFIG);
    await capability.deployOnchainId({ holder: HOLDER }, EXEC_CONFIG);

    expect(signAndBroadcast).toHaveBeenCalledTimes(2);
    expect(mockWaitForTransactionReceipt).toHaveBeenCalledTimes(2);
    expect(mockReadContract).toHaveBeenCalledTimes(4);
  });
});

describe('deployOnchainId — submit-only (SF-2)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('INV-1 / INV-13 / INV-18 / INV-21 NON-VACUITY: always-wait hang RED; real deploy GREEN', async () => {
    mockWaitForTransactionReceipt.mockResolvedValue(walletLinkedReceipt());

    await hangAlwaysWaitPostExecute({
      completion: 'submitted',
      id: RELAYER_TX_ID,
      wait: mockWaitForTransactionReceipt,
    });
    expect(
      mockWaitForTransactionReceipt,
      'NON-VACUITY RED: hang defect must wait even when completion === submitted'
    ).toHaveBeenCalledOnce();
    expect(
      fixedPostExecuteBranch('submitted'),
      'NON-VACUITY: fixed predicate must early-return on submitted'
    ).toBe('early');
    expect(fixedPostExecuteBranch('confirmed')).toBe('wait');

    // Confirmed path with poisoned wait proves the hang class is real (would fail).
    mockWaitForTransactionReceipt.mockReset();
    mockWaitForTransactionReceipt.mockRejectedValue(
      new Error('NON-VACUITY: hang — wait must not run on submit-only')
    );
    mockReadContract.mockResolvedValueOnce(ZERO); // SF-5 factory not_found → proceed to wait
    mockReadContract.mockRejectedValue(
      new Error('NON-VACUITY: hang — assert must not run on submit-only')
    );
    const confirmedCap = makeCapability().capability;
    await expect(
      confirmedCap.deployOnchainId({ holder: HOLDER }, EXEC_CONFIG)
    ).rejects.toBeInstanceOf(IdentityOperationFailed);
    expect(
      mockWaitForTransactionReceipt.mock.calls.length,
      'NON-VACUITY RED: confirmed path must invoke waitForTransactionReceipt'
    ).toBeGreaterThan(0);

    // GREEN: real submit-only must not enter wait/parse/assert (SF-5 factory probe may run).
    mockWaitForTransactionReceipt.mockClear();
    mockReadContract.mockClear();
    mockWaitForTransactionReceipt.mockRejectedValue(
      new Error('NON-VACUITY: hang — wait must not run on submit-only')
    );
    mockReadContract.mockResolvedValueOnce(ZERO); // SF-5 pre-submit factory not_found
    mockReadContract.mockRejectedValue(
      new Error('NON-VACUITY: hang — post-submit assert must not run on submit-only')
    );

    const { capability, signAndBroadcast } = makeCapability(submitOnlySignAndBroadcast());
    const outcome = await capability.deployOnchainId({ holder: HOLDER }, relayerConfig());

    expect(
      outcome,
      'INV-2 / INV-5 violated: submit-only must return { id, completion: submitted } with preferred relayer id'
    ).toEqual({ id: RELAYER_TX_ID, completion: 'submitted' });
    expect(outcome).not.toHaveProperty('onchainId');
    expect(
      signAndBroadcast,
      'INV-13: submit-only must still submit createIdentity via execute'
    ).toHaveBeenCalledOnce();
    expect(
      mockWaitForTransactionReceipt,
      'INV-13 / INV-18 / INV-21 NON-VACUITY GREEN: wait must not run on submit-only'
    ).not.toHaveBeenCalled();
    expect(
      mockGetTransactionReceipt,
      'INV-14: submit-only must not use point-in-time getTransactionReceipt either'
    ).not.toHaveBeenCalled();
    expect(
      mockReadContract,
      'SF-5 + SF-2: factory pre-submit once; post-submit keyHasPurpose skipped'
    ).toHaveBeenCalledOnce();
    expect(mockReadContract.mock.calls[0]?.[0]).toMatchObject({ functionName: 'getIdentity' });
  });

  it('INV-1 / INV-13: options-only submitted (result absent) also skips wait/assert', async () => {
    mockWaitForTransactionReceipt.mockRejectedValue(new Error('must not wait'));
    mockReadContract.mockResolvedValueOnce(ZERO); // SF-5 factory not_found
    mockReadContract.mockRejectedValue(new Error('must not post-assert'));
    const { capability, signAndBroadcast } = makeCapability(
      vi.fn().mockResolvedValue({ txHash: TX_HASH })
    );

    const outcome = await capability.deployOnchainId(
      { holder: HOLDER },
      relayerConfig({ completion: 'submitted' })
    );

    expect(outcome).toEqual({ id: TX_HASH, completion: 'submitted' });
    expect(signAndBroadcast).toHaveBeenCalledOnce();
    expect(mockWaitForTransactionReceipt).not.toHaveBeenCalled();
    expect(mockReadContract).toHaveBeenCalledOnce();
  });

  it('INV-2 / INV-4 / INV-7: narrowing submitted arm excludes onchainId; resolves (not rejects)', async () => {
    mockWaitForTransactionReceipt.mockRejectedValue(new Error('must not wait'));
    mockReadContract.mockResolvedValueOnce(ZERO);
    const { capability } = makeCapability(submitOnlySignAndBroadcast());

    const outcome: DeployOnchainIdOutcome = await capability.deployOnchainId(
      { holder: HOLDER },
      relayerConfig()
    );

    expect(outcome.completion).toBe('submitted');
    if (outcome.completion === 'submitted') {
      expectTypeOf(outcome).toEqualTypeOf<DeployOnchainIdSubmittedResult>();
      expect('onchainId' in outcome).toBe(false);
    }
  });

  it('INV-5: submit-only id is SF-1 preferred relayerTxId, not placeholder hash', async () => {
    mockReadContract.mockResolvedValueOnce(ZERO);
    const { capability } = makeCapability(submitOnlySignAndBroadcast());
    const outcome = await capability.deployOnchainId({ holder: HOLDER }, relayerConfig());
    expect(outcome.id).toBe(RELAYER_TX_ID);
    expect(outcome.id).not.toBe(PLACEHOLDER_TX);
  });

  it('INV-14 (SF-5 drift): confirmed is factory-probe → execute → wait → assert; submit-only skips wait/assert', async () => {
    const order: string[] = [];
    mockWaitForTransactionReceipt.mockImplementation(async () => {
      order.push('wait');
      return walletLinkedReceipt();
    });
    mockReadContract.mockImplementation(async (args: { functionName?: string }) => {
      if (args.functionName === 'getIdentity') {
        order.push('factory');
        return ZERO;
      }
      order.push('assert');
      return true;
    });
    const sab = vi.fn().mockImplementation(async () => {
      order.push('execute');
      return { txHash: TX_HASH };
    });
    const { capability } = makeCapability(sab);

    await capability.deployOnchainId({ holder: HOLDER }, EXEC_CONFIG);
    expect(order).toEqual(['factory', 'execute', 'wait', 'assert']);

    order.length = 0;
    mockWaitForTransactionReceipt.mockClear();
    mockReadContract.mockClear();
    mockReadContract.mockImplementation(async (args: { functionName?: string }) => {
      if (args.functionName === 'getIdentity') {
        order.push('factory');
        return ZERO;
      }
      order.push('assert');
      return true;
    });
    const submitSab = vi.fn().mockImplementation(async () => {
      order.push('execute');
      return {
        txHash: PLACEHOLDER_TX,
        result: { completion: 'submitted', relayerTxId: RELAYER_TX_ID },
      };
    });
    const { capability: submitCap } = makeCapability(submitSab);
    await submitCap.deployOnchainId({ holder: HOLDER }, relayerConfig());
    expect(order).toEqual(['factory', 'execute']);
    expect(mockWaitForTransactionReceipt).not.toHaveBeenCalled();
  });

  it('INV-9: disagreement through deploy → WriteCompletionDisagreementError, not IdentityOperationFailed', async () => {
    mockWaitForTransactionReceipt.mockResolvedValue(walletLinkedReceipt());
    mockReadContract.mockResolvedValueOnce(ZERO); // SF-5 factory not_found → reach execute
    const { capability } = makeCapability(
      vi.fn().mockResolvedValue({
        txHash: TX_HASH,
        result: { completion: 'submitted' },
      })
    );

    const error = await capability
      .deployOnchainId({ holder: HOLDER }, relayerConfig({ completion: 'confirmed' }))
      .then(() => undefined)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(WriteCompletionDisagreementError);
    expect(error).not.toBeInstanceOf(IdentityOperationFailed);
    expect((error as WriteCompletionDisagreementError).code).toBe('WRITE_COMPLETION_DISAGREEMENT');
    expect(
      mockWaitForTransactionReceipt,
      'INV-9: disagreement must abort before wait'
    ).not.toHaveBeenCalled();
  });

  it('INV-15: deploy branch trusts SF-1 result.completion — options alone after result-only do not re-merge in deploy', async () => {
    // Result-only submitted (options absent) selects submit-only via SF-1; deploy must not
    // re-read options. Covered by early return with wait poisoned.
    mockWaitForTransactionReceipt.mockRejectedValue(new Error('must not wait'));
    mockReadContract.mockResolvedValueOnce(ZERO);
    mockReadContract.mockRejectedValue(new Error('must not post-assert'));
    const { capability } = makeCapability(submitOnlySignAndBroadcast());

    const outcome = await capability.deployOnchainId(
      { holder: HOLDER },
      relayerConfig() // no transactionOptions.completion
    );
    expect(outcome).toEqual({ id: RELAYER_TX_ID, completion: 'submitted' });
    expect(mockWaitForTransactionReceipt).not.toHaveBeenCalled();
  });

  it('INV-16: adapter does not re-fire onSubmitted during deploy submit-only', async () => {
    const onSubmitted = vi.fn();
    mockWaitForTransactionReceipt.mockRejectedValue(new Error('must not wait'));
    mockReadContract.mockResolvedValueOnce(ZERO);
    const { capability } = makeCapability(submitOnlySignAndBroadcast());

    await capability.deployOnchainId(
      { holder: HOLDER },
      relayerConfig({ completion: 'submitted', onSubmitted })
    );

    expect(
      onSubmitted,
      'INV-16 violated: adapter must not re-fire onSubmitted on deploy submit-only'
    ).not.toHaveBeenCalled();
  });

  it('INV-11 / INV-19 (SF-5 drift): submit-only runs factory pre-submit; resume API remains available', async () => {
    mockWaitForTransactionReceipt.mockRejectedValue(new Error('must not wait'));
    mockReadContract.mockResolvedValueOnce(ZERO); // SF-5 pre-submit factory not_found
    const { capability } = makeCapability(submitOnlySignAndBroadcast());

    await capability.deployOnchainId({ holder: HOLDER }, relayerConfig());
    expect(mockReadContract).toHaveBeenCalledOnce();
    expect(mockReadContract.mock.calls[0]?.[0]).toMatchObject({ functionName: 'getIdentity' });

    mockReadContract.mockClear();
    mockReadContract.mockResolvedValueOnce(ONCHAINID);
    await expect(capability.getFactoryIdentity(HOLDER)).resolves.toEqual({
      status: 'found',
      onchainId: ONCHAINID,
    });
    expect(mockReadContract).toHaveBeenCalledTimes(1);
  });

  it('INV-17: submit-only info log has no onchainId / deployed / verify-success claims', async () => {
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});
    mockWaitForTransactionReceipt.mockRejectedValue(new Error('must not wait'));
    mockReadContract.mockResolvedValueOnce(ZERO);
    const { capability } = makeCapability(submitOnlySignAndBroadcast());

    await capability.deployOnchainId({ holder: HOLDER }, relayerConfig());

    const submitOnlyLogs = infoSpy.mock.calls.filter(
      (call) => typeof call[1] === 'string' && call[1].includes('submit-only early return')
    );
    expect(submitOnlyLogs.length).toBeGreaterThan(0);
    for (const call of submitOnlyLogs) {
      const payload = call[2] as Record<string, unknown> | undefined;
      expect(payload).toMatchObject({
        operation: 'deployOnchainId',
        completion: 'submitted',
        id: RELAYER_TX_ID,
        holder: HOLDER,
      });
      expect(payload).not.toHaveProperty('onchainId');
      expect(JSON.stringify(payload)).not.toMatch(/deployed|verif/i);
    }
    infoSpy.mockRestore();
  });

  it('INV-18: submit-only completes without advancing fake timers by timeoutMs', async () => {
    vi.useFakeTimers();
    try {
      mockWaitForTransactionReceipt.mockImplementation(
        () => new Promise(() => {}) // hang forever if entered
      );
      mockReadContract.mockResolvedValueOnce(ZERO);
      const { capability } = makeCapability(submitOnlySignAndBroadcast());
      const pending = capability.deployOnchainId({ holder: HOLDER }, relayerConfig());
      await expect(pending).resolves.toEqual({
        id: RELAYER_TX_ID,
        completion: 'submitted',
      });
      // Advancing past default hang window must not be required for resolution.
      await vi.advanceTimersByTimeAsync(120_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it('INV-19: submit-only success does not embed runtimeApiKey', async () => {
    mockWaitForTransactionReceipt.mockRejectedValue(new Error('must not wait'));
    mockReadContract.mockResolvedValueOnce(ZERO);
    const { capability } = makeCapability(submitOnlySignAndBroadcast());

    const outcome = await capability.deployOnchainId(
      { holder: HOLDER },
      relayerConfig(),
      undefined,
      RUNTIME_API_KEY
    );

    expect(JSON.stringify(outcome)).not.toContain(RUNTIME_API_KEY);
    expect(outcome).toEqual({ id: RELAYER_TX_ID, completion: 'submitted' });
  });
});

describe('deployOnchainId — types / exports / boundaries (SF-2)', () => {
  it('INV-2 / INV-3 / INV-4 / INV-6: outcome union arm honesty (no onchainId?: shared type)', () => {
    type SubmittedHasOnchainId = 'onchainId' extends keyof DeployOnchainIdSubmittedResult
      ? true
      : false;
    expectTypeOf<SubmittedHasOnchainId>().toEqualTypeOf<false>();
    expectTypeOf<DeployOnchainIdConfirmedResult['onchainId']>().toEqualTypeOf<string>();
    expectTypeOf<DeployOnchainIdConfirmedResult['completion']>().toEqualTypeOf<'confirmed'>();
    expectTypeOf<DeployOnchainIdSubmittedResult['completion']>().toEqualTypeOf<'submitted'>();
    expectTypeOf<
      EvmIRSCapability['deployOnchainId']
    >().returns.resolves.toEqualTypeOf<DeployOnchainIdOutcome>();
  });

  it('INV-22: outcome types are exported from capabilities/irs barrel (public surface)', () => {
    // Compile-time import above is the proof; runtime shape check for discriminant.
    const submitted: DeployOnchainIdSubmittedResult = {
      id: 'x',
      completion: 'submitted',
    };
    const confirmed: DeployOnchainIdConfirmedResult = {
      id: 'x',
      onchainId: ONCHAINID,
      completion: 'confirmed',
    };
    const asOutcomeSubmitted: DeployOnchainIdOutcome = submitted;
    const asOutcomeConfirmed: DeployOnchainIdOutcome = confirmed;
    expect('onchainId' in asOutcomeSubmitted).toBe(false);
    expect(asOutcomeConfirmed.onchainId).toBe(ONCHAINID);
  });

  it('INV-15: deploy path in service.ts has no resolveWriteCompletion / readOptionsCompletion', () => {
    const src = readFileSync(SERVICE_SRC, 'utf8');
    const deploySection = src.slice(
      src.indexOf('async deployOnchainId'),
      src.indexOf('async grantHolderManagementKey')
    );
    expect(deploySection).not.toMatch(/resolveWriteCompletion/);
    expect(deploySection).not.toMatch(/readOptionsCompletion/);
    expect(deploySection).toMatch(/result\.completion\s*===\s*['"]submitted['"]/);
  });

  it('INV-23: adapter-evm-core src has no reference-implementations imports', () => {
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
    const offenders = walk(CORE_SRC_ROOT).filter((f) => {
      const text = readFileSync(f, 'utf8');
      return /reference-implementations/.test(text);
    });
    expect(offenders, 'INV-23: no RI imports in adapter-evm-core production src').toEqual([]);
  });
});
