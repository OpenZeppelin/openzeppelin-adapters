/**
 * ONCHAINID ERC-734 key helpers (pinned to `@onchain-id/solidity@2.2.1`).
 *
 * @module irs/identity-keys
 */

import { encodeAbiParameters, keccak256, type Chain, type Hex } from 'viem';

import { logger } from '@openzeppelin/ui-utils';

import { createEvmPublicClient } from '../utils/public-client';
import { KEY_HAS_PURPOSE_ABI } from './abis';

const LOG_SYSTEM = 'EvmIrsIdentityKeys';

/** ERC-734 purpose: MANAGEMENT key (can manage the identity, including `addKey`). */
export const IDENTITY_KEY_PURPOSE_MANAGEMENT = 1;

/** ERC-734 key type: ECDSA (standard for Ethereum addresses). */
export const IDENTITY_KEY_TYPE_ECDSA = 1;

/**
 * Result of probing `keyHasPurpose` on an ONCHAINID identity.
 *
 * `lacks` (on-chain false) is distinct from `read_failed` (RPC/transport failure).
 */
export type IdentityKeyPurposeLookup =
  | { readonly status: 'has' }
  | { readonly status: 'lacks' }
  | { readonly status: 'read_failed'; readonly cause: Error };

/**
 * The bytes32 key hash IdFactory / Identity use for an Ethereum address:
 * `keccak256(abi.encode(address))`.
 */
export function addressToIdentityKeyHash(address: string): Hex {
  return keccak256(encodeAbiParameters([{ type: 'address' }], [address as Hex]));
}

/** Read `keyHasPurpose` on an ONCHAINID identity contract without collapsing RPC errors. */
export async function lookupIdentityKeyPurpose(
  rpcUrl: string,
  onchainId: string,
  address: string,
  purpose: number,
  viemChain?: Chain
): Promise<IdentityKeyPurposeLookup> {
  const client = createEvmPublicClient(rpcUrl, viemChain);

  try {
    const hasPurpose = (await client.readContract({
      address: onchainId as Hex,
      abi: KEY_HAS_PURPOSE_ABI,
      functionName: 'keyHasPurpose',
      args: [addressToIdentityKeyHash(address), BigInt(purpose)],
    })) as boolean;

    return hasPurpose ? { status: 'has' } : { status: 'lacks' };
  } catch (error) {
    const cause = error instanceof Error ? error : new Error(String(error));
    logger.error(
      LOG_SYSTEM,
      `lookupIdentityKeyPurpose failed for ${address} on ${onchainId}:`,
      cause
    );
    return { status: 'read_failed', cause };
  }
}

/** Read `keyHasPurpose` on an ONCHAINID identity contract. Throws on RPC failure. */
export async function identityKeyHasPurpose(
  rpcUrl: string,
  onchainId: string,
  address: string,
  purpose: number,
  viemChain?: Chain
): Promise<boolean> {
  const lookup = await lookupIdentityKeyPurpose(rpcUrl, onchainId, address, purpose, viemChain);
  if (lookup.status === 'read_failed') {
    throw lookup.cause;
  }
  return lookup.status === 'has';
}
