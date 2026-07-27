/**
 * ONCHAINID ERC-734 key helpers (pinned to `@onchain-id/solidity@2.2.1`).
 *
 * @module irs/identity-keys
 */

import { encodeAbiParameters, keccak256, type Hex } from 'viem';

import { createEvmPublicClient } from '../utils/public-client';
import { KEY_HAS_PURPOSE_ABI } from './abis';

/** ERC-734 purpose: MANAGEMENT key (can manage the identity, including `addKey`). */
export const IDENTITY_KEY_PURPOSE_MANAGEMENT = 1;

/** ERC-734 key type: ECDSA (standard for Ethereum addresses). */
export const IDENTITY_KEY_TYPE_ECDSA = 1;

/**
 * The bytes32 key hash IdFactory / Identity use for an Ethereum address:
 * `keccak256(abi.encode(address))`.
 */
export function addressToIdentityKeyHash(address: string): Hex {
  return keccak256(encodeAbiParameters([{ type: 'address' }], [address as Hex]));
}

/** Read `keyHasPurpose` on an ONCHAINID identity contract. */
export async function identityKeyHasPurpose(
  rpcUrl: string,
  onchainId: string,
  address: string,
  purpose: number
): Promise<boolean> {
  const client = createEvmPublicClient(rpcUrl);
  return (await client.readContract({
    address: onchainId as Hex,
    abi: KEY_HAS_PURPOSE_ABI,
    functionName: 'keyHasPurpose',
    args: [addressToIdentityKeyHash(address), BigInt(purpose)],
  })) as boolean;
}
