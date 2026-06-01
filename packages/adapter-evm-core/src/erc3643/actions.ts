/**
 * ERC-3643 (T-REX) Write Action Assembly.
 *
 * Pure functions that build `WriteContractParameters` for T-REX writes. The service
 * delegates execution to the injected `signAndBroadcast`, so this module only assembles
 * calldata (mirroring the access-control / IRS actions modules). Amounts are passed in
 * already converted to `bigint` by the service boundary (shared amount codec).
 *
 * @module erc3643/actions
 */

import type { Hex } from 'viem';

import type { WriteContractParameters } from '../types';
import { BURN_ABI, FORCED_TRANSFER_ABI, MINT_ABI, SET_ADDRESS_FROZEN_ABI } from './abi';

/** Assembles `mint(address _to, uint256 _amount)`. */
export function assembleMintAction(
  tokenAddress: string,
  to: string,
  amount: bigint
): WriteContractParameters {
  return {
    address: tokenAddress as Hex,
    abi: MINT_ABI,
    functionName: 'mint',
    args: [to as Hex, amount],
  };
}

/** Assembles `burn(address _userAddress, uint256 _amount)`. */
export function assembleBurnAction(
  tokenAddress: string,
  from: string,
  amount: bigint
): WriteContractParameters {
  return {
    address: tokenAddress as Hex,
    abi: BURN_ABI,
    functionName: 'burn',
    args: [from as Hex, amount],
  };
}

/** Assembles `forcedTransfer(address _from, address _to, uint256 _amount)`. */
export function assembleTransferAction(
  tokenAddress: string,
  from: string,
  to: string,
  amount: bigint
): WriteContractParameters {
  return {
    address: tokenAddress as Hex,
    abi: FORCED_TRANSFER_ABI,
    functionName: 'forcedTransfer',
    args: [from as Hex, to as Hex, amount],
  };
}

/** Assembles `setAddressFrozen(address _userAddress, bool _freeze)` for freeze/unfreeze. */
export function assembleSetAddressFrozenAction(
  tokenAddress: string,
  holder: string,
  freeze: boolean
): WriteContractParameters {
  return {
    address: tokenAddress as Hex,
    abi: SET_ADDRESS_FROZEN_ABI,
    functionName: 'setAddressFrozen',
    args: [holder as Hex, freeze],
  };
}
