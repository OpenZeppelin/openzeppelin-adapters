/**
 * Validation for the operator management key configured on IRS construction.
 *
 * The key MUST be the address that will later call `attachClaim` — never inferred from the
 * transaction signer, because the factory `onlyOwner` may be a relayer contract.
 *
 * @module irs/management-key
 */

import { isValidEvmAddress } from '../utils/validation';

/** Thrown when `operatorManagementKey` is missing or not a valid EVM address. */
export class InvalidOperatorManagementKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidOperatorManagementKeyError';
  }
}

/**
 * Validate the operator management key at capability construction.
 *
 * @throws {InvalidOperatorManagementKeyError} when absent or malformed.
 */
export function assertValidOperatorManagementKey(
  operatorManagementKey: string | undefined
): asserts operatorManagementKey is string {
  if (operatorManagementKey === undefined || operatorManagementKey === '') {
    throw new InvalidOperatorManagementKeyError(
      'operatorManagementKey is required: pass the address that will execute attachClaim ' +
        '(the saga operator EOA). Do not infer it from the transaction signer — the IdFactory ' +
        'owner may be a relayer contract.'
    );
  }
  if (!isValidEvmAddress(operatorManagementKey)) {
    throw new InvalidOperatorManagementKeyError(
      `Invalid operatorManagementKey: '${operatorManagementKey}' is not a valid EVM address.`
    );
  }
}
