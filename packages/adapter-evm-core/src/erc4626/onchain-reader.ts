/**
 * ERC-4626 (Tokenized Vault) On-Chain Reader.
 *
 * Reads vault conversion state via a viem public client (stateless client per call, matching
 * the access-control / IRS / ERC-3643 readers). Amounts cross the boundary as base-unit
 * decimal strings via the shared amount codec: inputs are parsed (`InvalidAmount` before any
 * RPC) and outputs formatted.
 *
 * @module erc4626/onchain-reader
 */

import type { Chain } from 'viem';

import type { Amount } from '@openzeppelin/ui-types';
import { RICapabilityOperationFailed } from '@openzeppelin/ui-types';
import { logger } from '@openzeppelin/ui-utils';

import { formatAmount, parseAmount } from '../shared/amount';
import { createEvmPublicClient } from '../utils/public-client';
import { CONVERT_TO_ASSETS_ABI, CONVERT_TO_SHARES_ABI, TOTAL_ASSETS_ABI } from './abi';

const LOG_SYSTEM = 'EvmErc4626Reader';

/** Convert a base-unit share quantity to its underlying asset quantity. */
export async function convertToAssets(
  rpcUrl: string,
  vaultAddress: string,
  shares: Amount,
  viemChain?: Chain
): Promise<Amount> {
  const sharesRaw = parseAmount(shares, vaultAddress);
  const client = createEvmPublicClient(rpcUrl, viemChain);

  try {
    const raw = (await client.readContract({
      address: vaultAddress as `0x${string}`,
      abi: CONVERT_TO_ASSETS_ABI,
      functionName: 'convertToAssets',
      args: [sharesRaw],
    })) as bigint;

    return formatAmount(raw, vaultAddress);
  } catch (error) {
    logger.error(LOG_SYSTEM, 'convertToAssets failed:', error);
    throw new RICapabilityOperationFailed(
      `Failed to convertToAssets: ${(error as Error).message}`,
      'convertToAssets',
      error as Error,
      vaultAddress
    );
  }
}

/** Convert a base-unit asset quantity to its share quantity. */
export async function convertToShares(
  rpcUrl: string,
  vaultAddress: string,
  assets: Amount,
  viemChain?: Chain
): Promise<Amount> {
  const assetsRaw = parseAmount(assets, vaultAddress);
  const client = createEvmPublicClient(rpcUrl, viemChain);

  try {
    const raw = (await client.readContract({
      address: vaultAddress as `0x${string}`,
      abi: CONVERT_TO_SHARES_ABI,
      functionName: 'convertToShares',
      args: [assetsRaw],
    })) as bigint;

    return formatAmount(raw, vaultAddress);
  } catch (error) {
    logger.error(LOG_SYSTEM, 'convertToShares failed:', error);
    throw new RICapabilityOperationFailed(
      `Failed to convertToShares: ${(error as Error).message}`,
      'convertToShares',
      error as Error,
      vaultAddress
    );
  }
}

/** Total underlying assets managed by the vault, as a base-unit decimal string. */
export async function totalAssets(
  rpcUrl: string,
  vaultAddress: string,
  viemChain?: Chain
): Promise<Amount> {
  const client = createEvmPublicClient(rpcUrl, viemChain);

  try {
    const raw = (await client.readContract({
      address: vaultAddress as `0x${string}`,
      abi: TOTAL_ASSETS_ABI,
      functionName: 'totalAssets',
    })) as bigint;

    return formatAmount(raw, vaultAddress);
  } catch (error) {
    logger.error(LOG_SYSTEM, 'totalAssets failed:', error);
    throw new RICapabilityOperationFailed(
      `Failed to read totalAssets: ${(error as Error).message}`,
      'totalAssets',
      error as Error,
      vaultAddress
    );
  }
}
