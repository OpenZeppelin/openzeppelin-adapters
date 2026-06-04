/**
 * ERC-4626 revert → typed-error mapping.
 *
 * Classifies a raw vault write failure into a typed `RICapabilityError` (VC-4): insufficient
 * funds map to `InsufficientBalance` for `deposit` and `InsufficientShares` for `withdraw`;
 * anything unrecognized falls back to `RICapabilityOperationFailed` so no failure is silently
 * swallowed.
 *
 * ## Two revert encodings, one classifier
 *
 * ERC-4626 reverts arrive as either `require`/`revert` **strings** (e.g.
 * `"ERC20: transfer amount exceeds balance"`) or **custom errors** (OpenZeppelin v5:
 * `ERC4626ExceededMaxDeposit`, `ERC4626ExceededMaxWithdraw`, `ERC4626ExceededMaxRedeem`,
 * and the underlying `ERC20InsufficientBalance`). The shared {@link extractRevertInfo} walks
 * the viem error chain to recover the decoded custom-error name (or raw selector); the keyword
 * matcher below covers both encodings.
 *
 * @module erc4626/error-mapping
 */

import type { Abi } from 'viem';

import {
  InsufficientBalance,
  InsufficientShares,
  RICapabilityOperationFailed,
} from '@openzeppelin/ui-types';

import { extractRevertInfo, includesAny } from '../shared/revert-info';

/** Which write failed, selecting the insufficient-funds error class. */
export type Erc4626Operation = 'deposit' | 'withdraw';

/** Context threaded into the mapped error for actionable messages. */
export interface Erc4626ErrorContext {
  /** Holder most relevant to the operation. */
  holder?: string;
  /** Requested base-unit amount (assets for deposit, shares for withdraw). */
  requested?: string;
}

/**
 * Vendored custom-error ABI fragments, decoded when the executor's viem instance did not
 * carry the vault ABI (so `data.errorName` is absent but raw revert bytes are present).
 *
 * Empty by default: when an executor decodes the custom error, its name flows through
 * `data.errorName` without needing this ABI. Extension point — add `{ type: 'error', … }`
 * fragments here (with provenance, like `abi.ts`) to recover names for vaults whose executor
 * strips them.
 */
export const CUSTOM_ERROR_ABI: Abi = [];

/**
 * Keyword needles (string reverts + OZ v5 custom-error names) shared by both operations.
 *
 * Deliberately balance/share-specific: a bare `"insufficient"` would misclassify unrelated
 * failures (e.g. `ERC20InsufficientAllowance`, slippage/liquidity reverts) as a funds
 * shortfall. Anything not matched here falls through to `RICapabilityOperationFailed`.
 */
const INSUFFICIENT_FUNDS_NEEDLES = [
  'insufficient balance',
  'insufficient shares',
  'insufficient assets',
  'exceeds balance',
  'exceeds available',
  'transfer amount exceeds',
  'burn amount exceeds',
  'erc20insufficientbalance',
];

const DEPOSIT_LIMIT_NEEDLES = ['exceededmaxdeposit', 'exceededmaxmint', 'max deposit'];
const WITHDRAW_LIMIT_NEEDLES = [
  'exceededmaxwithdraw',
  'exceededmaxredeem',
  'max withdraw',
  'max redeem',
];

/**
 * Map a raw ERC-4626 write failure to a typed error.
 *
 * @param error - The underlying execution error.
 * @param operation - `deposit` or `withdraw` — selects the insufficient-funds error class.
 * @param contractAddress - The vault address for error context.
 * @param ctx - Optional holder/amount details for the typed error.
 */
export function mapErc4626Error(
  error: Error,
  operation: Erc4626Operation,
  contractAddress?: string,
  ctx: Erc4626ErrorContext = {}
): Error {
  const info = extractRevertInfo(error, CUSTOM_ERROR_ABI);
  const text = info.searchText;
  const { holder, requested } = ctx;

  const limitNeedles = operation === 'deposit' ? DEPOSIT_LIMIT_NEEDLES : WITHDRAW_LIMIT_NEEDLES;
  const insufficientFunds = includesAny(text, [...INSUFFICIENT_FUNDS_NEEDLES, ...limitNeedles]);

  if (insufficientFunds) {
    if (operation === 'deposit') {
      return new InsufficientBalance(
        `Insufficient balance for deposit.`,
        holder ?? '',
        requested ?? '',
        undefined,
        contractAddress
      );
    }
    return new InsufficientShares(
      `Insufficient shares for withdraw.`,
      holder ?? '',
      requested ?? '',
      undefined,
      contractAddress
    );
  }

  // Unmapped: surface the decoded custom-error name or raw selector for diagnosis.
  const detail = info.errorName
    ? ` (custom error: ${info.errorName})`
    : info.selector
      ? ` (unrecognized revert selector: ${info.selector})`
      : '';

  return new RICapabilityOperationFailed(
    `ERC-4626 ${operation} failed: ${error.message}${detail}`,
    operation,
    error,
    contractAddress
  );
}
