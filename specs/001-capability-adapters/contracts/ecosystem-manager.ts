/**
 * Ecosystem Manager Contract
 *
 * Defines how consumer apps load and instantiate adapter capabilities.
 * This replaces the current getAdapter() → createAdapter() pattern with
 * profile-based runtime creation.
 *
 * This file is a DESIGN ARTIFACT, not production code.
 */

import type {
  CapabilityFactoryMap,
  Ecosystem,
  EcosystemExport,
  EcosystemMetadata,
  EcosystemRuntime,
  NetworkConfig,
  ProfileName,
} from '@openzeppelin/ui-types';

/**
 * Loads the full adapter module for an ecosystem (lazy, cached).
 * Unchanged from current pattern — same dynamic import + switch.
 */
declare function loadAdapterModule(ecosystem: Ecosystem): Promise<EcosystemExport>;

/**
 * CURRENT API (to be removed):
 *   getAdapter(networkConfig: NetworkConfig): Promise<ContractAdapter>
 *
 * NEW API:
 */

/**
 * Creates a profile-based runtime for an ecosystem + network combination.
 * Replaces getAdapter(). Returns a runtime with pre-composed capabilities
 * and shared internal state.
 *
 * @example
 * const runtime = await getRuntime('operator', networkConfig);
 * const roles = await runtime.accessControl.getRoles(contractAddress);
 * // When switching networks:
 * runtime.dispose();
 * const newRuntime = await getRuntime('operator', newNetworkConfig);
 */
export async function getRuntime(
  profile: ProfileName,
  networkConfig: NetworkConfig
): Promise<EcosystemRuntime> {
  const def = await loadAdapterModule(networkConfig.ecosystem);
  return def.createRuntime(profile, networkConfig);
}

/**
 * Creates an individual capability for an ecosystem + network combination.
 * Used when an app needs only one capability without a full profile runtime.
 *
 * @example
 * const addressing = await getCapability('addressing', networkConfig);
 * const isValid = addressing.isValidAddress(userInput);
 */
export async function getCapability<K extends keyof CapabilityFactoryMap>(
  capabilityName: K,
  networkConfig: NetworkConfig
): Promise<ReturnType<NonNullable<CapabilityFactoryMap[K]>>> {
  const def = await loadAdapterModule(networkConfig.ecosystem);
  const factory = def.capabilities[capabilityName];
  if (!factory) {
    throw new Error(
      `Capability "${String(capabilityName)}" is not supported by the ${networkConfig.ecosystem} adapter`
    );
  }
  // Tier 1 factories may not need config; Tier 2+ always do
  return (factory as (config: NetworkConfig) => unknown)(networkConfig) as ReturnType<
    NonNullable<CapabilityFactoryMap[K]>
  >;
}

/**
 * Returns the ecosystem definition (unchanged from current API).
 */
export async function getEcosystemDefinition(ecosystem: Ecosystem): Promise<EcosystemExport> {
  return loadAdapterModule(ecosystem);
}

/**
 * Returns static metadata (unchanged — still synchronous, still from
 * static imports of adapter metadata sub-paths).
 */
export declare function getEcosystemMetadata(ecosystem: Ecosystem): EcosystemMetadata;
