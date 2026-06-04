/**
 * ERC-4626 (Tokenized Vault) Write Action Assembly.
 *
 * Pure functions that build `WriteContractParameters` for vault writes. The service delegates
 * execution to the injected `signAndBroadcast`, so this module only assembles calldata
 * (mirroring the ERC-3643 / IRS actions modules). Amounts arrive already converted to
 * `bigint` by the service boundary (shared amount codec).
 *
 * @module erc4626/actions
 */

import type { Hex } from 'viem';

import type { WriteContractParameters } from '../types';
import { DEPOSIT_ABI, REDEEM_ABI } from './abi';

/** Assembles `deposit(uint256 assets, address receiver)` with `receiver === from`. */
export function assembleDepositAction(
  vaultAddress: string,
  from: string,
  assets: bigint
): WriteContractParameters {
  return {
    address: vaultAddress as Hex,
    abi: DEPOSIT_ABI,
    functionName: 'deposit',
    args: [assets, from as Hex],
  };
}

/**
 * Assembles `redeem(uint256 shares, address receiver, address owner)` with
 * `receiver === owner === from` — backs the capability's share-denominated `withdraw`.
 */
export function assembleRedeemAction(
  vaultAddress: string,
  from: string,
  shares: bigint
): WriteContractParameters {
  return {
    address: vaultAddress as Hex,
    abi: REDEEM_ABI,
    functionName: 'redeem',
    args: [shares, from as Hex, from as Hex],
  };
}
