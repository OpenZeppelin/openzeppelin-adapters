/**
 * SF-5 irs-identity-write-error-fidelity — NON-VACUITY error-fidelity matrix.
 *
 * INV ids refer to SF-5 invariants unless noted. Dig locks: reuse
 * IdentityAlreadyRegistered / ALREADY_ONBOARDED; adapters MINOR; typed indeterminate OUT.
 *
 * Plan drift: SF-3 “always execute first” superseded only on has/found/read_failed
 * no-submit arms — pre-submit probes run in both completion modes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ExecutionConfig,
  OnboardingClaim,
  RelayerExecutionConfig,
} from '@openzeppelin/ui-types';
import { IdentityAlreadyRegistered, IdentityOperationFailed } from '@openzeppelin/ui-types';

import type { SignAndBroadcast } from '../../capabilities/helpers';
import { createIRS, type CreateIRSOptions, type EvmIRSCapability } from '../../capabilities/irs';
import { TRUSTED_ISSUER_NOOP_ID } from '../service';

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
const ISSUER = '0xcCcCccCcCcCccCcccCccCccCccCccCccCccCccccC';
const ZERO = '0x0000000000000000000000000000000000000000';
const TX_HASH = '0xtx';
const PLACEHOLDER_TX = '0x0000000000000000000000000000000000000000000000000000000000000000';
const RELAYER_TX_ID = 'relayer-fidelity-sub-1';
const RUNTIME_API_KEY = 'super-secret-runtime-api-key-fidelity';

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

function makeCapability(signAndBroadcastImpl?: ReturnType<typeof vi.fn>): {
  capability: EvmIRSCapability;
  signAndBroadcast: ReturnType<typeof vi.fn>;
} {
  const signAndBroadcast = signAndBroadcastImpl ?? vi.fn().mockResolvedValue({ txHash: TX_HASH });
  const options: CreateIRSOptions = {
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

function submitOnlySignAndBroadcast(): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({
    txHash: PLACEHOLDER_TX,
    result: { completion: 'submitted', relayerTxId: RELAYER_TX_ID },
  });
}

/**
 * Pre-SF-5 collapse defect for grant: probe already has MANAGEMENT, but the path still
 * submits and surfaces generic IRS_OPERATION_FAILED (live saga 500 class).
 * NON-VACUITY RED — must not match the fixed IdentityAlreadyRegistered no-submit arm.
 */
async function grantCollapseAlreadyHasDefect(input: {
  execute: () => Promise<unknown>;
}): Promise<never> {
  await input.execute();
  throw new IdentityOperationFailed(
    'grantHolderManagementKey collapsed after already-complete re-drive',
    'grantHolderManagementKey'
  );
}

/**
 * Pre-SF-5 read_failed defect for grant: treat RPC fog as lacks and submit anyway.
 * NON-VACUITY RED — fixed path must fail-closed with generic no-submit.
 */
async function grantReadFailedAsLacksDefect(input: {
  execute: () => Promise<unknown>;
}): Promise<{ id: string }> {
  await input.execute();
  return { id: TX_HASH };
}

/**
 * Pre-SF-5 collapse for deploy: factory already linked, but path still submits then
 * collapses to generic operation-failed (wallet-already-linked orphan trap class).
 */
async function deployCollapseFactoryFoundDefect(input: {
  execute: () => Promise<unknown>;
}): Promise<never> {
  await input.execute();
  throw new IdentityOperationFailed(
    'deployOnchainId collapsed after factory-linked re-drive',
    'deployOnchainId'
  );
}

/**
 * Pre-SF-5 factory read_failed defect: treat fog as not_found and submit.
 */
async function deployReadFailedAsNotFoundDefect(input: {
  execute: () => Promise<unknown>;
}): Promise<{ id: string; completion: 'submitted' }> {
  await input.execute();
  return { id: TX_HASH, completion: 'submitted' };
}

