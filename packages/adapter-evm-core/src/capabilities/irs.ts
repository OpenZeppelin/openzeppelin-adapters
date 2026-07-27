import type {
  ExecutionConfig,
  IRSCapability,
  NetworkConfig,
  OperationResult,
  TransactionStatusUpdate,
  TxStatus,
} from '@openzeppelin/ui-types';

import { createEvmIRSService } from '../irs';
import type { DeployReceiptWaitOptions, EvmIRSAddresses } from '../irs';
import { assertValidOperatorManagementKey } from '../irs/management-key';
import type { FactoryIdentityLookup } from '../irs/onchain-reader';
import {
  adaptSignAndBroadcast,
  assertValidAddress,
  asTypedEvmNetworkConfig,
  guardRuntimeCapability,
} from './helpers';
import type { SignAndBroadcast } from './helpers';

/**
 * Options for {@link createIRS}.
 *
 * `addresses` carries the deployment-specific IRS / ONCHAINID contract addresses (the
 * capability methods take holder/claim arguments rather than per-call addresses). The
 * capability never holds the trusted-issuer signing key — only the optional `trustedIssuer`
 * identity address used as a fallback when an attached claim omits its issuer.
 */
export interface CreateIRSOptions {
  signAndBroadcast: SignAndBroadcast;
  addresses: EvmIRSAddresses;
  /**
   * Address that receives MANAGEMENT on deploy and executes `attachClaim` in the onboarding saga.
   *
   * Must be the operator EOA — never inferred from the transaction signer, because the IdFactory
   * `onlyOwner` caller may be a relayer contract.
   */
  operatorManagementKey: string;
  trustedIssuer?: string;
  /**
   * Bounds on the `deployOnchainId` confirmation wait (confirmations + timeout).
   *
   * Validated eagerly here, so an out-of-range bound throws at capability construction rather than
   * on a holder's first deploy. See `DeployReceiptWaitOptions`.
   */
  deployReceiptWait?: DeployReceiptWaitOptions;
}

export type { EvmIRSAddresses } from '../irs';

/**
 * EVM IRS capability surface, including adapter extensions not yet on the shared
 * {@link IRSCapability} contract in `@openzeppelin/ui-types`.
 */
export interface EvmIRSCapability extends IRSCapability {
  getFactoryIdentity(holder: string): Promise<FactoryIdentityLookup>;
  grantHolderManagementKey(
    input: { onchainId: string; holder: string },
    executionConfig: ExecutionConfig,
    onStatusChange?: (status: TxStatus, details: TransactionStatusUpdate) => void,
    runtimeApiKey?: string
  ): Promise<OperationResult>;
}

/**
 * Create the EVM IRS / ONCHAINID capability.
 *
 * Mirrors {@link createAccessControl}: assembles the service, adapts the injected
 * `signAndBroadcast` into the service's executor, and wraps the result with
 * `guardRuntimeCapability` for the `RuntimeCapability` surface and idempotent `dispose()`.
 */
export function createIRS(config: NetworkConfig, options: CreateIRSOptions): EvmIRSCapability {
  const networkConfig = asTypedEvmNetworkConfig(config);
  assertValidAddress('addresses.identityRegistry', options.addresses.identityRegistry);
  assertValidAddress('addresses.identityFactory', options.addresses.identityFactory);
  assertValidAddress('addresses.trustedIssuersRegistry', options.addresses.trustedIssuersRegistry);
  if (options.trustedIssuer !== undefined) {
    assertValidAddress('trustedIssuer', options.trustedIssuer);
  }
  assertValidOperatorManagementKey(options.operatorManagementKey);
  const service = createEvmIRSService(
    networkConfig,
    adaptSignAndBroadcast(options.signAndBroadcast),
    {
      addresses: options.addresses,
      trustedIssuer: options.trustedIssuer,
      operatorManagementKey: options.operatorManagementKey,
      deployReceiptWait: options.deployReceiptWait,
    }
  );

  return guardRuntimeCapability(
    service,
    networkConfig,
    'irs',
    () => service.dispose(),
    'general'
  ) as unknown as EvmIRSCapability;
}
