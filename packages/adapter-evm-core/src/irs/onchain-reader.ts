/**
 * IRS On-Chain Reader.
 *
 * Reads identity-registry state (ONCHAINID lookup, verification, jurisdiction) from
 * EVM-compatible contracts via a viem public client, mirroring the access-control
 * reader pattern (stateless client per call).
 *
 * Expected-negative reads return values (never throw): an unregistered holder yields
 * `{ found: false }` / `false` / `undefined` rather than an error (IR-1, IR-2).
 *
 * @module irs/onchain-reader
 */

import type { Chain } from 'viem';

import type { OnchainIdLookup } from '@openzeppelin/ui-types';
import { IdentityOperationFailed } from '@openzeppelin/ui-types';
import { logger } from '@openzeppelin/ui-utils';

import { createEvmPublicClient } from '../utils/public-client';
import {
  GET_IDENTITY_ABI,
  IDENTITY_ABI,
  INVESTOR_COUNTRY_ABI,
  IS_TRUSTED_ISSUER_ABI,
  IS_VERIFIED_ABI,
} from './abis';

const LOG_SYSTEM = 'EvmIrsReader';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function isZeroAddress(address: string): boolean {
  return address.toLowerCase() === ZERO_ADDRESS;
}

/**
 * Look up the ONCHAINID registered for `holder` in the identity registry.
 *
 * @returns `{ found: true, onchainId }` when registered, `{ found: false }` otherwise.
 * @throws {IdentityOperationFailed} On RPC failure (not for the expected-negative case).
 */
export async function getOnchainId(
  rpcUrl: string,
  registryAddress: string,
  holder: string,
  viemChain?: Chain
): Promise<OnchainIdLookup> {
  const client = createEvmPublicClient(rpcUrl, viemChain);

  try {
    const onchainId = (await client.readContract({
      address: registryAddress as `0x${string}`,
      abi: IDENTITY_ABI,
      functionName: 'identity',
      args: [holder as `0x${string}`],
    })) as string;

    if (isZeroAddress(onchainId)) {
      return { found: false };
    }

    return { found: true, onchainId };
  } catch (error) {
    logger.error(LOG_SYSTEM, `getOnchainId failed for ${holder}:`, error);
    throw new IdentityOperationFailed(
      `Failed to read ONCHAINID for ${holder}: ${(error as Error).message}`,
      'getOnchainId',
      error as Error,
      registryAddress
    );
  }
}

/**
 * The IRS verification pre-check. Returns `false` (never throws) for an unregistered
 * or unverifiable holder.
 */
export async function isVerified(
  rpcUrl: string,
  registryAddress: string,
  holder: string,
  viemChain?: Chain
): Promise<boolean> {
  const client = createEvmPublicClient(rpcUrl, viemChain);

  try {
    return (await client.readContract({
      address: registryAddress as `0x${string}`,
      abi: IS_VERIFIED_ABI,
      functionName: 'isVerified',
      args: [holder as `0x${string}`],
    })) as boolean;
  } catch {
    // Unregistered holders may revert depending on the registry; treat as not verified.
    logger.debug(LOG_SYSTEM, `isVerified read returned negative for ${holder}`);
    return false;
  }
}

/**
 * Read the holder's jurisdiction (ISO-3166 numeric country code) as a string.
 * Returns `undefined` when unavailable (e.g. unregistered holder).
 */
export async function getJurisdiction(
  rpcUrl: string,
  registryAddress: string,
  holder: string,
  viemChain?: Chain
): Promise<string | undefined> {
  const client = createEvmPublicClient(rpcUrl, viemChain);

  try {
    const country = (await client.readContract({
      address: registryAddress as `0x${string}`,
      abi: INVESTOR_COUNTRY_ABI,
      functionName: 'investorCountry',
      args: [holder as `0x${string}`],
    })) as number | bigint;

    return country.toString();
  } catch {
    logger.debug(LOG_SYSTEM, `getJurisdiction unavailable for ${holder}`);
    return undefined;
  }
}

/**
 * Whether `issuer` is already registered in the Trusted Issuers Registry.
 * Returns `false` (never throws) when the read is unavailable, enabling idempotent writes.
 */
export async function isTrustedIssuer(
  rpcUrl: string,
  trustedIssuersRegistry: string,
  issuer: string,
  viemChain?: Chain
): Promise<boolean> {
  const client = createEvmPublicClient(rpcUrl, viemChain);

  try {
    return (await client.readContract({
      address: trustedIssuersRegistry as `0x${string}`,
      abi: IS_TRUSTED_ISSUER_ABI,
      functionName: 'isTrustedIssuer',
      args: [issuer as `0x${string}`],
    })) as boolean;
  } catch {
    logger.debug(LOG_SYSTEM, `isTrustedIssuer read unavailable for ${issuer}`);
    return false;
  }
}

/**
 * Resolve the ONCHAINID deployed for a wallet via the identity factory.
 * Used after `deployOnchainId` to surface the new identity address.
 *
 * @returns The deployed identity address, or `undefined` when none/zero.
 */
export async function getIdentityFromFactory(
  rpcUrl: string,
  factoryAddress: string,
  wallet: string,
  viemChain?: Chain
): Promise<string | undefined> {
  const client = createEvmPublicClient(rpcUrl, viemChain);

  try {
    const identity = (await client.readContract({
      address: factoryAddress as `0x${string}`,
      abi: GET_IDENTITY_ABI,
      functionName: 'getIdentity',
      args: [wallet as `0x${string}`],
    })) as string;

    return isZeroAddress(identity) ? undefined : identity;
  } catch (error) {
    logger.debug(LOG_SYSTEM, `getIdentityFromFactory failed for ${wallet}:`, error);
    return undefined;
  }
}
