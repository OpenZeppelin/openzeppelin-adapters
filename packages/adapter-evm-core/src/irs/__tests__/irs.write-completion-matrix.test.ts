/**
 * SF-4 IRS write-completion matrix — NON-VACUOUS op×mode lock (INV-1..INV-22).
 *
 * Slim RED→GREEN rows across deploy / grant / attachClaim / registerIdentity /
 * registerTrustedIssuer (audit). Deep edge cases remain in SF-2/SF-3 suites (INV-13).
 * Mock-bounded — no Anvil / live Relayer (INV-19).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeEventTopics } from 'viem';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ExecutionConfig,
  OnboardingClaim,
  RelayerExecutionConfig,
} from '@openzeppelin/ui-types';
import { IdentityOperationFailed } from '@openzeppelin/ui-types';

import {
  WriteCompletionDisagreementError,
  type SignAndBroadcast,
} from '../../capabilities/helpers';
import { createIRS, type CreateIRSOptions, type EvmIRSCapability } from '../../capabilities/irs';
import { ID_FACTORY_EVENTS_ABI } from '../abis';
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
const TX_HASH = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
const PLACEHOLDER_TX = '0x0000000000000000000000000000000000000000000000000000000000000000';
const RELAYER_TX_ID = 'relayer-matrix-sub-7';

/** Matrix mode column — absent ≡ confirmed (SF-1 / INV-2). */
type MatrixMode = 'submitted' | 'confirmed' | 'absent';

/** Ops under the cross-op lock (INV-1). */
type MatrixOp =
  | 'deployOnchainId'
  | 'grantHolderManagementKey'
  | 'attachClaim'
  | 'registerIdentity'
  | 'registerTrustedIssuer';

type DefectKind =
  | 'always-wait-post-execute'
  | 'always-assert-key-purpose'
  | 'post-execute-wait-wrapper'
  | 'strip-leak'
  | 'audit-noop'
  | 'audit-execute';

type ExpectReturn = 'deploy-submitted' | 'deploy-confirmed' | 'id-only' | 'noop-sentinel';

interface MatrixRow {
  readonly op: MatrixOp;
  readonly mode: MatrixMode;
  readonly defect: DefectKind;
  readonly expectReturn: ExpectReturn;
}

const MATRIX_ROWS: readonly MatrixRow[] = [
  {
    op: 'deployOnchainId',
    mode: 'submitted',
    defect: 'always-wait-post-execute',
    expectReturn: 'deploy-submitted',
  },
  {
    op: 'deployOnchainId',
    mode: 'confirmed',
    defect: 'always-wait-post-execute',
    expectReturn: 'deploy-confirmed',
  },
  {
    op: 'deployOnchainId',
    mode: 'absent',
    defect: 'always-wait-post-execute',
    expectReturn: 'deploy-confirmed',
  },
  {
    op: 'grantHolderManagementKey',
    mode: 'submitted',
    defect: 'always-assert-key-purpose',
    expectReturn: 'id-only',
  },
  {
    op: 'grantHolderManagementKey',
    mode: 'confirmed',
    defect: 'always-assert-key-purpose',
    expectReturn: 'id-only',
  },
  {
    op: 'grantHolderManagementKey',
    mode: 'absent',
    defect: 'always-assert-key-purpose',
    expectReturn: 'id-only',
  },
  {
    op: 'attachClaim',
    mode: 'submitted',
    defect: 'post-execute-wait-wrapper',
    expectReturn: 'id-only',
  },
  {
    op: 'attachClaim',
    mode: 'confirmed',
    defect: 'strip-leak',
    expectReturn: 'id-only',
  },
  {
    op: 'attachClaim',
    mode: 'absent',
    defect: 'post-execute-wait-wrapper',
    expectReturn: 'id-only',
  },
  {
    op: 'registerIdentity',
    mode: 'submitted',
    defect: 'post-execute-wait-wrapper',
    expectReturn: 'id-only',
  },
  {
    op: 'registerIdentity',
    mode: 'confirmed',
    defect: 'strip-leak',
    expectReturn: 'id-only',
  },
  {
    op: 'registerIdentity',
    mode: 'absent',
    defect: 'post-execute-wait-wrapper',
    expectReturn: 'id-only',
  },
  {
    op: 'registerTrustedIssuer',
    mode: 'confirmed',
    defect: 'audit-noop',
    expectReturn: 'noop-sentinel',
  },
  {
    op: 'registerTrustedIssuer',
    mode: 'submitted',
    defect: 'audit-execute',
    expectReturn: 'id-only',
  },
] as const;

const REQUIRED_OPS: readonly MatrixOp[] = [
  'deployOnchainId',
  'grantHolderManagementKey',
  'attachClaim',
  'registerIdentity',
  'registerTrustedIssuer',
];

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

