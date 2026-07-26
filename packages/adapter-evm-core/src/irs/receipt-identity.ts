/**
 * Resolve a deployed ONCHAINID from an IdFactory transaction receipt.
 *
 * A receipt only exists once the transaction is mined, so this is the confirmation gate
 * `deployOnchainId` must use instead of a follow-up `getIdentity` eth_call.
 *
 * @module irs/receipt-identity
 */

import {
  getAddress,
  isAddressEqual,
  parseEventLogs,
  type Hash,
  type Log,
  type TransactionReceipt,
} from 'viem';

import { ID_FACTORY_EVENTS_ABI } from './abis';

type WalletLinkedLog = {
  eventName: 'WalletLinked';
  args: { wallet: `0x${string}`; identity: `0x${string}` };
};

type DeployedLog = {
  eventName: 'Deployed';
  args: { identity: `0x${string}` };
};

function factoryLogs(receipt: Pick<TransactionReceipt, 'logs'>, factoryAddress: string): Log[] {
  const factory = getAddress(factoryAddress);
  return receipt.logs.filter((log) => isAddressEqual(getAddress(log.address), factory));
}

/**
 * Parse `WalletLinked(wallet, identity)` from a successful deploy receipt.
 * Falls back to `Deployed(identity)` when WalletLinked is absent (defense-in-depth).
 */
export function parseIdentityFromDeployReceipt(
  receipt: Pick<TransactionReceipt, 'status' | 'logs'>,
  factoryAddress: string,
  holder: string
): string | undefined {
  if (receipt.status !== 'success') {
    return undefined;
  }

  const wallet = getAddress(holder);
  const logs = factoryLogs(receipt, factoryAddress);

  const walletLinked = (
    parseEventLogs({
      abi: ID_FACTORY_EVENTS_ABI,
      logs,
      eventName: 'WalletLinked',
    }) as WalletLinkedLog[]
  ).find((entry) => isAddressEqual(entry.args.wallet, wallet));

  if (walletLinked !== undefined) {
    return getAddress(walletLinked.args.identity);
  }

  const deployed = (
    parseEventLogs({
      abi: ID_FACTORY_EVENTS_ABI,
      logs,
      eventName: 'Deployed',
    }) as DeployedLog[]
  )[0];

  return deployed === undefined ? undefined : getAddress(deployed.args.identity);
}

/**
 * Minimal client surface the deploy path needs.
 *
 * `waitForTransactionReceipt` — NOT `getTransactionReceipt` — is deliberate and load-bearing.
 * A point-in-time `getTransactionReceipt` THROWS while the transaction is still pending, so it
 * would turn "not mined yet" into a hard failure and reintroduce exactly the bug this module
 * exists to remove: the deploy lands, the call has already reported failure, and the holder is
 * left with an unregistered identity that cannot be recreated (`createIdentity` then reverts with
 * `wallet already linked to an identity`).
 *
 * The type is deliberately narrowed to the waiting method so a point-in-time read cannot be
 * substituted here without a compile error.
 */
export type ReceiptFetchClient = {
  waitForTransactionReceipt: (args: {
    hash: Hash;
    confirmations?: number;
    timeout?: number;
  }) => Promise<TransactionReceipt>;
};

/** Confirmations required before the deploy receipt is accepted. */
export const DEFAULT_DEPLOY_CONFIRMATIONS = 1;

/**
 * Upper bound on the confirmation wait. The wait MUST be bounded: an unbounded wait inside a
 * server-side route (such as a relayer plugin route) is an outage rather than a slow response.
 */
export const DEFAULT_DEPLOY_RECEIPT_TIMEOUT_MS = 120_000;

/** Tunables for the deploy confirmation wait. */
export interface DeployReceiptWaitOptions {
  /** Confirmations to require. Defaults to {@link DEFAULT_DEPLOY_CONFIRMATIONS}. */
  confirmations?: number;
  /** Milliseconds before giving up. Defaults to {@link DEFAULT_DEPLOY_RECEIPT_TIMEOUT_MS}. */
  timeoutMs?: number;
}

/**
 * Resolve the effective wait bounds, so the call, the log line, and the timeout message all quote
 * the same numbers.
 */
export function resolveDeployReceiptWait(options?: DeployReceiptWaitOptions): {
  confirmations: number;
  timeoutMs: number;
} {
  return {
    confirmations: options?.confirmations ?? DEFAULT_DEPLOY_CONFIRMATIONS,
    timeoutMs: options?.timeoutMs ?? DEFAULT_DEPLOY_RECEIPT_TIMEOUT_MS,
  };
}
