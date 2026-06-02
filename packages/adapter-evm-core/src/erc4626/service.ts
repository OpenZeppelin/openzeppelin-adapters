/**
 * EVM ERC-4626 (Tokenized Vault) Service.
 *
 * Implements the `ERC4626Capability` surface (sans the `RuntimeCapability` mixin, added by
 * the factory). Reads delegate to the on-chain reader; writes validate amounts at the
 * boundary (shared codec → `InvalidAmount` before any submission), assemble vault calldata,
 * and submit via the injected executor, mapping reverts to typed errors.
 *
 * Mirrors {@link EvmErc3643Service}; the only structural difference is the vault-specific
 * revert mapper (deposit → `InsufficientBalance`, withdraw → `InsufficientShares`) threaded
 * into the shared {@link runCapabilityWrite} skeleton.
 *
 * Note on `sharesIssued` / `amountReturned`: the EVM execution path (eoa/relayer) resolves a
 * tx hash at submit time and does not parse the call's return value, so these optional fields
 * are omitted here (contract VC-3: "where the receipt exposes them"). A consumer that needs
 * them reads `convertToShares` / `convertToAssets` around the write.
 *
 * @module erc4626/service
 */

import type {
  Amount,
  ExecutionConfig,
  TransactionStatusUpdate,
  TxStatus,
  VaultDepositResult,
  VaultWithdrawResult,
} from '@openzeppelin/ui-types';
import { logger } from '@openzeppelin/ui-utils';

import { resolveRpcUrl } from '../configuration/rpc';
import { parseAmount } from '../shared/amount';
import { runCapabilityWrite } from '../shared/executor';
import type { EvmCompatibleNetworkConfig, WriteContractParameters } from '../types';
import { assembleDepositAction, assembleRedeemAction } from './actions';
import { mapErc4626Error, type Erc4626ErrorContext, type Erc4626Operation } from './error-mapping';
import { convertToAssets, convertToShares, totalAssets } from './onchain-reader';
import type { EvmErc4626Executor, EvmErc4626ServiceOptions } from './types';

const LOG_SYSTEM = 'EvmErc4626Service';

/**
 * EVM implementation of the ERC-4626 capability surface (sans the `RuntimeCapability` mixin).
 */
export class EvmErc4626Service {
  private readonly vaultAddress: string;

  constructor(
    private readonly networkConfig: EvmCompatibleNetworkConfig,
    private readonly executeTransaction: EvmErc4626Executor,
    options: EvmErc4626ServiceOptions
  ) {
    this.vaultAddress = options.vaultAddress;
  }

  // ---- Reads ----

  convertToAssets(shares: Amount): Promise<Amount> {
    return convertToAssets(this.rpcUrl(), this.vaultAddress, shares);
  }

  convertToShares(assets: Amount): Promise<Amount> {
    return convertToShares(this.rpcUrl(), this.vaultAddress, assets);
  }

  totalAssets(): Promise<Amount> {
    return totalAssets(this.rpcUrl(), this.vaultAddress);
  }

  // ---- Writes ----

  // `async` so a synchronous `parseAmount` rejection (InvalidAmount) surfaces as a
  // rejected promise rather than a thrown error at the call site.
  async deposit(
    input: { from: string; amount: Amount },
    executionConfig: ExecutionConfig,
    onStatusChange?: (status: TxStatus, details: TransactionStatusUpdate) => void,
    runtimeApiKey?: string
  ): Promise<VaultDepositResult> {
    const assets = parseAmount(input.amount, this.vaultAddress);
    const action = assembleDepositAction(this.vaultAddress, input.from, assets);
    return this.execute('deposit', action, executionConfig, onStatusChange, runtimeApiKey, {
      holder: input.from,
      requested: input.amount,
    });
  }

  async withdraw(
    input: { from: string; shares: Amount },
    executionConfig: ExecutionConfig,
    onStatusChange?: (status: TxStatus, details: TransactionStatusUpdate) => void,
    runtimeApiKey?: string
  ): Promise<VaultWithdrawResult> {
    const shares = parseAmount(input.shares, this.vaultAddress);
    const action = assembleRedeemAction(this.vaultAddress, input.from, shares);
    return this.execute('withdraw', action, executionConfig, onStatusChange, runtimeApiKey, {
      holder: input.from,
      requested: input.shares,
    });
  }

  dispose(): void {
    logger.debug(LOG_SYSTEM, 'ERC-4626 service disposed.');
  }

  // ---- Internals ----

  private rpcUrl(): string {
    return resolveRpcUrl(this.networkConfig);
  }

  private execute(
    operation: Erc4626Operation,
    action: WriteContractParameters,
    executionConfig: ExecutionConfig,
    onStatusChange: ((status: TxStatus, details: TransactionStatusUpdate) => void) | undefined,
    runtimeApiKey: string | undefined,
    errorContext: Erc4626ErrorContext
  ): Promise<VaultDepositResult & VaultWithdrawResult> {
    return runCapabilityWrite(
      {
        operation,
        action,
        executor: this.executeTransaction,
        executionConfig,
        onStatusChange,
        runtimeApiKey,
      },
      (error, _op, contractAddress) =>
        mapErc4626Error(error, operation, contractAddress, errorContext)
    );
  }
}

/**
 * Factory for {@link EvmErc4626Service}.
 */
export function createEvmErc4626Service(
  networkConfig: EvmCompatibleNetworkConfig,
  executeTransaction: EvmErc4626Executor,
  options: EvmErc4626ServiceOptions
): EvmErc4626Service {
  return new EvmErc4626Service(networkConfig, executeTransaction, options);
}
