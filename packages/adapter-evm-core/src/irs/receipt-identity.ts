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

export type ReceiptFetchClient = {
  getTransactionReceipt: (args: { hash: Hash }) => Promise<TransactionReceipt>;
};
