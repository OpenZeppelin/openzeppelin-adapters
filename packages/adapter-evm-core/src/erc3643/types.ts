/**
 * ERC-3643 Module Internal Types.
 *
 * @module erc3643/types
 */

import type { CapabilityExecutor } from '../shared/executor';

/** Transaction executor callback — decouples the service from wallet/signing. */
export type EvmErc3643Executor = CapabilityExecutor;

/**
 * Construction options for the EVM ERC-3643 service.
 *
 * The capability operates against a single T-REX token (its methods take holder/amount
 * arguments rather than per-call addresses), so the deployment-specific token address is
 * supplied once at construction.
 */
export interface EvmErc3643ServiceOptions {
  /** The ERC-3643 (T-REX) token contract address. */
  tokenAddress: string;
}