function executionFor(mode: MatrixMode): ExecutionConfig {
  if (mode === 'absent') return EXEC_CONFIG;
  if (mode === 'submitted') {
    return relayerConfig({ completion: 'submitted' });
  }
  return relayerConfig({ completion: 'confirmed' });
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

function submitOnlySignAndBroadcast(): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({
    txHash: PLACEHOLDER_TX,
    result: { completion: 'submitted', relayerTxId: RELAYER_TX_ID },
  });
}

function signAndBroadcastFor(mode: MatrixMode): ReturnType<typeof vi.fn> {
  if (mode === 'submitted') return submitOnlySignAndBroadcast();
  return vi.fn().mockResolvedValue({ txHash: TX_HASH });
}

/** INV-11 / SF-2 hang class: ignore completion and always wait. */
async function hangAlwaysWaitPostExecute(input: {
  completion: 'submitted' | 'confirmed';
  id: string;
}): Promise<'waited'> {
  void input.completion;
  await mockWaitForTransactionReceipt({
    hash: input.id as `0x${string}`,
    confirmations: 1,
    timeout: 120_000,
  });
  return 'waited';
}

/** INV-11 / SF-3 assert class: always probe key purpose. */
async function alwaysAssertKeyPurpose(): Promise<void> {
  await mockReadContract({ functionName: 'keyHasPurpose' });
}

/**
 * Passthrough regression defect: wrap a successful execute with a receipt wait.
 * Must fail fast via poisoned wait — not wall-clock sleep (INV-19).
 */
async function postExecuteWaitWrapper(input: {
  id: string;
}): Promise<{ id: string; completion: 'submitted' }> {
  await mockWaitForTransactionReceipt({
    hash: input.id as `0x${string}`,
    confirmations: 1,
    timeout: 1,
  });
  return { id: input.id, completion: 'submitted' };
}

/** Strip-leak defect: public wire spreads WriteExecutionResult (INV-3 RED). */
function stripLeakReturn(id: string): { id: string; completion: 'submitted' } {
  return { id, completion: 'submitted' };
}

const SAMPLE_CLAIM: OnboardingClaim = {
  topic: '1',
  scheme: 1,
  data: '0xdeadbeef',
  signature: '0xc0ffee',
  issuer: ISSUER,
};

async function invokeOp(
  capability: EvmIRSCapability,
  op: MatrixOp,
  mode: MatrixMode
): Promise<unknown> {
  const exec = executionFor(mode);
  switch (op) {
    case 'deployOnchainId':
      return capability.deployOnchainId({ holder: HOLDER }, exec);
    case 'grantHolderManagementKey':
      return capability.grantHolderManagementKey({ holder: HOLDER, onchainId: ONCHAINID }, exec);
    case 'attachClaim':
      return capability.attachClaim({ onchainId: ONCHAINID, claim: SAMPLE_CLAIM }, exec);
    case 'registerIdentity':
      return capability.registerIdentity(
        { holder: HOLDER, onchainId: ONCHAINID, country: 840 },
        exec
      );
    case 'registerTrustedIssuer':
      return capability.registerTrustedIssuer({ issuer: ISSUER, topics: ['1'] }, exec);
  }
}

function assertExpectReturn(outcome: unknown, expectReturn: ExpectReturn, mode: MatrixMode): void {
  switch (expectReturn) {
    case 'deploy-submitted':
      expect(outcome).toEqual({ id: RELAYER_TX_ID, completion: 'submitted' });
      expect(outcome).not.toHaveProperty('onchainId');
      break;
    case 'deploy-confirmed':
      expect(outcome).toEqual({
        id: TX_HASH,
        onchainId: ONCHAINID,
        completion: 'confirmed',
      });
      break;
    case 'id-only':
      // Submit-only fixtures use submit-early strategy → preferred relayer id (SF-1).
      expect(outcome).toEqual(mode === 'submitted' ? { id: RELAYER_TX_ID } : { id: TX_HASH });
      expect(outcome).not.toHaveProperty('completion');
      expect(outcome).not.toHaveProperty('onchainId');
      break;
    case 'noop-sentinel':
      expect(outcome).toEqual({ id: TRUSTED_ISSUER_NOOP_ID });
      expect(outcome).not.toHaveProperty('completion');
      break;
  }
}

