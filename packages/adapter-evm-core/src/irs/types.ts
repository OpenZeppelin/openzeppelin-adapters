/**
 * IRS Module Internal Types.
 *
 * @module irs/types
 */

import type { CapabilityExecutor } from '../shared/executor';
import type { DeployReceiptWaitOptions } from './receipt-identity';

/**
 * Deployment-specific IRS / ONCHAINID contract addresses the capability operates against.
 *
 * Supplied by the consuming plugin at `createIRS` time, since the capability's methods
 * take holder/claim arguments rather than per-call contract addresses.
 */
export interface EvmIRSAddresses {
  /** ERC-3643 Identity Registry. */
  identityRegistry: string;
  /** ONCHAINID identity factory (IdFactory). */
  identityFactory: string;
  /** ERC-3643 Trusted Issuers Registry. */
  trustedIssuersRegistry: string;
}

/**
 * Transaction executor callback — decouples the IRS service from wallet/signing.
 * Same shape as {@link CapabilityExecutor} (returns {@link WriteExecutionResult}).
 */
export type EvmIRSExecutor = CapabilityExecutor;

/**
 * Construction options for {@link EvmIRSService}.
 */
export interface EvmIRSServiceOptions {
  /** Deployment-specific IRS / ONCHAINID contract addresses. */
  addresses: EvmIRSAddresses;
  /**
   * Default trusted-issuer identity address, used when an attached claim omits `issuer`.
   * The capability never holds the issuer signing key — only this address.
   */
  trustedIssuer?: string;
  /**
   * Address that receives MANAGEMENT on deploy and executes `attachClaim` in the onboarding saga.
   *
   * Must be explicit — never inferred from the transaction signer, because the IdFactory
   * `onlyOwner` caller may be a relayer contract distinct from the operator EOA.
   */
  operatorManagementKey: string;
  /**
   * Bounds on the `deployOnchainId` confirmation wait (confirmations + timeout).
   *
   * The wait is always bounded; this only tunes it. Raise the timeout on slow chains, but never
   * remove the bound: an unbounded wait inside a server-side route is an outage. On timeout the
   * deploy is reported as INDETERMINATE rather than failed, because the transaction may still land.
   */
  deployReceiptWait?: DeployReceiptWaitOptions;
}
