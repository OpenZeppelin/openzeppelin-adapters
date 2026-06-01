import type { ERC3643Capability, NetworkConfig } from '@openzeppelin/ui-types';

import { createEvmErc3643Service } from '../erc3643';
import { adaptSignAndBroadcast, asTypedEvmNetworkConfig, guardRuntimeCapability } from './helpers';
import type { SignAndBroadcast } from './helpers';

/**
 * Options for {@link createERC3643}.
 *
 * `tokenAddress` is the deployment-specific T-REX token the capability operates against
 * (its methods take holder/amount arguments rather than per-call addresses). The capability
 * never touches wallet/signing infrastructure — writes route through `signAndBroadcast`.
 */
export interface CreateERC3643Options {
  signAndBroadcast: SignAndBroadcast;
  tokenAddress: string;
}

/**
 * Create the EVM ERC-3643 (T-REX) permissioned-token capability.
 *
 * Mirrors {@link createAccessControl} / {@link createIRS}: assembles the service, adapts the
 * injected `signAndBroadcast` into the service's executor via the shared
 * {@link adaptSignAndBroadcast} helper, and wraps the result with `guardRuntimeCapability`
 * for the `RuntimeCapability` surface and idempotent `dispose()`.
 */
export function createERC3643(
  config: NetworkConfig,
  options: CreateERC3643Options
): ERC3643Capability {
  const networkConfig = asTypedEvmNetworkConfig(config);
  const service = createEvmErc3643Service(
    networkConfig,
    adaptSignAndBroadcast(options.signAndBroadcast),
    { tokenAddress: options.tokenAddress }
  );

  return guardRuntimeCapability(
    service,
    networkConfig,
    'erc3643',
    () => service.dispose(),
    'general'
  ) as unknown as ERC3643Capability;
}
