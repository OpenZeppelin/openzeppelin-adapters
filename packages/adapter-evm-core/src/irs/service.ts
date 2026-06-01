/**
 * EVM IRS / ONCHAINID Service.
 *
 * Implements the `IRSCapability` method surface for EVM contracts: ONCHAINID lookup,
 * verification + jurisdiction reads, the pure key-free claim-payload builder, and the
 * identity write paths (deploy, trusted-issuer registration, claim attachment, identity
 * registration). Reads run over RPC; writes delegate to the injected executor.
 *
 * The `RuntimeCapability` surface (`networkConfig`, idempotent `dispose`, disposed-state
 * guarding) is layered on by `guardRuntimeCapability` in the factory.
 *
 * @module irs/service
 * @see contracts/irs-capability.md
 */

import type {
  ClaimPayload,
  DeployOnchainIdResult,
  ExecutionConfig,
  IdentityRegistration,
  OnboardingClaim,
  OnchainIdLookup,
  OperationResult,
  TransactionStatusUpdate,
  TxStatus,
} from '@openzeppelin/ui-types';
import { IdentityAlreadyRegistered, IdentityOperationFailed } from '@openzeppelin/ui-types';
import { logger } from '@openzeppelin/ui-utils';

import { resolveRpcUrl } from '../configuration/rpc';
import { runCapabilityWrite } from '../shared/executor';
import type { EvmCompatibleNetworkConfig, WriteContractParameters } from '../types';
import {
  assembleAddTrustedIssuerAction,
  assembleAttachClaimAction,
  assembleDeployOnchainIdAction,
  assembleRegisterIdentityAction,
} from './actions';
import { buildClaimPayload } from './claim-payload';
import {
  getIdentityFromFactory,
  getJurisdiction,
  getOnchainId,
  isTrustedIssuer,
  isVerified,
} from './onchain-reader';
import type { EvmIRSAddresses, EvmIRSExecutor, EvmIRSServiceOptions } from './types';

const LOG_SYSTEM = 'EvmIrsService';

/**
 * EVM implementation of the IRS capability surface (sans the `RuntimeCapability` mixin).
 */
export class EvmIRSService {
  private readonly addresses: EvmIRSAddresses;
  private readonly trustedIssuer?: string;

  constructor(
    private readonly networkConfig: EvmCompatibleNetworkConfig,
    private readonly executeTransaction: EvmIRSExecutor,
    options: EvmIRSServiceOptions
  ) {
    this.addresses = options.addresses;
    this.trustedIssuer = options.trustedIssuer;
  }

  // ---- Reads ----

  getOnchainId(holder: string): Promise<OnchainIdLookup> {
    return getOnchainId(this.rpcUrl(), this.addresses.identityRegistry, holder);
  }

  isVerified(holder: string): Promise<boolean> {
    return isVerified(this.rpcUrl(), this.addresses.identityRegistry, holder);
  }

  getJurisdiction(holder: string): Promise<string | undefined> {
    return getJurisdiction(this.rpcUrl(), this.addresses.identityRegistry, holder);
  }

  // ---- Pure helper ----

  buildClaimPayload(input: {
    onchainId: string;
    topic: string;
    scheme: number;
    data: string;
  }): ClaimPayload {
    return buildClaimPayload(input);
  }

  // ---- Writes ----

  async deployOnchainId(
    input: { holder: string },
    executionConfig: ExecutionConfig,
    onStatusChange?: (status: TxStatus, details: TransactionStatusUpdate) => void,
    runtimeApiKey?: string
  ): Promise<DeployOnchainIdResult> {
    const { holder } = input;
    const action = assembleDeployOnchainIdAction(this.addresses.identityFactory, holder, holder);

    const result = await this.execute(
      'deployOnchainId',
      action,
      executionConfig,
      onStatusChange,
      runtimeApiKey
    );

    const onchainId = await getIdentityFromFactory(
      this.rpcUrl(),
      this.addresses.identityFactory,
      holder
    );

    if (!onchainId) {
      throw new IdentityOperationFailed(
        `ONCHAINID deployment for ${holder} submitted (${result.id}) but no identity was resolvable from the factory.`,
        'deployOnchainId',
        undefined,
        this.addresses.identityFactory
      );
    }

    return { ...result, onchainId };
  }