describe('SF-5 grantHolderManagementKey error fidelity', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('INV-5 / INV-15 / INV-16 / INV-17 / INV-29 NON-VACUITY: already-has → generic+submit RED; IdentityAlreadyRegistered no-submit GREEN', async () => {
    const sab = vi.fn().mockResolvedValue({ txHash: TX_HASH });

    // ---- RED: construct pre-fix collapse ----
    await expect(
      grantCollapseAlreadyHasDefect({ execute: () => sab({ functionName: 'addKey' }) })
    ).rejects.toBeInstanceOf(IdentityOperationFailed);
    expect(
      sab,
      'NON-VACUITY RED: collapse defect must enter execute / submit'
    ).toHaveBeenCalledOnce();
    expect(
      sab.mock.results[0]?.type === 'return' ? await sab.mock.results[0].value : undefined
    ).toEqual({ txHash: TX_HASH });

    sab.mockClear();

    // ---- GREEN: real service — has → ALREADY_ONBOARDED, zero submit ----
    mockReadContract.mockResolvedValueOnce(true); // keyHasPurpose → has
    const { capability, signAndBroadcast } = makeCapability(sab);

    const error = await capability
      .grantHolderManagementKey({ onchainId: ONCHAINID, holder: HOLDER }, EXEC_CONFIG)
      .then(() => undefined)
      .catch((e: unknown) => e);

    expect(
      error,
      'INV-5 violated: already-has MANAGEMENT must throw IdentityAlreadyRegistered, not generic collapse'
    ).toBeInstanceOf(IdentityAlreadyRegistered);
    expect((error as IdentityAlreadyRegistered).code).toBe('ALREADY_ONBOARDED');
    expect((error as IdentityAlreadyRegistered).holder).toBe(HOLDER);
    expect((error as IdentityAlreadyRegistered).onchainId).toBe(ONCHAINID);
    expect((error as IdentityAlreadyRegistered).message).toMatch(/already holds MANAGEMENT/i);
    expect(
      signAndBroadcast,
      'INV-17 / SC-008 violated: already-has must not submit a new operator tx'
    ).not.toHaveBeenCalled();
    expect(mockReadContract).toHaveBeenCalledOnce();
  });

  it('INV-3 / INV-5: submit-only mode still throws IdentityAlreadyRegistered before execute (has)', async () => {
    mockReadContract.mockResolvedValueOnce(true);
    const { capability, signAndBroadcast } = makeCapability(submitOnlySignAndBroadcast());

    await expect(
      capability.grantHolderManagementKey(
        { onchainId: ONCHAINID, holder: HOLDER },
        relayerConfig({ completion: 'submitted' })
      )
    ).rejects.toBeInstanceOf(IdentityAlreadyRegistered);

    expect(
      signAndBroadcast,
      'INV-3 violated: submit-only must not skip the already-onboarded pre-submit throw'
    ).not.toHaveBeenCalled();
  });

  it('INV-6 / INV-4 / INV-18 / INV-29 NON-VACUITY: read_failed-as-lacks RED; generic no-submit GREEN', async () => {
    const sab = vi.fn().mockResolvedValue({ txHash: TX_HASH });

    // ---- RED: fog treated as lacks → submit ----
    const leaked = await grantReadFailedAsLacksDefect({
      execute: () => sab({ functionName: 'addKey' }),
    });
    expect(leaked).toEqual({ id: TX_HASH });
    expect(
      sab,
      'NON-VACUITY RED: read_failed-as-lacks defect must submit under RPC fog'
    ).toHaveBeenCalledOnce();

    sab.mockClear();

    // ---- GREEN: real service — read_failed → IdentityOperationFailed, no submit ----
    mockReadContract.mockRejectedValueOnce(new Error('rpc fog'));
    const { capability, signAndBroadcast } = makeCapability(sab);

    const error = await capability
      .grantHolderManagementKey({ onchainId: ONCHAINID, holder: HOLDER }, EXEC_CONFIG)
      .then(() => undefined)
      .catch((e: unknown) => e);

    expect(
      error,
      'INV-6 violated: read_failed must stay IdentityOperationFailed (honest generic)'
    ).toBeInstanceOf(IdentityOperationFailed);
    expect(error).not.toBeInstanceOf(IdentityAlreadyRegistered);
    expect((error as IdentityOperationFailed).code).toBe('IRS_OPERATION_FAILED');
    expect((error as IdentityOperationFailed).message).toMatch(/ambiguous/i);
    expect((error as IdentityOperationFailed).message).toMatch(/not already-onboarded/i);
    expect((error as IdentityOperationFailed).cause?.message).toMatch(/rpc fog/i);
    expect(
      signAndBroadcast,
      'INV-18 violated: read_failed must fail-closed with zero submit'
    ).not.toHaveBeenCalled();
  });

  it('INV-7 / INV-2: lacks proceeds to execute + confirmed success shape unchanged', async () => {
    // pre-submit lacks, post-submit assert has
    mockReadContract.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const { capability, signAndBroadcast } = makeCapability();

    const out = await capability.grantHolderManagementKey(
      { onchainId: ONCHAINID, holder: HOLDER },
      EXEC_CONFIG
    );

    expect(out).toEqual({ id: TX_HASH });
    expect(Object.keys(out)).toEqual(['id']);
    expect(signAndBroadcast).toHaveBeenCalledOnce();
    expect(mockReadContract).toHaveBeenCalledTimes(2);
  });

  it('INV-7: lacks + submit-only still submits and skips post-assert only', async () => {
    mockReadContract.mockResolvedValueOnce(false); // pre-submit lacks
    const { capability, signAndBroadcast } = makeCapability(submitOnlySignAndBroadcast());

    const out = await capability.grantHolderManagementKey(
      { onchainId: ONCHAINID, holder: HOLDER },
      relayerConfig()
    );

    expect(out).toEqual({ id: RELAYER_TX_ID });
    expect(signAndBroadcast).toHaveBeenCalledOnce();
    expect(
      mockReadContract,
      'INV-21: pre-submit probe runs once; post-submit assert skipped on submit-only'
    ).toHaveBeenCalledOnce();
  });

  it('INV-21: side-effect order on has is probe then throw (execute absent)', async () => {
    const order: string[] = [];
    mockReadContract.mockImplementation(async () => {
      order.push('probe');
      return true;
    });
    const sab = vi.fn().mockImplementation(async () => {
      order.push('execute');
      return { txHash: TX_HASH };
    });
    const { capability } = makeCapability(sab);

    await expect(
      capability.grantHolderManagementKey({ onchainId: ONCHAINID, holder: HOLDER }, EXEC_CONFIG)
    ).rejects.toBeInstanceOf(IdentityAlreadyRegistered);

    expect(order).toEqual(['probe']);
  });

  it('INV-25: at most one pre-submit keyHasPurpose eth_call on has arm', async () => {
    mockReadContract.mockResolvedValueOnce(true);
    const { capability } = makeCapability();

    await expect(
      capability.grantHolderManagementKey({ onchainId: ONCHAINID, holder: HOLDER }, EXEC_CONFIG)
    ).rejects.toBeInstanceOf(IdentityAlreadyRegistered);

    expect(mockReadContract).toHaveBeenCalledTimes(1);
  });

  it('INV-26: fidelity errors never leak runtimeApiKey / secrets', async () => {
    mockReadContract.mockResolvedValueOnce(true);
    const { capability } = makeCapability();

    const error = await capability
      .grantHolderManagementKey(
        { onchainId: ONCHAINID, holder: HOLDER },
        EXEC_CONFIG,
        undefined,
        RUNTIME_API_KEY
      )
      .then(() => undefined)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(IdentityAlreadyRegistered);
    expect((error as IdentityAlreadyRegistered).message).not.toContain(RUNTIME_API_KEY);
    expect(JSON.stringify(error)).not.toContain(RUNTIME_API_KEY);
  });
});

