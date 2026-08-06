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
 * ## Write-completion scope (SF-1 / F4)
 *
 * `runCapabilityWrite` returns a `WriteExecutionResult`, which carries a `completion`
 * discriminant (`'submitted' | 'confirmed'`) for the submit-only relayer flow. That signal is
 * **intentionally not surfaced by this capability**: ERC-4626 writes resolve to the
 * `VaultDepositResult` / `VaultWithdrawResult` shapes declared in `@openzeppelin/ui-types`, so
 * {@link EvmErc4626Service.execute} narrows the executor result back to `{ id }`.
 *
 * Rationale: submit-only completion was specified for the IRS onboarding saga, where a caller
 * must distinguish a relayer submission id from a mined tx hash to resume. Vault writes have no
 * resume semantics, and widening the public result would add product surface no consumer asked
 * for while breaking `toEqual({ id })` expectations across the ecosystem. The shared executor
 * still applies the same id-preference rule internally (INV-5), so a submit-only relayer write
 * yields the relayer submission id in `.id` — the id semantics are inherited, the discriminant
 * is not re-exported. Locked by `erc4626.completion-boundary.test.ts`.
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

  private async execute(
    operation: Erc4626Operation,
    action: WriteContractParameters,
    executionConfig: ExecutionConfig,
    onStatusChange: ((status: TxStatus, details: TransactionStatusUpdate) => void) | undefined,
    runtimeApiKey: string | undefined,
    errorContext: Erc4626ErrorContext
  ): Promise<VaultDepositResult & VaultWithdrawResult> {
    const result = await runCapabilityWrite(
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
    // ERC-4626 keeps the plain vault-result contract: the shared executor's
    // `completion` signal is deliberately not re-exported here (see module docs).
    return { id: result.id };
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
