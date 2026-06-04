/**
 * IRS Module Internal Types.
 *
 * @module irs/types
 */

import type {
  ExecutionConfig,
  OperationResult,
  TransactionStatusUpdate,
  TxStatus,
} from '@openzeppelin/ui-types';

import type { WriteContractParameters } from '../types';

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
 * Mirrors {@link EvmTransactionExecutor} from the access-control module.
 */
export type EvmIRSExecutor = (
  txData: WriteContractParameters,
  executionConfig: ExecutionConfig,
  onStatusChange?: (status: TxStatus, details: TransactionStatusUpdate) => void,
  runtimeApiKey?: string
) => Promise<OperationResult>;

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
}
