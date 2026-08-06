/**
 * SF-1 / F4 — ERC-4626 write-completion boundary lock.
 *
 * The shared `runCapabilityWrite` skeleton returns a `WriteExecutionResult` carrying a
 * `completion` discriminant. ERC-4626 deliberately does NOT re-export that signal: its
 * capability contract is `VaultDepositResult` / `VaultWithdrawResult`. These tests lock BOTH
 * halves of that decision so neither can silently drift:
 *
 *  1. `completion` never appears on an ERC-4626 write result (any mode) — the property is
 *     stripped, not merely `undefined`.
 *  2. The id-preference rule (INV-5) IS still inherited: a submit-only relayer write resolves
 *     `.id` to the relayer submission id, not the placeholder tx hash.
 *
 * Together these encode "id semantics inherited, discriminant not re-exported". Test (2) is
 * what makes (1) non-vacuous: stripping the discriminant must not strip the behavior.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ERC4626Capability,
  ExecutionConfig,
  RelayerExecutionConfig,
} from '@openzeppelin/ui-types';

import { createERC4626, type CreateERC4626Options } from '../../capabilities/erc4626';
import type { SignAndBroadcast } from '../../capabilities/helpers';

const mockReadContract = vi.fn();

vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem');
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({ readContract: mockReadContract })),
    http: vi.fn((url: string) => ({ url, type: 'http' })),
  };
});

const VAULT = '0x1111111111111111111111111111111111111111';
const HOLDER = '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa';
const TX_HASH = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
const PLACEHOLDER_TX = '0x0000000000000000000000000000000000000000000000000000000000000000';
const RELAYER_TX_ID = 'relayer-erc4626-sub-1';

const EOA_CONFIG = { method: 'eoa' } as unknown as ExecutionConfig;

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

function makeCapability(signImpl: ReturnType<typeof vi.fn>): ERC4626Capability {
  const options: CreateERC4626Options = {
    // Test double: `vi.fn()` is intentionally loosely typed so `.mock.calls` stay inspectable.
    signAndBroadcast: signImpl as unknown as SignAndBroadcast,
    vaultAddress: VAULT,
  };
  return createERC4626(
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
}

describe('ERC-4626 write-completion boundary (SF-1 / F4)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('omits `completion` on the confirmed path — property absent, not undefined', async () => {
    const capability = makeCapability(vi.fn().mockResolvedValue({ txHash: TX_HASH }));

    const result = await capability.deposit({ from: HOLDER, amount: '1000' }, EOA_CONFIG);

    expect(result).toEqual({ id: TX_HASH });
    expect(
      Object.prototype.hasOwnProperty.call(result, 'completion'),
      'F4 violated: shared executor `completion` leaked onto the ERC-4626 result'
    ).toBe(false);
    expect(Object.keys(result)).toEqual(['id']);
  });

  it('omits `completion` on the submit-only relayer path too', async () => {
    const capability = makeCapability(
      vi.fn().mockResolvedValue({
        txHash: PLACEHOLDER_TX,
        result: { completion: 'submitted', relayerTxId: RELAYER_TX_ID },
      })
    );

    const result = await capability.withdraw(
      { from: HOLDER, shares: '500' },
      relayerConfig({ completion: 'submitted' })
    );

    expect(
      Object.prototype.hasOwnProperty.call(result, 'completion'),
      'F4 violated: submit-only `completion` leaked onto the ERC-4626 result'
    ).toBe(false);
    expect(Object.keys(result)).toEqual(['id']);
  });

  it('still inherits the INV-5 id-preference rule: submit-only `.id` is the relayer submission id', async () => {
    const capability = makeCapability(
      vi.fn().mockResolvedValue({
        txHash: PLACEHOLDER_TX,
        result: { completion: 'submitted', relayerTxId: RELAYER_TX_ID },
      })
    );

    const result = await capability.deposit(
      { from: HOLDER, amount: '1000' },
      relayerConfig({ completion: 'submitted' })
    );

    // Non-vacuity guard for the two tests above: stripping the discriminant must NOT
    // strip the shared id-preference behavior.
    expect(
      result.id,
      'INV-5 violated: submit-only write must resolve `.id` to the relayer submission id'
    ).toBe(RELAYER_TX_ID);
    expect(result.id).not.toBe(PLACEHOLDER_TX);
  });

  it('prefers the mined tx hash over relayerTxId on the confirmed relayer path', async () => {
    const capability = makeCapability(
      vi.fn().mockResolvedValue({
        txHash: TX_HASH,
        result: { completion: 'confirmed', relayerTxId: RELAYER_TX_ID },
      })
    );

    const result = await capability.deposit(
      { from: HOLDER, amount: '1000' },
      relayerConfig({ completion: 'confirmed' })
    );

    expect(result).toEqual({ id: TX_HASH });
  });
});