describe('SF-5 deployOnchainId error fidelity', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('INV-8 / INV-15 / INV-16 / INV-17 / INV-29 NON-VACUITY: factory-found → generic+submit RED; IdentityAlreadyRegistered GREEN', async () => {
    const sab = vi.fn().mockResolvedValue({ txHash: TX_HASH });

    await expect(
      deployCollapseFactoryFoundDefect({ execute: () => sab({ functionName: 'createIdentity' }) })
    ).rejects.toBeInstanceOf(IdentityOperationFailed);
    expect(
      sab,
      'NON-VACUITY RED: factory-found collapse must enter execute'
    ).toHaveBeenCalledOnce();

    sab.mockClear();

    mockReadContract.mockResolvedValueOnce(ONCHAINID); // getIdentity → found
    const { capability, signAndBroadcast } = makeCapability(sab);

    const error = await capability
      .deployOnchainId({ holder: HOLDER }, EXEC_CONFIG)
      .then(() => undefined)
      .catch((e: unknown) => e);

    expect(
      error,
      'INV-8 violated: factory-found must throw IdentityAlreadyRegistered before submit'
    ).toBeInstanceOf(IdentityAlreadyRegistered);
    expect((error as IdentityAlreadyRegistered).code).toBe('ALREADY_ONBOARDED');
    expect((error as IdentityAlreadyRegistered).holder).toBe(HOLDER);
    expect((error as IdentityAlreadyRegistered).onchainId).toBe(ONCHAINID);
    expect((error as IdentityAlreadyRegistered).message).toMatch(/factory-linked identity/i);
    expect(signAndBroadcast).not.toHaveBeenCalled();
    expect(mockWaitForTransactionReceipt).not.toHaveBeenCalled();
  });

  it('INV-3 / INV-8: submit-only still throws IdentityAlreadyRegistered on factory found', async () => {
    mockReadContract.mockResolvedValueOnce(ONCHAINID);
    const { capability, signAndBroadcast } = makeCapability(submitOnlySignAndBroadcast());

    await expect(
      capability.deployOnchainId({ holder: HOLDER }, relayerConfig({ completion: 'submitted' }))
    ).rejects.toBeInstanceOf(IdentityAlreadyRegistered);

    expect(signAndBroadcast).not.toHaveBeenCalled();
  });

  it('INV-9 / INV-18 / INV-19 / INV-29 NON-VACUITY: read_failed-as-not_found RED; generic no-submit GREEN', async () => {
    const sab = vi.fn().mockResolvedValue({ txHash: TX_HASH });

    const leaked = await deployReadFailedAsNotFoundDefect({
      execute: () => sab({ functionName: 'createIdentity' }),
    });
    expect(leaked.completion).toBe('submitted');
    expect(sab).toHaveBeenCalledOnce();

    sab.mockClear();

    mockReadContract.mockRejectedValueOnce(new Error('factory rpc down'));
    const { capability, signAndBroadcast } = makeCapability(sab);

    const error = await capability
      .deployOnchainId({ holder: HOLDER }, EXEC_CONFIG)
      .then(() => undefined)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(IdentityOperationFailed);
    expect(error).not.toBeInstanceOf(IdentityAlreadyRegistered);
    expect((error as IdentityOperationFailed).code).toBe('IRS_OPERATION_FAILED');
    expect((error as IdentityOperationFailed).message).toMatch(/Do not retry blind/i);
    expect((error as IdentityOperationFailed).message).toMatch(/not already-linked/i);
    expect(signAndBroadcast).not.toHaveBeenCalled();
  });

  it('INV-10 / INV-2: not_found proceeds to confirmed deploy success (SF-2 path)', async () => {
    const { encodeEventTopics } = await import('viem');
    const { ID_FACTORY_EVENTS_ABI } = await import('../abis');
    const topics = encodeEventTopics({
      abi: ID_FACTORY_EVENTS_ABI,
      eventName: 'WalletLinked',
      args: { wallet: HOLDER, identity: ONCHAINID },
    });
    mockReadContract
      .mockResolvedValueOnce(ZERO) // factory not_found
      .mockResolvedValueOnce(true); // operator MANAGEMENT assert
    mockWaitForTransactionReceipt.mockResolvedValueOnce({
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
    });
    const { capability, signAndBroadcast } = makeCapability();

    const outcome = await capability.deployOnchainId({ holder: HOLDER }, EXEC_CONFIG);

    expect(outcome).toEqual({
      id: TX_HASH,
      onchainId: ONCHAINID,
      completion: 'confirmed',
    });
    expect(signAndBroadcast).toHaveBeenCalledOnce();
  });

  it('INV-11 / INV-30: confirmed timeout stays IdentityOperationFailed with INDETERMINATE — never ALREADY_ONBOARDED', async () => {
    mockReadContract.mockResolvedValueOnce(ZERO); // factory not_found → proceed
    mockWaitForTransactionReceipt.mockRejectedValueOnce(
      new Error('WaitForTransactionReceiptTimeoutError: timed out')
    );
    const { capability, signAndBroadcast } = makeCapability();

    const error = await capability
      .deployOnchainId({ holder: HOLDER }, EXEC_CONFIG)
      .then(() => undefined)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(IdentityOperationFailed);
    expect(error).not.toBeInstanceOf(IdentityAlreadyRegistered);
    expect((error as IdentityOperationFailed).code).toBe('IRS_OPERATION_FAILED');
    expect((error as IdentityOperationFailed).code).not.toBe('ALREADY_ONBOARDED');
    expect((error as Error).message).toContain('INDETERMINATE');
    expect((error as Error).message).toMatch(/do NOT retry blind/i);
    expect(signAndBroadcast).toHaveBeenCalledOnce();
  });
});

