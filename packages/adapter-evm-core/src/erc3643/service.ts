/**
 * EVM ERC-3643 (T-REX) Service.
 *
 * Implements the `ERC3643Capability` surface (sans the `RuntimeCapability` mixin, added by
 * the factory). Reads delegate to the on-chain reader; writes validate amounts at the
 * boundary (shared codec → `InvalidAmount` before any submission), assemble T-REX calldata,
 * and submit via the injected executor, mapping reverts to typed errors.
 *
 * Mirrors {@link EvmIRSService}; the only structural difference is the capability-specific
 * revert mapper threaded into the shared {@link runCapabilityWrite} skeleton.
 *
 * @module erc3643/service
 */

import type {
  Amount,
  ExecutionConfig,
  OperationResult,
  TransactionStatusUpdate,
  TransferSimulationResult,
  TxStatus,
} from '@openzeppelin/ui-types';
import { logger } from '@openzeppelin/ui-utils';

import { resolveRpcUrl } from '../configuration/rpc';
import { parseAmount } from '../shared/amount';
import { runCapabilityWrite } from '../shared/executor';
import type { EvmCompatibleNetworkConfig, WriteContractParameters } from '../types';
import {
  assembleBurnAction,
  assembleMintAction,
  assembleSetAddressFrozenAction,
  assembleTransferAction,
} from './actions';
import { mapErc3643Error, type Erc3643ErrorContext } from './error-mapping';
import {
  balanceOf,
  getJurisdiction,
  isFrozen,
  isVerified,
  simulateTransfer,
} from './onchain-reader';
import type { EvmErc3643Executor, EvmErc3643ServiceOptions } from './types';

const LOG_SYSTEM = 'EvmErc3643Service';

/**
 * EVM implementation of the ERC-3643 capability surface.
 */
export class EvmErc3643Service {
  private readonly tokenAddress: string;

  constructor(
    private readonly networkConfig: EvmCompatibleNetworkConfig,
    private readonly executeTransaction: EvmErc3643Executor,
    options: EvmErc3643ServiceOptions
  ) {
    this.tokenAddress = options.tokenAddress;
  }

  // ---- Reads ----

  balanceOf(holder: string): Promise<Amount> {
    return balanceOf(this.rpcUrl(), this.tokenAddress, holder);
  }

  isVerified(holder: string): Promise<boolean> {
    return isVerified(this.rpcUrl(), this.tokenAddress, holder);
  }

  isFrozen(holder: string): Promise<boolean> {
    return isFrozen(this.rpcUrl(), this.tokenAddress, holder);
  }

  getJurisdiction(holder: string): Promise<string | undefined> {
    return getJurisdiction(this.rpcUrl(), this.tokenAddress, holder);
  }

  simulateTransfer(input: {
    from: string;
    to: string;
    amount: Amount;
  }): Promise<TransferSimulationResult> {
    return simulateTransfer(this.rpcUrl(), this.tokenAddress, input);
  }

  // ---- Writes ----

  // `async` so a synchronous `parseAmount` rejection (InvalidAmount) surfaces as a
  // rejected promise rather than a thrown error at the call site.
  async mint(
    input: { to: string; amount: Amount },
    executionConfig: ExecutionConfig,
    onStatusChange?: (status: TxStatus, details: TransactionStatusUpdate) => void,
    runtimeApiKey?: string
  ): Promise<OperationResult> {
    const amount = parseAmount(input.amount, this.tokenAddress);
    const action = assembleMintAction(this.tokenAddress, input.to, amount);
    return this.execute('mint', action, executionConfig, onStatusChange, runtimeApiKey, {
      holder: input.to,
      requested: input.amount,
    });
  }

  async burn(
    input: { from: string; amount: Amount },
    executionConfig: ExecutionConfig,
    onStatusChange?: (status: TxStatus, details: TransactionStatusUpdate) => void,
    runtimeApiKey?: string
  ): Promise<OperationResult> {
    const amount = parseAmount(input.amount, this.tokenAddress);
    const action = assembleBurnAction(this.tokenAddress, input.from, amount);
    return this.execute('burn', action, executionConfig, onStatusChange, runtimeApiKey, {
      holder: input.from,
      requested: input.amount,
    });
  }

  async transfer(
    input: { from: string; to: string; amount: Amount },
    executionConfig: ExecutionConfig,
    onStatusChange?: (status: TxStatus, details: TransactionStatusUpdate) => void,
    runtimeApiKey?: string
  ): Promise<OperationResult> {
    const amount = parseAmount(input.amount, this.tokenAddress);
    const action = assembleTransferAction(this.tokenAddress, input.from, input.to, amount);
    return this.execute('transfer', action, executionConfig, onStatusChange, runtimeApiKey, {
      holder: input.from,
      requested: input.amount,
    });
  }

  freeze(
    input: { holder: string },
    executionConfig: ExecutionConfig,
    onStatusChange?: (status: TxStatus, details: TransactionStatusUpdate) => void,
    runtimeApiKey?: string
  ): Promise<OperationResult> {
    const action = assembleSetAddressFrozenAction(this.tokenAddress, input.holder, true);
    return this.execute('freeze', action, executionConfig, onStatusChange, runtimeApiKey, {
      holder: input.holder,
    });
  }

  unfreeze(
    input: { holder: string },
    executionConfig: ExecutionConfig,
    onStatusChange?: (status: TxStatus, details: TransactionStatusUpdate) => void,
    runtimeApiKey?: string
  ): Promise<OperationResult> {
    const action = assembleSetAddressFrozenAction(this.tokenAddress, input.holder, false);
    return this.execute('unfreeze', action, executionConfig, onStatusChange, runtimeApiKey, {
      holder: input.holder,
    });
  }

  dispose(): void {
    logger.debug(LOG_SYSTEM, 'ERC-3643 service disposed.');
  }

  // ---- Internals ----

  private rpcUrl(): string {
    return resolveRpcUrl(this.networkConfig);
  }

  private execute(
    operation: string,
    action: WriteContractParameters,
    executionConfig: ExecutionConfig,
    onStatusChange: ((status: TxStatus, details: TransactionStatusUpdate) => void) | undefined,
    runtimeApiKey: string | undefined,
    errorContext: Erc3643ErrorContext
  ): Promise<OperationResult> {
    return runCapabilityWrite(
      {
        operation,
        action,
        executor: this.executeTransaction,
        executionConfig,
        onStatusChange,
        runtimeApiKey,
      },
      (error, op, contractAddress) => mapErc3643Error(error, op, contractAddress, errorContext)
    );
  }
}

/**
 * Factory for {@link EvmErc3643Service}.
 */
export function createEvmErc3643Service(
  networkConfig: EvmCompatibleNetworkConfig,
  executeTransaction: EvmErc3643Executor,
  options: EvmErc3643ServiceOptions
): EvmErc3643Service {
  return new EvmErc3643Service(networkConfig, executeTransaction, options);
}