describe('SF-4 IRS write-completion matrix', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('INV-1: matrix covers all five IRS identity write ops', () => {
    const ops = new Set(MATRIX_ROWS.map((r) => r.op));
    for (const op of REQUIRED_OPS) {
      expect(ops.has(op), `matrix missing rows for ${op}`).toBe(true);
    }
    expect(ops.size).toBe(REQUIRED_OPS.length);
  });

  it('INV-2: includes absent on deploy/grant and on a passthrough op', () => {
    const absentDeployOrGrant = MATRIX_ROWS.some(
      (r) =>
        r.mode === 'absent' && (r.op === 'deployOnchainId' || r.op === 'grantHolderManagementKey')
    );
    const absentPassthrough = MATRIX_ROWS.some(
      (r) => r.mode === 'absent' && (r.op === 'attachClaim' || r.op === 'registerIdentity')
    );
    expect(absentDeployOrGrant).toBe(true);
    expect(absentPassthrough).toBe(true);
  });

  describe.each(MATRIX_ROWS)('$op × $mode ($defect)', (row) => {
    it('INV-11 NON-VACUITY: defect RED → fix GREEN; confirmed-path anchors', async () => {
      const { op, mode, defect, expectReturn } = row;

      // ---- RED: construct defect ----
      if (defect === 'always-wait-post-execute') {
        mockWaitForTransactionReceipt.mockRejectedValueOnce(
          new Error('PoisonedWait: hang class must not sleep')
        );
        const completion = mode === 'submitted' ? 'submitted' : 'confirmed';
        await expect(hangAlwaysWaitPostExecute({ completion, id: TX_HASH })).rejects.toThrow(
          /PoisonedWait/
        );
        expect(mockWaitForTransactionReceipt).toHaveBeenCalledOnce();
        mockWaitForTransactionReceipt.mockReset();
      }

      if (defect === 'always-assert-key-purpose') {
        mockReadContract.mockRejectedValueOnce(new Error('PoisonedAssert: keyHasPurpose'));
        await expect(alwaysAssertKeyPurpose()).rejects.toThrow(/PoisonedAssert/);
        expect(mockReadContract).toHaveBeenCalledOnce();
        mockReadContract.mockReset();
      }

      if (defect === 'post-execute-wait-wrapper') {
        mockWaitForTransactionReceipt.mockRejectedValueOnce(
          new Error('PoisonedWait: passthrough must not wait')
        );
        await expect(postExecuteWaitWrapper({ id: TX_HASH })).rejects.toThrow(/PoisonedWait/);
        expect(mockWaitForTransactionReceipt).toHaveBeenCalledOnce();
        mockWaitForTransactionReceipt.mockReset();
      }

      if (defect === 'strip-leak') {
        const leaked = stripLeakReturn(TX_HASH);
        expect(leaked).toHaveProperty('completion', 'submitted');
        // RED vs public contract: leaked shape is not exact `{ id }`
        expect(Object.keys(leaked).sort()).not.toEqual(['id']);
      }

      // ---- GREEN: real service method ----
      if (op === 'deployOnchainId') {
        // SF-5: factory getIdentity not_found before execute (both modes)
        mockReadContract.mockResolvedValueOnce(ZERO);
        if (mode !== 'submitted') {
          mockWaitForTransactionReceipt.mockResolvedValueOnce(walletLinkedReceipt());
          mockReadContract.mockResolvedValueOnce(true); // operator MANAGEMENT assert
        }
      }
      if (op === 'grantHolderManagementKey') {
        // SF-5: pre-submit keyHasPurpose lacks before execute (both modes)
        mockReadContract.mockResolvedValueOnce(false);
        if (mode !== 'submitted') {
          mockReadContract.mockResolvedValueOnce(true); // post-submit assert
        }
      }
      if (op === 'registerIdentity') {
        mockReadContract.mockResolvedValueOnce(ZERO); // getOnchainId pre-check
      }
      if (op === 'registerTrustedIssuer' && defect === 'audit-noop') {
        mockReadContract.mockResolvedValueOnce(true); // already trusted
      }
      if (op === 'registerTrustedIssuer' && defect === 'audit-execute') {
        mockReadContract.mockResolvedValueOnce(false); // not trusted → execute
      }

      const { capability, signAndBroadcast } = makeCapability(signAndBroadcastFor(mode));
      const outcome = await invokeOp(capability, op, mode);

      assertExpectReturn(outcome, expectReturn, mode);

      // Side-effect / call-count anchors (INV-12 / INV-15 / INV-16 / INV-17)
      if (op === 'deployOnchainId') {
        if (mode === 'submitted') {
          expect(mockWaitForTransactionReceipt).not.toHaveBeenCalled();
          expect(signAndBroadcast).toHaveBeenCalledOnce();
          expect(mockReadContract).toHaveBeenCalledOnce(); // SF-5 factory probe only
        } else {
          expect(mockWaitForTransactionReceipt).toHaveBeenCalledOnce();
          expect(mockGetTransactionReceipt).not.toHaveBeenCalled();
          expect(mockReadContract).toHaveBeenCalledTimes(2); // factory + assert
        }
      }

      if (op === 'grantHolderManagementKey') {
        if (mode === 'submitted') {
          expect(mockReadContract).toHaveBeenCalledOnce(); // SF-5 pre-submit only
        } else {
          expect(mockReadContract).toHaveBeenCalledTimes(2); // pre + post
        }
        expect(signAndBroadcast).toHaveBeenCalledOnce();
      }

      if (op === 'attachClaim') {
        expect(signAndBroadcast).toHaveBeenCalledOnce();
        expect(mockWaitForTransactionReceipt).not.toHaveBeenCalled();
      }

      if (op === 'registerIdentity') {
        expect(signAndBroadcast).toHaveBeenCalledOnce();
        expect(mockWaitForTransactionReceipt).not.toHaveBeenCalled();
        // Pre-submit getOnchainId still ran (INV-15)
        expect(mockReadContract).toHaveBeenCalledOnce();
      }

      if (op === 'registerTrustedIssuer' && defect === 'audit-noop') {
        expect(signAndBroadcast).not.toHaveBeenCalled();
      }
      if (op === 'registerTrustedIssuer' && defect === 'audit-execute') {
        expect(signAndBroadcast).toHaveBeenCalledOnce();
        expect(mockWaitForTransactionReceipt).not.toHaveBeenCalled();
      }
    });
  });

  it('INV-8: grant confirmed still throws IdentityOperationFailed when holder lacks MANAGEMENT', async () => {
    // SF-5: pre-submit lacks proceeds; post-submit assert still lacks
    mockReadContract.mockResolvedValueOnce(false).mockResolvedValueOnce(false);
    const { capability } = makeCapability();
    await expect(
      capability.grantHolderManagementKey({ holder: HOLDER, onchainId: ONCHAINID }, EXEC_CONFIG)
    ).rejects.toBeInstanceOf(IdentityOperationFailed);
  });

  it('INV-7: disagreement through attachClaim is not swallowed into IdentityOperationFailed or { id }', async () => {
    // Strip path must not catch/map WriteCompletionDisagreementError (SF-1 owns both directions).
    const { capability, signAndBroadcast } = makeCapability(
      vi.fn().mockResolvedValue({
        txHash: TX_HASH,
        result: { completion: 'submitted' },
      })
    );

    const error = await capability
      .attachClaim(
        { onchainId: ONCHAINID, claim: SAMPLE_CLAIM },
        relayerConfig({ completion: 'confirmed' })
      )
      .then((outcome) => outcome)
      .catch((e: unknown) => e);

    expect(
      error,
      'INV-7 violated: disagreement must THROW, not resolve to a success { id }'
    ).toBeInstanceOf(WriteCompletionDisagreementError);
    expect(error).not.toBeInstanceOf(IdentityOperationFailed);
    expect((error as WriteCompletionDisagreementError).code).toBe('WRITE_COMPLETION_DISAGREEMENT');
    expect(signAndBroadcast).toHaveBeenCalledOnce();
    expect(mockWaitForTransactionReceipt).not.toHaveBeenCalled();
  });

  it('INV-7 (reverse): options submitted + result confirmed through registerIdentity still THROWs', async () => {
    mockReadContract.mockResolvedValueOnce(ZERO);
    const { capability } = makeCapability(
      vi.fn().mockResolvedValue({
        txHash: TX_HASH,
        result: { completion: 'confirmed' },
      })
    );

    await expect(
      capability.registerIdentity(
        { holder: HOLDER, onchainId: ONCHAINID, country: 840 },
        relayerConfig({ completion: 'submitted' })
      )
    ).rejects.toBeInstanceOf(WriteCompletionDisagreementError);
  });

  it('INV-13: matrix suite does not cross-import SF-2/SF-3 deep test modules', () => {
    const source = readFileSync(fileURLToPath(import.meta.url), 'utf8');
    // Forbid Vitest double-registration via import of deep suites as libraries.
    expect(source).not.toMatch(/from\s+['"][^'"]*deploy-submit-only[^'"]*['"]/);
    expect(source).not.toMatch(/from\s+['"][^'"]*onboard-management-keys[^'"]*['"]/);
    expect(source).not.toMatch(/require\s*\(\s*['"][^'"]*deploy-submit-only/);
    expect(source).not.toMatch(/require\s*\(\s*['"][^'"]*onboard-management-keys/);
    // Deep suites remain on disk as authoritative edge coverage (INV-13).
    const dir = dirname(fileURLToPath(import.meta.url));
    const deepSf2 = 'irs.' + 'deploy-submit-only' + '.test.ts';
    const deepSf3 = 'irs.' + 'onboard-management-keys' + '.test.ts';
    expect(() => readFileSync(resolve(dir, deepSf2), 'utf8')).not.toThrow();
    expect(() => readFileSync(resolve(dir, deepSf3), 'utf8')).not.toThrow();
  });
});
