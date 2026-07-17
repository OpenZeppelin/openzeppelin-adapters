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
   * SF-5 — OPTIONAL. A dedicated **mainnet** viem client, used for:
   *   - `001` SF-5 non-UR forward chain-scoped resolution (`coinType = toCoinType(boundChainId)`)
   *   - L1 miss-fallback on reverse (002) and forward (SF-4) **only when**
   *     {@link enableMainnetL1MissFallback} is explicitly `true`
   *
   * Also borrowed, never disposed (INV-21). Wiring `ensL1Client` does **not** imply opt-in.
   * Default miss-fallback posture remains OFF (003 SF-1).
   */
  readonly ensL1Client?: PublicClient;

  /**
   * SF-1 (003) — OPTIONAL. When `true`, permits mainnet-L1 miss-fallback after a **definitive**
   * bound-chain empty / NAME_NOT_FOUND-class miss on **both** `resolveAddress` and `resolveName`
   * (UR-carrying bound chains). When absent or `false` (default), preserves safe posture: reverse
   * does not consult L1 on bound empty; forward stays bound-UR-authoritative on bound miss.
   *
   * Does not relax never-silent-fallback — transport/gateway/timeout failures remain terminal.
   */
  readonly enableMainnetL1MissFallback?: boolean;
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
    options.ensL1Client,
    { enableMainnetL1MissFallback: options.enableMainnetL1MissFallback }
  );

  return guardRuntimeCapability(
    service,
    networkConfig,
    'nameResolution',
    () => service.dispose(),
    'general'
  ) as unknown as NameResolutionCapability;
}
