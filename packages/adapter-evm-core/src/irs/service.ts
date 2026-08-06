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
import type { WriteExecutionResult } from '../shared/completion';
import { runCapabilityWrite } from '../shared/executor';
import type { EvmCompatibleNetworkConfig, WriteContractParameters } from '../types';
import { createEvmPublicClient } from '../utils/public-client';
import {
  assembleAddTrustedIssuerAction,
  assembleAttachClaimAction,
  assembleDeployOnchainIdAction,
  assembleGrantHolderManagementKeyAction,
  assembleRegisterIdentityAction,
} from './actions';
import { buildClaimPayload } from './claim-payload';
import type { DeployOnchainIdOutcome } from './deploy-result';
import { IDENTITY_KEY_PURPOSE_MANAGEMENT, lookupIdentityKeyPurpose } from './identity-keys';
import type { IdentityKeyPurposeLookup } from './identity-keys';
import {
  getIdentityFromFactory,
  getJurisdiction,
  getOnchainId,
  isTrustedIssuer,
  isVerified,
  type FactoryIdentityLookup,
} from './onchain-reader';
import { parseIdentityFromDeployReceipt, resolveDeployReceiptWait } from './receipt-identity';
import type { EvmIRSAddresses, EvmIRSExecutor, EvmIRSServiceOptions } from './types';

const LOG_SYSTEM = 'EvmIrsService';

/**
 * Sentinel `OperationResult.id` returned by the idempotent `registerTrustedIssuer` no-op path
 * (issuer already trusted, no transaction sent). Intentionally not a `0x` tx hash so consumers
 * never treat it as one.
 */
export const TRUSTED_ISSUER_NOOP_ID = 'noop:trusted-issuer-already-registered';

/**
 * EVM implementation of the IRS capability surface (sans the `RuntimeCapability` mixin).
 */
export class EvmIRSService {
  private readonly addresses: EvmIRSAddresses;
  private readonly trustedIssuer?: string;
  private readonly operatorManagementKey: string;
  /**
   * Wait bounds, resolved AND VALIDATED at construction so a misconfiguration fails at boot
   * rather than at the first deploy — where the failure would land on a real holder.
   */
  private readonly deployReceiptWait: { confirmations: number; timeoutMs: number };

  constructor(
    private readonly networkConfig: EvmCompatibleNetworkConfig,
    private readonly executeTransaction: EvmIRSExecutor,
    options: EvmIRSServiceOptions
  ) {
    this.addresses = options.addresses;
    this.trustedIssuer = options.trustedIssuer;
    this.operatorManagementKey = options.operatorManagementKey;
    this.deployReceiptWait = resolveDeployReceiptWait(options.deployReceiptWait);
  }

  // ---- Reads ----

  getOnchainId(holder: string): Promise<OnchainIdLookup> {
    return getOnchainId(this.rpcUrl(), this.addresses.identityRegistry, holder);
  }

  /**
   * Factory linkage probe — distinct from registry `getOnchainId`.
   * Used by resume/idempotency paths that must detect deployed-but-unregistered holders.
   */
  getFactoryIdentity(holder: string): Promise<FactoryIdentityLookup> {
    return getIdentityFromFactory(this.rpcUrl(), this.addresses.identityFactory, holder);
  }