  async registerTrustedIssuer(
    input: { issuer: string; topics: string[] },
    executionConfig: ExecutionConfig,
    onStatusChange?: (status: TxStatus, details: TransactionStatusUpdate) => void,
    runtimeApiKey?: string
  ): Promise<OperationResult> {
    const { issuer, topics } = input;

    // Idempotent: skip submission when the issuer is already trusted.
    const alreadyTrusted = await isTrustedIssuer(
      this.rpcUrl(),
      this.addresses.trustedIssuersRegistry,
      issuer
    );
    if (alreadyTrusted) {
      logger.debug(LOG_SYSTEM, `Trusted issuer ${issuer} already registered; skipping submission.`);
      return { id: `already-registered:${issuer}` };
    }

    const action = assembleAddTrustedIssuerAction(
      this.addresses.trustedIssuersRegistry,
      issuer,
      topics
    );
    return this.execute(
      'registerTrustedIssuer',
      action,
      executionConfig,
      onStatusChange,
      runtimeApiKey
    );
  }

  attachClaim(
    input: { onchainId: string; claim: OnboardingClaim },
    executionConfig: ExecutionConfig,
    onStatusChange?: (status: TxStatus, details: TransactionStatusUpdate) => void,
    runtimeApiKey?: string
  ): Promise<OperationResult> {
    const { onchainId, claim } = input;
    const issuerAddress = claim.issuer ?? this.trustedIssuer ?? '';
    const action = assembleAttachClaimAction(onchainId, claim, issuerAddress);
    return this.execute('attachClaim', action, executionConfig, onStatusChange, runtimeApiKey);
  }

  async registerIdentity(
    input: IdentityRegistration,
    executionConfig: ExecutionConfig,
    onStatusChange?: (status: TxStatus, details: TransactionStatusUpdate) => void,
    runtimeApiKey?: string
  ): Promise<OperationResult> {
    const { holder, onchainId, country = 0 } = input;

    const existing = await this.getOnchainId(holder);
    if (existing.found) {
      throw new IdentityAlreadyRegistered(
        `Holder ${holder} already has a registered identity.`,
        holder,
        existing.onchainId,
        this.addresses.identityRegistry
      );
    }

    const action = assembleRegisterIdentityAction(
      this.addresses.identityRegistry,
      holder,
      onchainId,
      country
    );
    return this.execute('registerIdentity', action, executionConfig, onStatusChange, runtimeApiKey);
  }

  dispose(): void {
    logger.debug(LOG_SYSTEM, 'IRS service disposed.');
  }

  // ---- Internals ----

  private rpcUrl(): string {
    return resolveRpcUrl(this.networkConfig);
  }

  private execute(
    operation: string,
    action: WriteContractParameters,
    executionConfig: ExecutionConfig,
    onStatusChange?: (status: TxStatus, details: TransactionStatusUpdate) => void,
    runtimeApiKey?: string
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
      // All IRS write failures map to a single typed error.
      (error, op, contractAddress) =>
        new IdentityOperationFailed(
          `IRS ${op} failed: ${error.message}`,
          op,
          error,
          contractAddress
        )
    );
  }
}

/**
 * Factory for {@link EvmIRSService}.
 */
export function createEvmIRSService(
  networkConfig: EvmCompatibleNetworkConfig,
  executeTransaction: EvmIRSExecutor,
  options: EvmIRSServiceOptions
): EvmIRSService {
  return new EvmIRSService(networkConfig, executeTransaction, options);
}
