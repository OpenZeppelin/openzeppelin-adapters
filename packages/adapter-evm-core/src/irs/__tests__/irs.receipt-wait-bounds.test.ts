/**
 * `deployReceiptWait` bounds enforcement.
 *
 * These tests exist because the module DOCUMENTED a guarantee it did not ENFORCE: the docstring
 * says the wait must be bounded, while the implementation was a bare `?? default`, and `??` only
 * substitutes for null/undefined. So `0`, `-1`, `1.5`, `NaN` and `Infinity` all reached viem.
 *
 * Each is independently harmful (verified against viem 2.44.4
 * `actions/public/waitForTransactionReceipt.ts`):
 *   - `timeout: 0`        -> `timeout ? setTimeout(...) : undefined` (L175) leaves NO timer, i.e.
 *                            the unbounded wait the docstring forbids.
 *   - `timeout: Infinity` -> handed to setTimeout, which Node coerces to 1 ms, so every deploy
 *                            times out at once and reports INDETERMINATE.
 *   - `confirmations: 0`  -> viem short-circuits on `confirmations <= 1` (L193), so it is identical
 *                            to 1 — ambiguous input, zero added capability.
 *
 * ONE TEST PER BAD INPUT, deliberately not a table-driven catch-all: a single loop that regressed
 * would go silent for every case at once.
 *
 * RED-FIRST: every test here fails against the previous `?? default` implementation, which accepted
 * all of these without complaint.
 */
import { describe, expect, it, vi } from 'vitest';

import type { IRSCapability } from '@openzeppelin/ui-types';

import { createIRS, type CreateIRSOptions } from '../../capabilities/irs';
import {
  DEFAULT_DEPLOY_CONFIRMATIONS,
  DEFAULT_DEPLOY_RECEIPT_TIMEOUT_MS,
  InvalidDeployReceiptWaitError,
  resolveDeployReceiptWait,
} from '../receipt-identity';

const OPERATOR = '0xDD601cb1dDb4471e88C51A5f64A9d54294179142';

const ADDRESSES = {
  identityRegistry: '0x1111111111111111111111111111111111111111',
  identityFactory: '0x2222222222222222222222222222222222222222',
  trustedIssuersRegistry: '0x3333333333333333333333333333333333333333',
} as const;

