import type { PublicClient } from 'viem';

import type { NameResolutionCapability, NetworkConfig } from '@openzeppelin/ui-types';

import { createEvmNameResolutionService } from '../name-resolution';
import { asTypedEvmNetworkConfig, guardRuntimeCapability } from './helpers';

/**
 * Dependencies injected into {@link createNameResolution}.
 *
 * The client is **owned by the composing runtime** (see State Ownership / INV-15) — the capability
 * borrows it and never disposes it.
 */
export interface CreateNameResolutionOptions {
  /**
   * A viem `PublicClient` whose `chain` carries `contracts.ensUniversalResolver` for ENS-supporting
   * networks. Injected (not constructed here — D-A / INV-25) so the capability inherits the runtime's
   * transport / timeout / CCIP-Read configuration and stays trivially mockable in unit tests. When
   * the bound network's chain has no Universal Resolver, `resolveName` returns a typed
   * `UNSUPPORTED_NETWORK` — it does not throw (D-B).
   */
  readonly publicClient: PublicClient;

  /**
   * SF-5 — NEW, OPTIONAL. A dedicated **mainnet** viem client, used ONLY when the bound network has
   * no Universal Resolver, to resolve an ENS name chain-scoped to the bound network via L1
   * (`coinType = toCoinType(boundChainId)`, D-V1). Also borrowed, never disposed (INV-21). When
   * absent, an L2-bound `resolveName` returns `UNSUPPORTED_NETWORK` exactly as SF-2 does today
   * (D-B preserved) — so wiring it is purely additive.
   */
  readonly ensL1Client?: PublicClient;
}

/**
 * Create the EVM name-resolution capability (forward path — SF-2).
 *
 * Mirrors {@link createERC4626}: narrows the network config, assembles the service over the injected
 * viem client, and wraps it with `guardRuntimeCapability` for the `RuntimeCapability` surface
 * (network context, idempotent `dispose()`, use-after-dispose → `RuntimeDisposedError` raised before
 * the method body, in-flight-promise rejection on dispose).
 *
 * The capability is ALWAYS constructible on EVM: `isValidName` is network-independent, and
 * `resolveName` is always present (it reports `UNSUPPORTED_NETWORK` for a bound network without a
 * Universal Resolver rather than being omitted). Whole-capability omission is reserved for non-EVM
 * adapters (SC-006). `cleanupStage: 'general'` — the capability releases no RPC resource of its own
 * (it borrows the runtime's client — INV-15).
 */
export function createNameResolution(
  config: NetworkConfig,
  options: CreateNameResolutionOptions
): NameResolutionCapability {
  const networkConfig = asTypedEvmNetworkConfig(config);
  const service = createEvmNameResolutionService(
    networkConfig,
    options.publicClient,
    options.ensL1Client
  );

  return guardRuntimeCapability(
    service,
    networkConfig,
    'nameResolution',
    () => service.dispose(),
    'general'
  ) as unknown as NameResolutionCapability;
}
