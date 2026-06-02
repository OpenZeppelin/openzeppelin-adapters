/**
 * Strategy-agnostic write composition test (US6, SC-006, FR-018).
 *
 * Demonstrates that a capability write composes with *either* existing execution strategy
 * (`EoaExecutionStrategy`, `RelayerExecutionStrategy`) behind the injected `signAndBroadcast`
 * callback, with zero capability-side change. The capability never references a concrete
 * strategy; a thin `strategyToSignAndBroadcast` adapter bridges any `AdapterExecutionStrategy`
 * into the injected-callback shape, binding the wallet implementation the strategy needs.
 *
 * Each strategy's *internal* execution is covered by its own unit tests; here we assert the
 * composition seam: the same assembled calldata, execution config, and runtime key flow
 * through unchanged, and the confirmed hash surfaces as the operation id.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ExecutionConfig } from '@openzeppelin/ui-types';

import { createERC3643 } from '../../capabilities/erc3643';
import type { SignAndBroadcast } from '../../capabilities/helpers';
import { EoaExecutionStrategy } from '../../transaction/eoa';
import type { AdapterExecutionStrategy } from '../../transaction/execution-strategy';
import { RelayerExecutionStrategy } from '../../transaction/relayer';
import type { EvmWalletImplementation } from '../../transaction/types';

const TOKEN = '0x1111111111111111111111111111111111111111';
const TO = '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB';
const FROM = '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa';
const EOA_HASH = '0xeoahash';
const RELAYER_HASH = '0xrelayerhash';

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
 * Bridge any wallet-bound {@link AdapterExecutionStrategy} into the injected-callback shape the
 * capability consumes. This is the only glue the RI plugin needs to reuse existing strategies —
 * the capability itself is unaware of which strategy runs.
 */
function strategyToSignAndBroadcast(
  strategy: AdapterExecutionStrategy,
  wallet: EvmWalletImplementation
): SignAndBroadcast {
  return (txData, executionConfig, onStatusChange, runtimeApiKey) =>
    strategy.execute(
      txData as Parameters<AdapterExecutionStrategy['execute']>[0],
      executionConfig,
      wallet,
      onStatusChange,
      runtimeApiKey
    );
}

/** Minimal connected-wallet stub whose `writeContract` records params and returns a fixed hash. */
function createWalletStub(writeContract: ReturnType<typeof vi.fn>): EvmWalletImplementation {
  const walletClient = { chain: { id: NETWORK_CONFIG.chainId }, writeContract };
  return {
    getWalletClient: vi.fn().mockResolvedValue(walletClient),
    getPublicClient: vi.fn().mockResolvedValue(null),
    getWalletConnectionStatus: vi.fn().mockReturnValue({ isConnected: true, address: FROM }),
    switchNetwork: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as EvmWalletImplementation;
}

afterEach(() => vi.restoreAllMocks());

describe('ERC-3643 write is strategy-agnostic behind the injected callback', () => {
  it('composes with the real EoaExecutionStrategy and surfaces the EOA hash', async () => {
    const writeContract = vi.fn().mockResolvedValue(EOA_HASH);
    const wallet = createWalletStub(writeContract);
    const signAndBroadcast = strategyToSignAndBroadcast(new EoaExecutionStrategy(), wallet);

    const token = createERC3643(NETWORK_CONFIG, { signAndBroadcast, tokenAddress: TOKEN });
    const eoaConfig = { method: 'eoa', allowAny: true } as unknown as ExecutionConfig;

    const result = await token.mint({ to: TO, amount: '1000' }, eoaConfig);

    expect(result).toEqual({ id: EOA_HASH });
    // The capability's assembled calldata flowed through the strategy unchanged.
    expect(writeContract).toHaveBeenCalledTimes(1);
    expect(writeContract.mock.calls[0][0]).toMatchObject({
      address: TOKEN,
      functionName: 'mint',
      args: [TO, 1000n],
    });
  });

  it('composes with the RelayerExecutionStrategy via the same adapter and write', async () => {
    const strategy = new RelayerExecutionStrategy();
    const executeSpy = vi.spyOn(strategy, 'execute').mockResolvedValue({ txHash: RELAYER_HASH });
    const wallet = createWalletStub(vi.fn());
    const signAndBroadcast = strategyToSignAndBroadcast(strategy, wallet);

    const token = createERC3643(NETWORK_CONFIG, { signAndBroadcast, tokenAddress: TOKEN });
    const relayerConfig = { method: 'relayer' } as unknown as ExecutionConfig;

    const result = await token.mint(
      { to: TO, amount: '1000' },
      relayerConfig,
      undefined,
      'api-key'
    );

    expect(result).toEqual({ id: RELAYER_HASH });
    // Same capability + same write, different strategy: assembled calldata, config, and the
    // session API key are forwarded to the strategy unchanged.
    expect(executeSpy).toHaveBeenCalledTimes(1);
    const [txData, passedConfig, , , runtimeApiKey] = executeSpy.mock.calls[0];
    expect(txData).toMatchObject({ address: TOKEN, functionName: 'mint', args: [TO, 1000n] });
    expect(passedConfig).toBe(relayerConfig);
    expect(runtimeApiKey).toBe('api-key');
  });
});
