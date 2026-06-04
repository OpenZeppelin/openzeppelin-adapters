/**
 * Shared base-unit amount codec.
 *
 * Chain-agnostic capability interfaces exchange token/share quantities as base-unit
 * decimal `string`s (FR-003a). This module is the single conversion + validation
 * boundary between those strings and the native `bigint` used by viem.
 *
 * A valid base-unit amount is a non-negative integer with no decimal point, sign,
 * whitespace, or scientific notation (e.g. `'1000000000000000000'`). Anything else is
 * rejected with {@link InvalidAmount} **before** any RPC or transaction submission.
 *
 * Reused by the ERC-3643, ERC-4626, and IRS capability services.
 *
 * @module shared/amount
 */

import { InvalidAmount } from '@openzeppelin/ui-types';

/** Canonical base-unit amount: one or more decimal digits, nothing else. */
const BASE_UNIT_PATTERN = /^\d+$/;

/**
 * Classifies why an amount string is not a valid base-unit decimal, for actionable errors.
 */
function classifyInvalidAmount(value: string): string {
  if (value.length === 0) return 'empty';
  if (/\s/.test(value)) return 'whitespace';
  if (value.startsWith('-')) return 'negative';
  if (value.startsWith('+')) return 'signed';
  if (value.includes('.')) return 'fractional';
  if (/e/i.test(value)) return 'scientific-notation';
  return 'not-an-integer';
}

/**
 * Parse a base-unit decimal `string` into a `bigint`.
 *
 * @param value - The base-unit amount string (non-negative integer, no decimal/sign/exponent).
 * @param contractAddress - Optional contract address for error context.
 * @returns The amount as a `bigint`.
 * @throws {InvalidAmount} When `value` is not a non-negative base-unit decimal string.
 */
export function parseAmount(value: string, contractAddress?: string): bigint {
  if (typeof value !== 'string' || !BASE_UNIT_PATTERN.test(value)) {
    const reason = classifyInvalidAmount(typeof value === 'string' ? value : String(value));
    throw new InvalidAmount(
      `Invalid base-unit amount "${value}" (${reason}); expected a non-negative integer string.`,
      String(value),
      reason,
      contractAddress
    );
  }

  return BigInt(value);
}

/**
 * Format a non-negative `bigint` as a base-unit decimal `string`.
 *
 * @param value - The amount as a `bigint` (must be non-negative).
 * @param contractAddress - Optional contract address for error context.
 * @returns The base-unit decimal string.
 * @throws {InvalidAmount} When `value` is negative.
 */
export function formatAmount(value: bigint, contractAddress?: string): string {
  if (typeof value !== 'bigint' || value < 0n) {
    throw new InvalidAmount(
      `Invalid base-unit amount "${value}" (negative); expected a non-negative integer.`,
      String(value),
      'negative',
      contractAddress
    );
  }

  return value.toString();
}
