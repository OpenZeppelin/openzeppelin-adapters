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
  /**
   * Confirmations to require. Must be an integer >= 1. Defaults to
   * {@link DEFAULT_DEPLOY_CONFIRMATIONS}.
   */
  confirmations?: number;
  /**
   * Milliseconds before giving up. Must be a finite integer > 0. Defaults to
   * {@link DEFAULT_DEPLOY_RECEIPT_TIMEOUT_MS}.
   */
  timeoutMs?: number;
}

/** Thrown for a `deployReceiptWait` that cannot uphold the bounded-wait guarantee. */
export class InvalidDeployReceiptWaitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDeployReceiptWaitError';
  }
}

/**
 * Resolve AND VALIDATE the effective wait bounds, so the call, the log line, and the timeout
 * message all quote the same numbers.
 *
 * ## Why this throws rather than clamping
 *
 * `??` only substitutes for `null` / `undefined`, so a bare `?? default` lets `0`, `NaN`,
 * `Infinity` and negatives through to viem — and each is actively harmful, verified against
 * viem 2.44.4 `actions/public/waitForTransactionReceipt.ts`:
 *
 * - `timeout: 0` — `const timer = timeout ? setTimeout(...) : undefined` (L175). A falsy timeout
 *   disables the timer entirely, producing exactly the UNBOUNDED wait this module's own docstring
 *   forbids: an outage inside a server-side route, not a slow response.
 * - `timeout: Infinity` / `NaN` — passed to `setTimeout`, which Node coerces to 1 ms. Every deploy
 *   would then time out almost immediately and report INDETERMINATE — the "may still land, do not
 *   retry blind" path — so every holder looks stuck.
 * - `confirmations: 0` — viem short-circuits on `confirmations <= 1` (L193), so 0 is
 *   behaviourally IDENTICAL to 1. Rejecting it removes no capability; it only removes ambiguity.
 *
 * Clamping was the alternative, and was rejected: silently rewriting a caller's safety bound would
 * hide a misconfiguration whose consequences are money-adjacent, and the only channel for saying
 * so would be a warning log — a channel this codebase has already been bitten by treating as
 * reliable. A throw is loud, and because {@link EvmIRSService} resolves these options in its
 * CONSTRUCTOR, it fires at boot rather than at the first deploy.
 *
 * @throws {InvalidDeployReceiptWaitError} for any value that cannot uphold a bounded wait.
 */
export function resolveDeployReceiptWait(options?: DeployReceiptWaitOptions): {
  confirmations: number;
  timeoutMs: number;
} {
  const confirmations = options?.confirmations ?? DEFAULT_DEPLOY_CONFIRMATIONS;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_DEPLOY_RECEIPT_TIMEOUT_MS;

  if (!Number.isInteger(confirmations) || confirmations < 1) {
    throw new InvalidDeployReceiptWaitError(
      `deployReceiptWait.confirmations must be an integer >= 1, received ${String(confirmations)}. ` +
        `viem treats confirmations <= 1 identically, so use 1 for the fastest safe setting.`
    );
  }

  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new InvalidDeployReceiptWaitError(
      `deployReceiptWait.timeoutMs must be a finite integer > 0 (milliseconds), received ` +
        `${String(timeoutMs)}. The deploy wait must stay bounded: viem disables its timeout timer ` +
        `for a falsy value, and Node coerces Infinity/NaN to 1 ms, so neither yields a usable bound.`
    );
  }

  return { confirmations, timeoutMs };
}