describe('SF-5 write-set non-regression / leave-generic arms', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('INV-12: registerIdentity already-registered still throws IdentityAlreadyRegistered (no submit)', async () => {
    mockReadContract.mockResolvedValueOnce(ONCHAINID);
    const { capability, signAndBroadcast } = makeCapability();

    const error = await capability
      .registerIdentity({ holder: HOLDER, onchainId: ONCHAINID }, EXEC_CONFIG)
      .then(() => undefined)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(IdentityAlreadyRegistered);
    expect((error as IdentityAlreadyRegistered).code).toBe('ALREADY_ONBOARDED');
    expect(signAndBroadcast).not.toHaveBeenCalled();
  });

  it('INV-13: registerTrustedIssuer already-trusted stays noop-success (not a throw)', async () => {
    mockReadContract.mockResolvedValueOnce(true);
    const { capability, signAndBroadcast } = makeCapability();

    const result = await capability.registerTrustedIssuer(
      { issuer: ISSUER, topics: ['1'] },
      EXEC_CONFIG
    );

    expect(result.id).toBe(TRUSTED_ISSUER_NOOP_ID);
    expect(signAndBroadcast).not.toHaveBeenCalled();
  });

  it('INV-14: attachClaim has no invented claim-exists → IdentityAlreadyRegistered path', async () => {
    const claim: OnboardingClaim = {
      topic: '1',
      scheme: 1,
      data: '0xdeadbeef',
      signature: '0xc0ffee',
      issuer: ISSUER,
    };
    const { capability, signAndBroadcast } = makeCapability();

    const result = await capability.attachClaim({ onchainId: ONCHAINID, claim }, EXEC_CONFIG);

    expect(result).toEqual({ id: TX_HASH });
    expect(signAndBroadcast).toHaveBeenCalledOnce();
    // No pre-submit claim probe invented — only the execute path runs.
    expect(mockReadContract).not.toHaveBeenCalled();
  });

  it('INV-15: fidelity throw sites use only ALREADY_ONBOARDED or IRS_OPERATION_FAILED codes', async () => {
    mockReadContract.mockResolvedValueOnce(true);
    const { capability: grantCap } = makeCapability();
    const grantErr = await grantCap
      .grantHolderManagementKey({ onchainId: ONCHAINID, holder: HOLDER }, EXEC_CONFIG)
      .catch((e: unknown) => e);
    expect((grantErr as { code: string }).code).toBe('ALREADY_ONBOARDED');

    mockReadContract.mockResolvedValueOnce(ONCHAINID);
    const { capability: deployCap } = makeCapability();
    const deployErr = await deployCap
      .deployOnchainId({ holder: HOLDER }, EXEC_CONFIG)
      .catch((e: unknown) => e);
    expect((deployErr as { code: string }).code).toBe('ALREADY_ONBOARDED');

    mockReadContract.mockRejectedValueOnce(new Error('fog'));
    const { capability: fogCap } = makeCapability();
    const fogErr = await fogCap
      .grantHolderManagementKey({ onchainId: ONCHAINID, holder: HOLDER }, EXEC_CONFIG)
      .catch((e: unknown) => e);
    expect((fogErr as { code: string }).code).toBe('IRS_OPERATION_FAILED');
  });
});
