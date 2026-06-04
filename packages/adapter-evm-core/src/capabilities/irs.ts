import type { IRSCapability, NetworkConfig } from '@openzeppelin/ui-types';

import { createEvmIRSService } from '../irs';
import type { EvmIRSAddresses } from '../irs';
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
  trustedIssuer?: string;
}

export type { EvmIRSAddresses } from '../irs';

/**
 * Create the EVM IRS / ONCHAINID capability.
 *
 * Mirrors {@link createAccessControl}: assembles the service, adapts the injected
 * `signAndBroadcast` into the service's executor, and wraps the result with
 * `guardRuntimeCapability` for the `RuntimeCapability` surface and idempotent `dispose()`.
 */
export function createIRS(config: NetworkConfig, options: CreateIRSOptions): IRSCapability {
  const networkConfig = asTypedEvmNetworkConfig(config);
  assertValidAddress('addresses.identityRegistry', options.addresses.identityRegistry);
  assertValidAddress('addresses.identityFactory', options.addresses.identityFactory);
  assertValidAddress('addresses.trustedIssuersRegistry', options.addresses.trustedIssuersRegistry);
  if (options.trustedIssuer !== undefined) {
    assertValidAddress('trustedIssuer', options.trustedIssuer);
  }
  const service = createEvmIRSService(
    networkConfig,
    adaptSignAndBroadcast(options.signAndBroadcast),
    {
      addresses: options.addresses,
      trustedIssuer: options.trustedIssuer,
    }
  );

  return guardRuntimeCapability(
    service,
    networkConfig,
    'irs',
    () => service.dispose(),
    'general'
  ) as unknown as IRSCapability;
}