/** Construct through the real capability factory, so the boot-time guarantee is what is tested. */
function construct(deployReceiptWait?: {
  confirmations?: number;
  timeoutMs?: number;
}): IRSCapability {
  const options: CreateIRSOptions = {
    signAndBroadcast: vi.fn(),
    addresses: { ...ADDRESSES },
    operatorManagementKey: OPERATOR,
    deployReceiptWait,
  };

  return createIRS(
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

describe('resolveDeployReceiptWait — confirmations', () => {
  it('rejects 0 (viem treats <=1 identically, so it is ambiguous, not useful)', () => {
    expect(() => resolveDeployReceiptWait({ confirmations: 0 })).toThrow(
      InvalidDeployReceiptWaitError
    );
  });

  it('rejects a negative confirmations count', () => {
    expect(() => resolveDeployReceiptWait({ confirmations: -1 })).toThrow(
      InvalidDeployReceiptWaitError
    );
  });

  it('rejects a non-integer confirmations count', () => {
    expect(() => resolveDeployReceiptWait({ confirmations: 1.5 })).toThrow(
      InvalidDeployReceiptWaitError
    );
  });

  it('rejects NaN confirmations', () => {
    expect(() => resolveDeployReceiptWait({ confirmations: Number.NaN })).toThrow(
      InvalidDeployReceiptWaitError
    );
  });

  it('rejects Infinity confirmations', () => {
    expect(() => resolveDeployReceiptWait({ confirmations: Number.POSITIVE_INFINITY })).toThrow(
      InvalidDeployReceiptWaitError
    );
  });

  it('accepts a valid integer >= 1', () => {
    expect(resolveDeployReceiptWait({ confirmations: 3 })).toEqual({
      confirmations: 3,
      timeoutMs: DEFAULT_DEPLOY_RECEIPT_TIMEOUT_MS,
    });
  });
});

describe('resolveDeployReceiptWait — timeoutMs', () => {
  it('rejects 0 — viem would disable its timer entirely, i.e. an UNBOUNDED wait', () => {
    expect(() => resolveDeployReceiptWait({ timeoutMs: 0 })).toThrow(InvalidDeployReceiptWaitError);
  });

  it('rejects a negative timeout', () => {
    expect(() => resolveDeployReceiptWait({ timeoutMs: -1 })).toThrow(
      InvalidDeployReceiptWaitError
    );
  });

  it('rejects NaN timeout', () => {
    expect(() => resolveDeployReceiptWait({ timeoutMs: Number.NaN })).toThrow(
      InvalidDeployReceiptWaitError
    );
  });

  it('rejects Infinity timeout — the outage case the docstring forbids', () => {
    expect(() => resolveDeployReceiptWait({ timeoutMs: Number.POSITIVE_INFINITY })).toThrow(
      InvalidDeployReceiptWaitError
    );
  });

  it('rejects -Infinity timeout', () => {
    expect(() => resolveDeployReceiptWait({ timeoutMs: Number.NEGATIVE_INFINITY })).toThrow(
      InvalidDeployReceiptWaitError
    );
  });

  it('rejects a non-integer timeout', () => {
    expect(() => resolveDeployReceiptWait({ timeoutMs: 1500.5 })).toThrow(
      InvalidDeployReceiptWaitError
    );
  });

  it('accepts a finite positive integer', () => {
    expect(resolveDeployReceiptWait({ timeoutMs: 45_000 })).toEqual({
      confirmations: DEFAULT_DEPLOY_CONFIRMATIONS,
      timeoutMs: 45_000,
    });
  });
});

describe('resolveDeployReceiptWait — defaults and messages', () => {
  it('applies both defaults when no options are supplied', () => {
    expect(resolveDeployReceiptWait()).toEqual({
      confirmations: DEFAULT_DEPLOY_CONFIRMATIONS,
      timeoutMs: DEFAULT_DEPLOY_RECEIPT_TIMEOUT_MS,
    });
  });

  it('still applies defaults for explicit undefined (the `??` behaviour that is intended)', () => {
    expect(resolveDeployReceiptWait({ confirmations: undefined, timeoutMs: undefined })).toEqual({
      confirmations: DEFAULT_DEPLOY_CONFIRMATIONS,
      timeoutMs: DEFAULT_DEPLOY_RECEIPT_TIMEOUT_MS,
    });
  });

  it('names the offending field and the received value', () => {
    expect(() => resolveDeployReceiptWait({ timeoutMs: Number.POSITIVE_INFINITY })).toThrow(
      /deployReceiptWait\.timeoutMs.*Infinity/s
    );
    expect(() => resolveDeployReceiptWait({ confirmations: 0 })).toThrow(
      /deployReceiptWait\.confirmations.*0/s
    );
  });
});

describe('bounds are enforced at CONSTRUCTION, not at first deploy', () => {
  // The point of failing here: a misconfiguration surfaces at boot, not on a real holder's deploy.
  it('throws when constructing with an unbounded timeout', () => {
    expect(() => construct({ timeoutMs: Number.POSITIVE_INFINITY })).toThrow(
      InvalidDeployReceiptWaitError
    );
  });

  it('throws when constructing with confirmations: 0', () => {
    expect(() => construct({ confirmations: 0 })).toThrow(InvalidDeployReceiptWaitError);
  });

  it('constructs cleanly with valid bounds', () => {
    expect(() => construct({ confirmations: 2, timeoutMs: 60_000 })).not.toThrow();
  });

  it('constructs cleanly with no bounds supplied (defaults apply)', () => {
    expect(() => construct()).not.toThrow();
  });
});
