/**
 * ONCHAINID dual-management onboarding (deploy operator key, then grant holder key).
 *
 * RED-FIRST: these tests fail against `createIdentity` deploy calldata and against the
 * absence of `grantHolderManagementKey` until the management-key layout is implemented.
 *
 * SF-3: grant submit-only skips post-submit keyHasPurpose (NON-VACUITY); confirmed path
 * remains byte-identical. INV ids below refer to SF-3 invariants unless noted.
 */
import { encodeAbiParameters, encodeEventTopics, keccak256 } from 'viem';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import type {
  ExecutionConfig,
  OperationResult,
  RelayerExecutionConfig,
} from '@openzeppelin/ui-types';
import { IdentityOperationFailed } from '@openzeppelin/ui-types';

import {
  WriteCompletionDisagreementError,
  type SignAndBroadcast,
} from '../../capabilities/helpers';
import { createIRS, type CreateIRSOptions, type EvmIRSCapability } from '../../capabilities/irs';
import { ID_FACTORY_EVENTS_ABI } from '../abis';
import { IDENTITY_KEY_PURPOSE_MANAGEMENT } from '../identity-keys';
import { InvalidOperatorManagementKeyError } from '../management-key';

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
const TX_HASH = '0xtx';
const PLACEHOLDER_TX = '0x0000000000000000000000000000000000000000000000000000000000000000';
const RELAYER_TX_ID = 'relayer-grant-sub-99';
const RUNTIME_API_KEY = 'super-secret-runtime-api-key-grant';

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

function addressKeyHash(address: string): `0x${string}` {
  return keccak256(encodeAbiParameters([{ type: 'address' }], [address as `0x${string}`]));
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

describe('operatorManagementKey construction', () => {
  it('rejects a missing operatorManagementKey at construction', () => {
    expect(() =>
      createIRS(
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
        // `operatorManagementKey` is deliberately omitted — that is what this test asserts on,
        // so the cast goes through `unknown` to model the malformed consumer call.
        {
          signAndBroadcast: vi.fn(),
          addresses: { ...ADDRESSES },
        } as unknown as CreateIRSOptions
      )
    ).toThrow(InvalidOperatorManagementKeyError);
  });

  it('rejects a malformed operatorManagementKey at construction', () => {
    expect(() =>
      createIRS(
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
        {
          signAndBroadcast: vi.fn(),
          addresses: { ...ADDRESSES },
          operatorManagementKey: 'not-an-address',
        }
      )
    ).toThrow(InvalidOperatorManagementKeyError);
  });
});

describe('deployOnchainId management keys', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('deploys via createIdentityWithManagementKeys with the configured operator key', async () => {
    mockWaitForTransactionReceipt.mockResolvedValueOnce(walletLinkedReceipt());
    // SF-5: factory not_found, then operator MANAGEMENT assert
    mockReadContract.mockResolvedValueOnce(ZERO).mockResolvedValueOnce(true);
    const { capability, signAndBroadcast } = makeCapability();

    await capability.deployOnchainId({ holder: HOLDER }, EXEC_CONFIG);

    const action = signAndBroadcast.mock.calls[0][0];
    expect(action.functionName).toBe('createIdentityWithManagementKeys');
    expect(action.address.toLowerCase()).toBe(ADDRESSES.identityFactory);
    expect(action.args[0]).toBe(HOLDER);
    expect(action.args[2]).toEqual([addressKeyHash(OPERATOR)]);
  });

  it('gives the operator MANAGEMENT on the deployed identity (keyHasPurpose)', async () => {
    mockWaitForTransactionReceipt.mockResolvedValueOnce(walletLinkedReceipt());
    mockReadContract.mockResolvedValueOnce(ZERO).mockResolvedValueOnce(true);
    const { capability } = makeCapability();

    await capability.deployOnchainId({ holder: HOLDER }, EXEC_CONFIG);

    expect(mockReadContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: ONCHAINID,
        functionName: 'keyHasPurpose',
        args: [addressKeyHash(OPERATOR), BigInt(IDENTITY_KEY_PURPOSE_MANAGEMENT)],
      })
    );
  });

  it('maps post-deploy keyHasPurpose RPC failure to IdentityOperationFailed with onchainId', async () => {
    mockWaitForTransactionReceipt.mockResolvedValueOnce(walletLinkedReceipt());
    // SF-5: factory not_found proceeds; post-submit operator assert RPC fails
    mockReadContract.mockResolvedValueOnce(ZERO).mockRejectedValueOnce(new Error('rpc down'));
    const { capability } = makeCapability();

    const error = await capability
      .deployOnchainId({ holder: HOLDER }, EXEC_CONFIG)
      .then(() => undefined)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(IdentityOperationFailed);
    expect((error as IdentityOperationFailed).message).toContain(ONCHAINID);
    expect((error as IdentityOperationFailed).message).toMatch(/could not verify/i);
  });
});

