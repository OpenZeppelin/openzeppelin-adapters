/**
 * ERC-4626 Module Internal Types.
 *
 * @module erc4626/types
 */

import type { CapabilityExecutor } from '../shared/executor';

/** Transaction executor callback — decouples the service from wallet/signing. */
export type EvmErc4626Executor = CapabilityExecutor;

/**
 * Construction options for the EVM ERC-4626 service.
 *
 * The capability operates against a single vault (its methods take amounts/shares rather
 * than per-call addresses), so the deployment-specific vault address is supplied once at
 * construction.
 */
export interface EvmErc4626ServiceOptions {
  /** The ERC-4626 vault contract address. */
  vaultAddress: string;
}
