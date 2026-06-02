/**
 * Submit-then-poll execution-contract test for the RI write path (US6, SC-006, FR-018).
 *
 * Verifies (does not extend) that the capability's injected `signAndBroadcast` callback shape
 * accommodates the async two-step model the RI plugin needs: submit a transaction (yielding an
 * intermediate id), then poll until a confirmed hash is available — exactly what
 * `ExecutionCapability.signAndBroadcast` + the optional `waitForTransactionConfirmation` already
 * express. The capability stays a thin orchestrator: it awaits the callback and surfaces the
 * confirmed hash as the operation id, regardless of how many internal steps the callback ran.
 *
 * No live chain / relayer: the injected callback simulates submit + poll with recorded events.
 */
import { describe, expect, it, vi } from 'vitest';

import type { ExecutionConfig, TransactionStatusUpdate, TxStatus } from '@openzeppelin/ui-types';

import { createERC3643 } from '../../capabilities/erc3643';
import type { SignAndBroadcast } from '../../capabilities/helpers';

const EXEC_CONFIG = { method: 'relayer' } as unknown as ExecutionConfig;
const TOKEN = '0x1111111111111111111111111111111111111111';
const TO = '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB';
const SUBMIT_ID = 'relayer-tx-1';
const CONFIRMED_HASH = '0xconfirmedhash';

const NETWORK_CONFIG = {
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
} as const;

/**
 * A submit-then-poll `signAndBroadcast`: it emits a `pendingRelayer` status carrying the
 * intermediate submit id, awaits a (simulated) confirmation poll, then resolves the confirmed
 * hash. `events` records the ordered control flow so the test can assert the two-step sequence.
 */
function createSubmitThenPollCallback(events: string[]): SignAndBroadcast {
  const submit = vi.fn(async () => {
    events.push('submit');
    return { transactionId: SUBMIT_ID };
  });

  const pollForConfirmation = vi.fn(async (transactionId: string) => {
    events.push(`poll:${transactionId}`);
    await Promise.resolve(); // model the asynchronous gap between submit and confirmation
    return { status: 'success' as const, receipt: { transactionHash: CONFIRMED_HASH } };
  });

  const signAndBroadcast: SignAndBroadcast = async (
    _txData,
    _executionConfig,
    onStatusChange,
    _runtimeApiKey
  ) => {
    const { transactionId } = await submit();
    onStatusChange('pendingRelayer', { transactionId } as TransactionStatusUpdate);

    const confirmation = await pollForConfirmation(transactionId);
    if (confirmation.status !== 'success') {
      throw new Error('confirmation failed');
    }
    events.push('resolve');
    return { txHash: confirmation.receipt.transactionHash, result: confirmation.receipt };
  };

  return Object.assign(signAndBroadcast, { submit, pollForConfirmation });
}

describe('ERC-3643 write conforms to the submit-then-poll execution contract (FR-018)', () => {
  it('resolves the confirmed hash after a submit → poll two-step flow', async () => {
    const events: string[] = [];
    const signAndBroadcast = createSubmitThenPollCallback(events);
    const statuses: TxStatus[] = [];

    const token = createERC3643(NETWORK_CONFIG, { signAndBroadcast, tokenAddress: TOKEN });

    const result = await token.mint({ to: TO, amount: '1000' }, EXEC_CONFIG, (status) =>
      statuses.push(status)
    );

    // The operation id is the *confirmed* hash from the poll step, not the submit-time id.
    expect(result).toEqual({ id: CONFIRMED_HASH });

    // Two-step ordering: submit, then poll keyed by the submit id, then resolve.
    expect(events).toEqual(['submit', `poll:${SUBMIT_ID}`, 'resolve']);
    expect(signAndBroadcast.submit).toHaveBeenCalledTimes(1);
    expect(signAndBroadcast.pollForConfirmation).toHaveBeenCalledWith(SUBMIT_ID);

    // The intermediate submit status streamed through to the capability's status callback.
    expect(statuses).toContain('pendingRelayer');
  });

  it('surfaces a polled confirmation failure as a rejected write', async () => {
    const failingPoll: SignAndBroadcast = async (_txData, _cfg, onStatusChange) => {
      onStatusChange('pendingRelayer', {} as TransactionStatusUpdate);
      await Promise.resolve();
      throw new Error('Transaction failed: reverted during inclusion');
    };

    const token = createERC3643(NETWORK_CONFIG, {
      signAndBroadcast: failingPoll,
      tokenAddress: TOKEN,
    });

    // A failure discovered during the poll step propagates as a typed capability error.
    await expect(token.mint({ to: TO, amount: '1' }, EXEC_CONFIG)).rejects.toMatchObject({
      code: 'OPERATION_FAILED',
      operation: 'mint',
    });
  });
});