describe('grantHolderManagementKey', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('submits addKey(holder, MANAGEMENT) on the identity', async () => {
    // SF-5: pre-submit lacks, post-submit assert has
    mockReadContract.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const { capability, signAndBroadcast } = makeCapability();

    await capability.grantHolderManagementKey(
      { onchainId: ONCHAINID, holder: HOLDER },
      EXEC_CONFIG
    );

    const action = signAndBroadcast.mock.calls[0][0];
    expect(action.functionName).toBe('addKey');
    expect(action.address).toBe(ONCHAINID);
    expect(action.args).toEqual([
      addressKeyHash(HOLDER),
      BigInt(IDENTITY_KEY_PURPOSE_MANAGEMENT),
      1n,
    ]);
  });

  it('INV-7: gives the holder MANAGEMENT on the identity after grant (keyHasPurpose)', async () => {
    mockReadContract.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const { capability } = makeCapability();

    const out = await capability.grantHolderManagementKey(
      { onchainId: ONCHAINID, holder: HOLDER },
      EXEC_CONFIG
    );

    // INV-3: confirmed arm returns fresh { id } — no completion leak
    expect(out).toEqual({ id: TX_HASH });
    expect(Object.keys(out)).toEqual(['id']);

    // SF-5: pre-submit probe + post-submit assert
    expect(mockReadContract).toHaveBeenCalledTimes(2);
    expect(mockReadContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: ONCHAINID,
        functionName: 'keyHasPurpose',
        args: [addressKeyHash(HOLDER), BigInt(IDENTITY_KEY_PURPOSE_MANAGEMENT)],
      })
    );
  });

  it('INV-7 / INV-8: maps post-grant keyHasPurpose RPC failure to IdentityOperationFailed with onchainId', async () => {
    // SF-5: pre-submit lacks → proceed; post-submit assert RPC fails
    mockReadContract.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('rpc down'));
    const { capability } = makeCapability();

    const error = await capability
      .grantHolderManagementKey({ onchainId: ONCHAINID, holder: HOLDER }, EXEC_CONFIG)
      .then(() => undefined)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(IdentityOperationFailed);
    expect((error as IdentityOperationFailed).message).toContain(ONCHAINID);
    expect((error as IdentityOperationFailed).message).toMatch(/could not verify/i);
    // INV-19: resume text may include onchainId; must not dump runtime secrets (none passed here)
    expect((error as IdentityOperationFailed).message).not.toContain(RUNTIME_API_KEY);
  });

  it('INV-8: confirmed-path lacks MANAGEMENT → IdentityOperationFailed (not silent { id })', async () => {
    // SF-5: pre-submit lacks proceeds; post-submit assert still lacks
    mockReadContract.mockResolvedValueOnce(false).mockResolvedValueOnce(false);
    const { capability, signAndBroadcast } = makeCapability();

    await expect(
      capability.grantHolderManagementKey({ onchainId: ONCHAINID, holder: HOLDER }, EXEC_CONFIG)
    ).rejects.toBeInstanceOf(IdentityOperationFailed);

    expect(signAndBroadcast).toHaveBeenCalledOnce();
    expect(mockReadContract).toHaveBeenCalledTimes(2);
  });

  it('INV-7: explicit completion confirmed still asserts keyHasPurpose', async () => {
    mockReadContract.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const { capability, signAndBroadcast } = makeCapability();

    const out = await capability.grantHolderManagementKey(
      { onchainId: ONCHAINID, holder: HOLDER },
      relayerConfig({ completion: 'confirmed' })
    );

    expect(out).toEqual({ id: TX_HASH });
    expect(signAndBroadcast).toHaveBeenCalledOnce();
    expect(mockReadContract).toHaveBeenCalledTimes(2);
  });

  it('INV-12: two confirmed grants both invoke execute + assert (no outcome cache)', async () => {
    // Each grant: pre-submit lacks + post-submit has
    mockReadContract
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const { capability, signAndBroadcast } = makeCapability();

    await capability.grantHolderManagementKey(
      { onchainId: ONCHAINID, holder: HOLDER },
      EXEC_CONFIG
    );
    await capability.grantHolderManagementKey(
      { onchainId: ONCHAINID, holder: HOLDER },
      EXEC_CONFIG
    );

    expect(signAndBroadcast).toHaveBeenCalledTimes(2);
    expect(mockReadContract).toHaveBeenCalledTimes(4);
  });
});