  /**
   * Probe whether `address` holds `purpose` on an ONCHAINID identity.
   *
   * Used by resume/idempotency paths that must detect whether `grantHolderManagementKey`
   * already ran — `read_failed` must not be treated as `lacks`.
   */
  hasIdentityKeyPurpose(input: {
    onchainId: string;
    address: string;
    purpose: number;
  }): Promise<IdentityKeyPurposeLookup> {
    const { onchainId, address, purpose } = input;
    return lookupIdentityKeyPurpose(this.rpcUrl(), onchainId, address, purpose);
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

  /**
   * Deploy a fresh ONCHAINID for `holder`.
   *
   * Uses `createIdentityWithManagementKeys` so the configured {@link operatorManagementKey}
   * receives MANAGEMENT and can execute the subsequent saga steps (`attachClaim`, etc.).
   * The holder is wallet-linked but does **not** receive MANAGEMENT until
   * {@link grantHolderManagementKey} runs — that ordering is deliberate (see that method).
   *
   * **Completion (SF-2):** trusts SF-1 `WriteExecutionResult.completion` from {@link execute}.
   * - `completion === 'submitted'`: return `{ id, completion: 'submitted' }` with **no**
   *   `onchainId`. Skips receipt wait, log parse, and operator MANAGEMENT assert. Caller owns
   *   Relayer poll + {@link getFactoryIdentity} resume — submit-only `{ id }` is not proof the
   *   identity deployed.
   * - absent / `'confirmed'`: wait → parse → assert (byte-identical). Identity resolution parses
   *   `WalletLinked` (falling back to `Deployed`) out of the receipt obtained by **waiting** for
   *   confirmation — `waitForTransactionReceipt`, bounded by `deployReceiptWait`. Returns
   *   `{ id, onchainId, completion: 'confirmed' }` with required `onchainId`.
   *
   * Confirmed-path terminal outcomes (unchanged retry semantics):
   *  - confirmed + identity parsed  -> success
   *  - confirmed + reverted         -> nothing created, retry is SAFE
   *  - wait timed out               -> INDETERMINATE, may still land, DO NOT retry blind
   *
   * On the confirmed arm this method makes no assumption about whether the injected executor
   * awaits confirmation; it establishes confirmation itself.
   */
  async deployOnchainId(
    input: { holder: string },
    executionConfig: ExecutionConfig,
    onStatusChange?: (status: TxStatus, details: TransactionStatusUpdate) => void,
    runtimeApiKey?: string
  ): Promise<DeployOnchainIdOutcome> {
    const { holder } = input;
    const action = assembleDeployOnchainIdAction(
      this.addresses.identityFactory,
      holder,
      holder,
      this.operatorManagementKey
    );

    const result = await this.execute(
      'deployOnchainId',
      action,
      executionConfig,
      onStatusChange,
      runtimeApiKey
    );

    // INV-1 / INV-13 / INV-15: single predicate after execute; skip wait/parse/assert only.
    // Do not re-read transactionOptions or strategy result here (SF-1 choke point owns merge).
    if (result.completion === 'submitted') {
      // INV-2 / INV-5 / INV-7 / INV-17 / INV-19: literal arm; no onchainId; no finality claim.
      logger.info(LOG_SYSTEM, 'deployOnchainId: submit-only early return', {
        operation: 'deployOnchainId',
        completion: 'submitted',
        id: result.id,
        holder,
      });
      return { id: result.id, completion: 'submitted' };
    }

    const rpcUrl = this.rpcUrl();
    const { confirmations, timeoutMs } = this.deployReceiptWait;
    logger.info(LOG_SYSTEM, 'deployOnchainId: awaiting receipt for identity resolution', {
      txHash: result.id,
      readRpcHost: safeRpcHost(rpcUrl),
      factory: this.addresses.identityFactory,
      holder,
      confirmations,
      timeoutMs,
    });

    const client = createEvmPublicClient(rpcUrl);
    let receipt;
    try {
      // Bounded WAIT, never a point-in-time read: `getTransactionReceipt` throws while the tx is
      // still pending, which would resurrect the very failure mode this method was rewritten to
      // remove. See ReceiptFetchClient in ./receipt-identity.
      receipt = await client.waitForTransactionReceipt({
        hash: result.id as `0x${string}`,
        confirmations,
        timeout: timeoutMs,
      });
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      logger.error(LOG_SYSTEM, 'deployOnchainId: receipt wait failed or timed out', {
        txHash: result.id,
        confirmations,
        timeoutMs,
        cause,
      });
      // INDETERMINATE, NOT FAILED. The transaction was submitted; a timeout means confirmation
      // was not OBSERVED, not that it did not happen. A caller that reads this as failure and
      // retries will either create a second orphan or hit `wallet already linked to an identity`.
      throw new IdentityOperationFailed(
        `ONCHAINID deployment for ${holder} was submitted (tx ${result.id}) but confirmation was ` +
          `not observed within ${timeoutMs}ms (${confirmations} confirmation(s) required): ` +
          `${cause.message}. INDETERMINATE — the transaction MAY STILL LAND. Do NOT treat this as ` +
          `a failed deployment and do NOT retry blind: check the factory for an identity already ` +
          `linked to ${holder} first, because a re-attempted createIdentity reverts with ` +
          `"wallet already linked to an identity" and leaves the holder permanently orphaned.`,
        'deployOnchainId',
        cause,
        this.addresses.identityFactory
      );
    }

    // Revert check BEFORE log parsing. A reverted tx has no WalletLinked event, so falling through
    // would report "no identity was resolvable" — which describes the OPPOSITE retry semantics.
    // Reverted: nothing was created, retrying is SAFE.
    // Landed-but-unresolvable: an identity may exist, retrying is DANGEROUS.
    // Conflating them tells the caller to do the dangerous thing.
    if (receipt.status !== 'success') {
      logger.error(LOG_SYSTEM, 'deployOnchainId: transaction reverted', {
        txHash: result.id,
        receiptStatus: receipt.status,
      });
      throw new IdentityOperationFailed(
        `ONCHAINID deployment for ${holder} REVERTED on-chain (tx ${result.id}, receipt status ` +
          `"${receipt.status}"). No identity was created, so nothing is orphaned and a retry is ` +
          `safe once the revert cause is addressed.`,
        'deployOnchainId',
        undefined,
        this.addresses.identityFactory
      );
    }

    const onchainId = parseIdentityFromDeployReceipt(
      receipt,
      this.addresses.identityFactory,
      holder
    );

    logger.info(LOG_SYSTEM, 'deployOnchainId: receipt identity resolution', {
      txHash: result.id,
      receiptStatus: receipt.status,
      resolvedOnchainId: onchainId ?? null,
    });

    if (!onchainId) {
      // Distinct from the revert arm above: the tx SUCCEEDED, so an identity probably exists but
      // could not be read out of the logs. Retrying is NOT safe here.
      throw new IdentityOperationFailed(
        `ONCHAINID deployment for ${holder} SUCCEEDED on-chain (tx ${result.id}) but no identity ` +
          `was resolvable from the factory receipt logs. An identity LIKELY EXISTS for this ` +
          `holder — do NOT retry blind: probe the factory first, because a re-attempted ` +
          `createIdentity reverts with "wallet already linked to an identity".`,
        'deployOnchainId',
        undefined,
        this.addresses.identityFactory
      );
    }

    await this.assertIdentityKeyHasPurpose({
      operation: 'deployOnchainId',
      onchainId,
      address: this.operatorManagementKey,
      purpose: IDENTITY_KEY_PURPOSE_MANAGEMENT,
      missingPurposeMessage:
        `ONCHAINID deployment for ${holder} succeeded (identity ${onchainId}) but ` +
        `operatorManagementKey ${this.operatorManagementKey} does not hold MANAGEMENT on the ` +
        `identity. The configured key must be the address that will execute attachClaim.`,
      rpcFailureMessage:
        `ONCHAINID deployment for ${holder} succeeded (identity ${onchainId}, tx ${result.id}) but ` +
        `could not verify operatorManagementKey ${this.operatorManagementKey} MANAGEMENT via RPC. ` +
        `The identity LIKELY EXISTS — resume the saga using onchainId ${onchainId}.`,
    });

    // INV-3 / INV-4: explicit confirmed arm — required onchainId + discriminant (no WriteExecutionResult spread).
    return { id: result.id, onchainId, completion: 'confirmed' };
  }

  /**
   * Grant the holder a MANAGEMENT key on their ONCHAINID.
   *
   * **Saga ordering is load-bearing:** consumers MUST call this after `deployOnchainId` and
   * **before** `attachClaim`. If attach-claim or register fails partway through onboarding, the
   * holder already holds MANAGEMENT and can rescue their own identity. Running this after
   * attach-claim would leave a partial failure with an identity only the operator can touch —
   * a fresh orphan trap. Do not reorder for convenience.
   *
   * **Completion (SF-3):** trusts SF-1 `WriteExecutionResult.completion` from {@link execute}.
   * - `completion === 'submitted'`: return `{ id }` without post-submit key-purpose assert.
   *   Submit-only `{ id }` is **not** proof that MANAGEMENT landed — confirm via
   *   {@link hasIdentityKeyPurpose} (or Relayer/WAL).
   * - absent / `'confirmed'`: assert holder MANAGEMENT via `keyHasPurpose`; throw
   *   {@link IdentityOperationFailed} on lacks / RPC fail (unchanged).
   */
  async grantHolderManagementKey(
    input: { onchainId: string; holder: string },
    executionConfig: ExecutionConfig,
    onStatusChange?: (status: TxStatus, details: TransactionStatusUpdate) => void,
    runtimeApiKey?: string
  ): Promise<OperationResult> {
    const { onchainId, holder } = input;
    const action = assembleGrantHolderManagementKeyAction(onchainId, holder);

    const result = await this.execute(
      'grantHolderManagementKey',
      action,
      executionConfig,
      onStatusChange,
      runtimeApiKey
    );

    // INV-1 / INV-5 / INV-6 / INV-14: single predicate after execute; skip assert only.
    // Do not re-read transactionOptions or strategy result here (SF-1 choke point owns merge).
    if (result.completion === 'submitted') {
      // INV-2 / INV-10 / INV-20: literal { id }; no completion leak; no MANAGEMENT fabricate.
      return { id: result.id };
    }

    // INV-7 / INV-8: confirmed / absent (SF-1 default) — byte-identical assert + errors.
    await this.assertIdentityKeyHasPurpose({
      operation: 'grantHolderManagementKey',
      onchainId,
      address: holder,
      purpose: IDENTITY_KEY_PURPOSE_MANAGEMENT,
      missingPurposeMessage:
        `grantHolderManagementKey for ${holder} on ${onchainId} was submitted (tx ${result.id}) ` +
        `but the holder does not hold MANAGEMENT on the identity.`,
      rpcFailureMessage:
        `grantHolderManagementKey for ${holder} on ${onchainId} was submitted (tx ${result.id}) but ` +
        `could not verify holder MANAGEMENT via RPC. Resume the saga using onchainId ${onchainId}.`,
    });

    // INV-3: fresh { id } — do not spread WriteExecutionResult onto the public wire.
    return { id: result.id };
  }

  async registerTrustedIssuer(
    input: { issuer: string; topics: string[] },
    executionConfig: ExecutionConfig,
    onStatusChange?: (status: TxStatus, details: TransactionStatusUpdate) => void,
    runtimeApiKey?: string
  ): Promise<OperationResult> {
    const { issuer, topics } = input;

    // Idempotent: skip submission when the issuer is already trusted. No transaction is sent,
    // so `id` is a fixed sentinel that deliberately cannot be mistaken for a tx hash (no `0x`
    // prefix, no embedded address) to avoid breaking consumer formatting/validation.
    const alreadyTrusted = await isTrustedIssuer(
      this.rpcUrl(),
      this.addresses.trustedIssuersRegistry,
      issuer
    );
    if (alreadyTrusted) {
      logger.debug(LOG_SYSTEM, `Trusted issuer ${issuer} already registered; skipping submission.`);
      return { id: TRUSTED_ISSUER_NOOP_ID };
    }

    const action = assembleAddTrustedIssuerAction(
      this.addresses.trustedIssuersRegistry,
      issuer,
      topics
    );
    const result = await this.execute(
      'registerTrustedIssuer',
      action,
      executionConfig,
      onStatusChange,
      runtimeApiKey
    );
    // SF-4 INV-4: public OperationResult — strip SF-1 excess fields (completion, etc.).
    // No invented submit-only branch; audit/passthrough only.
    return { id: result.id };
  }

  async attachClaim(
    input: { onchainId: string; claim: OnboardingClaim },
    executionConfig: ExecutionConfig,
    onStatusChange?: (status: TxStatus, details: TransactionStatusUpdate) => void,
    runtimeApiKey?: string
  ): Promise<OperationResult> {
    const { onchainId, claim } = input;
    const issuerAddress = claim.issuer ?? this.trustedIssuer;
    // Fail clearly at the capability boundary rather than assembling calldata with an
    // empty issuer address (which would produce an invalid arg / opaque downstream revert).
    if (!issuerAddress) {
      throw new IdentityOperationFailed(
        'attachClaim requires an issuer address: provide claim.issuer or configure a trustedIssuer.',
        'attachClaim',
        undefined,
        onchainId
      );
    }
    const action = assembleAttachClaimAction(onchainId, claim, issuerAddress);
    const result = await this.execute(
      'attachClaim',
      action,
      executionConfig,
      onStatusChange,
      runtimeApiKey
    );
    // SF-4 INV-3 / INV-6: grant-style strip — exact `{ id }`; no completion-keyed early-return.
    return { id: result.id };
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
    const result = await this.execute(
      'registerIdentity',
      action,
      executionConfig,
      onStatusChange,
      runtimeApiKey
    );
    // SF-4 INV-3 / INV-15: strip after execute; pre-read getOnchainId guard unchanged.
    return { id: result.id };
  }

  dispose(): void {
    logger.debug(LOG_SYSTEM, 'IRS service disposed.');
  }

  // ---- Internals ----

  private rpcUrl(): string {
    return resolveRpcUrl(this.networkConfig);
  }

  private async assertIdentityKeyHasPurpose(input: {
    operation: string;
    onchainId: string;
    address: string;
    purpose: number;
    missingPurposeMessage: string;
    rpcFailureMessage: string;
  }): Promise<void> {
    const { operation, onchainId, address, purpose, missingPurposeMessage, rpcFailureMessage } =
      input;

    const lookup = await lookupIdentityKeyPurpose(this.rpcUrl(), onchainId, address, purpose);
    if (lookup.status === 'read_failed') {
      throw new IdentityOperationFailed(rpcFailureMessage, operation, lookup.cause, onchainId);
    }
    if (lookup.status === 'lacks') {
      throw new IdentityOperationFailed(missingPurposeMessage, operation, undefined, onchainId);
    }
  }

  /**
   * Typing hygiene (INV-22): `runCapabilityWrite` already returns {@link WriteExecutionResult}.
   * Widening the annotation lets grant (and future SF-2 deploy) read `.completion` without casts.
   * Runtime passthrough — no wrapper that could strip `completion`.
   */
  private execute(
    operation: string,
    action: WriteContractParameters,
    executionConfig: ExecutionConfig,
    onStatusChange?: (status: TxStatus, details: TransactionStatusUpdate) => void,
    runtimeApiKey?: string
  ): Promise<WriteExecutionResult> {
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
      // WriteCompletionDisagreementError is rethrown inside runCapabilityWrite (SF-1 INV-11)
      // before this mapper runs — must not wrap disagreement as IdentityOperationFailed (INV-9).
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

function safeRpcHost(rpcUrl: string): string {
  try {
    return new URL(rpcUrl).host;
  } catch {
    return '(invalid-url)';
  }
}
