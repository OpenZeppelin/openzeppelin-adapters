import type { ERC4626Capability, NetworkConfig } from '@openzeppelin/ui-types';

import { createEvmErc4626Service } from '../erc4626';
import {
  adaptSignAndBroadcast,
  assertValidAddress,
  asTypedEvmNetworkConfig,
  guardRuntimeCapability,
} from './helpers';
import type { SignAndBroadcast } from './helpers';

/**
 * Options for {@link createERC4626}.
 *
 * `vaultAddress` is the deployment-specific ERC-4626 vault the capability operates against
 * (its methods take amount/share arguments rather than per-call addresses). The capability
 * never touches wallet/signing infrastructure — writes route through `signAndBroadcast`.
 */
export interface CreateERC4626Options {
  signAndBroadcast: SignAndBroadcast;
  vaultAddress: string;
}

/**
 * Create the EVM ERC-4626 tokenized-vault capability.
 *
 * Mirrors {@link createERC3643} / {@link createIRS}: assembles the service, adapts the
 * injected `signAndBroadcast` into the service's executor via the shared
 * {@link adaptSignAndBroadcast} helper, and wraps the result with `guardRuntimeCapability`
 * for the `RuntimeCapability` surface and idempotent `dispose()`.
 */
export function createERC4626(
  config: NetworkConfig,
  options: CreateERC4626Options
): ERC4626Capability {
  const networkConfig = asTypedEvmNetworkConfig(config);
  assertValidAddress('vaultAddress', options.vaultAddress);
  const service = createEvmErc4626Service(
    networkConfig,
    adaptSignAndBroadcast(options.signAndBroadcast),
    { vaultAddress: options.vaultAddress }
  );

  return guardRuntimeCapability(
    service,
    networkConfig,
    'erc4626',
    () => service.dispose(),
    'general'
  ) as unknown as ERC4626Capability;
}