describe('grantHolderManagementKey — submit-only (SF-3)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('INV-2 / INV-5 / INV-6 NON-VACUITY: submit-only returns { id }, skips post-submit keyHasPurpose', async () => {
    // NON-VACUITY RED: confirmed path with poisoned post-assert fails (defect class is real).
    // SF-5: pre-submit lacks proceeds; post-submit assert is what submit-only skips.
    mockReadContract
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error('NON-VACUITY: assert must not run on submit-only'));
    const confirmedCap = makeCapability().capability;
    await expect(
      confirmedCap.grantHolderManagementKey({ onchainId: ONCHAINID, holder: HOLDER }, EXEC_CONFIG)
    ).rejects.toBeInstanceOf(IdentityOperationFailed);
    expect(
      mockReadContract.mock.calls.length,
      'NON-VACUITY RED: confirmed path must invoke post-submit keyHasPurpose'
    ).toBeGreaterThan(1);

    mockReadContract.mockClear();
    // SF-5: pre-submit lacks; post-submit assert must not run on submit-only
    mockReadContract.mockResolvedValueOnce(false);
    mockReadContract.mockRejectedValue(
      new Error('NON-VACUITY: assert must not run on submit-only')
    );

    const { capability, signAndBroadcast } = makeCapability(submitOnlySignAndBroadcast());
    const out = await capability.grantHolderManagementKey(
      { onchainId: ONCHAINID, holder: HOLDER },
      relayerConfig()
    );

    expect(
      out,
      'INV-2 violated: submit-only must return literal { id } with preferred relayer id'
    ).toEqual({ id: RELAYER_TX_ID });
    expect(Object.keys(out)).toEqual(['id']);
    expect(out).not.toHaveProperty('completion');
    expect(out).not.toHaveProperty('onchainId');
    expect(out).not.toHaveProperty('hasManagement');

    expect(
      signAndBroadcast,
      'INV-5 / INV-13 violated: submit-only must still submit addKey via execute'
    ).toHaveBeenCalledOnce();
    const action = signAndBroadcast.mock.calls[0][0];
    expect(action.functionName).toBe('addKey');

    expect(
      mockReadContract,
      'SF-5 + SF-3: pre-submit probe once; post-submit assert skipped on submit-only'
    ).toHaveBeenCalledOnce();
  });

  it('INV-1 / INV-6: options-only submitted (result absent) also skips post-submit keyHasPurpose', async () => {
    // SF-5 pre-submit lacks; poisoned default would fail if post-assert ran
    mockReadContract.mockResolvedValueOnce(false);
    mockReadContract.mockRejectedValue(new Error('must not post-assert'));
    const { capability, signAndBroadcast } = makeCapability(
      vi.fn().mockResolvedValue({ txHash: TX_HASH })
    );

    const out = await capability.grantHolderManagementKey(
      { onchainId: ONCHAINID, holder: HOLDER },
      relayerConfig({ completion: 'submitted' })
    );

    expect(out).toEqual({ id: TX_HASH });
    expect(signAndBroadcast).toHaveBeenCalledOnce();
    expect(mockReadContract).toHaveBeenCalledOnce();
  });

  it('INV-14 (SF-5 drift): submit-only order is pre-submit probe → execute (no post-assert)', async () => {
    const order: string[] = [];
    mockReadContract.mockImplementation(async () => {
      order.push('keyHasPurpose');
      return false; // lacks — proceed
    });
    const sab = vi.fn().mockImplementation(async () => {
      order.push('execute');
      return {
        txHash: PLACEHOLDER_TX,
        result: { completion: 'submitted', relayerTxId: RELAYER_TX_ID },
      };
    });
    const { capability } = makeCapability(sab);

    await capability.grantHolderManagementKey(
      { onchainId: ONCHAINID, holder: HOLDER },
      relayerConfig()
    );

    expect(order).toEqual(['keyHasPurpose', 'execute']);
  });

  it('INV-14 confirmed (SF-5 drift): probe → execute → post-assert (never reverse)', async () => {
    const order: string[] = [];
    let reads = 0;
    mockReadContract.mockImplementation(async () => {
      order.push('keyHasPurpose');
      reads += 1;
      return reads === 1 ? false : true; // pre lacks, post has
    });
    const sab = vi.fn().mockImplementation(async () => {
      order.push('execute');
      return { txHash: TX_HASH };
    });
    const { capability } = makeCapability(sab);

    await capability.grantHolderManagementKey(
      { onchainId: ONCHAINID, holder: HOLDER },
      EXEC_CONFIG
    );

    expect(order).toEqual(['keyHasPurpose', 'execute', 'keyHasPurpose']);
  });

  it('INV-9: disagreement through grant → WriteCompletionDisagreementError, not IdentityOperationFailed', async () => {
    mockReadContract.mockResolvedValueOnce(false); // SF-5 pre-submit lacks → reach execute
    const { capability } = makeCapability(
      vi.fn().mockResolvedValue({
        txHash: TX_HASH,
        result: { completion: 'submitted' },
      })
    );

    const error = await capability
      .grantHolderManagementKey(
        { onchainId: ONCHAINID, holder: HOLDER },
        relayerConfig({ completion: 'confirmed' })
      )
      .then(() => undefined)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(WriteCompletionDisagreementError);
    expect(error).not.toBeInstanceOf(IdentityOperationFailed);
    expect((error as WriteCompletionDisagreementError).code).toBe('WRITE_COMPLETION_DISAGREEMENT');
    expect(
      mockReadContract,
      'INV-9: disagreement must abort before post-submit assert (pre-submit probe may run)'
    ).toHaveBeenCalledOnce();
  });

  it('INV-15: adapter does not re-fire onSubmitted during grant submit-only', async () => {
    const onSubmitted = vi.fn();
    mockReadContract.mockResolvedValueOnce(false); // SF-5 pre-submit lacks
    const { capability } = makeCapability(submitOnlySignAndBroadcast());

    await capability.grantHolderManagementKey(
      { onchainId: ONCHAINID, holder: HOLDER },
      relayerConfig({ completion: 'submitted', onSubmitted })
    );

    expect(
      onSubmitted,
      'INV-15 violated: adapter must not re-fire onSubmitted on grant submit-only'
    ).not.toHaveBeenCalled();
  });

  it('INV-11 / INV-18: submit-only does not auto-poll hasIdentityKeyPurpose after resolve', async () => {
    mockReadContract.mockResolvedValueOnce(false); // SF-5 pre-submit lacks only
    const { capability } = makeCapability(submitOnlySignAndBroadcast());

    await capability.grantHolderManagementKey(
      { onchainId: ONCHAINID, holder: HOLDER },
      relayerConfig()
    );

    // Pre-submit probe ran once; public resume read remains available separately.
    expect(mockReadContract).toHaveBeenCalledOnce();
    mockReadContract.mockClear();
    mockReadContract.mockResolvedValueOnce(true);
    await expect(
      capability.hasIdentityKeyPurpose({
        onchainId: ONCHAINID,
        address: HOLDER,
        purpose: IDENTITY_KEY_PURPOSE_MANAGEMENT,
      })
    ).resolves.toEqual({ status: 'has' });
    expect(mockReadContract).toHaveBeenCalledTimes(1);
  });

  it('INV-19: submit-only success { id } does not embed runtimeApiKey', async () => {
    mockReadContract.mockResolvedValueOnce(false);
    const { capability } = makeCapability(submitOnlySignAndBroadcast());

    const out = await capability.grantHolderManagementKey(
      { onchainId: ONCHAINID, holder: HOLDER },
      relayerConfig(),
      undefined,
      RUNTIME_API_KEY
    );

    expect(JSON.stringify(out)).not.toContain(RUNTIME_API_KEY);
    expect(out).toEqual({ id: RELAYER_TX_ID });
  });

  it('INV-4: public grant return type remains OperationResult (not a completion union)', () => {
    expectTypeOf<
      EvmIRSCapability['grantHolderManagementKey']
    >().returns.resolves.toEqualTypeOf<OperationResult>();
    expectTypeOf<OperationResult>().toEqualTypeOf<{ id: string }>();
  });

  it('INV-21: grant method remains required on capability; attachClaim/registerIdentity still present', () => {
    const { capability } = makeCapability();
    expect(typeof capability.grantHolderManagementKey).toBe('function');
    expect(typeof capability.attachClaim).toBe('function');
    expect(typeof capability.registerIdentity).toBe('function');
    expect(typeof capability.deployOnchainId).toBe('function');
  });
});
