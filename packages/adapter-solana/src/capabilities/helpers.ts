import {
  guardRuntimeCapability as guardSharedRuntimeCapability,
  registerRuntimeCapabilityCleanup as registerSharedRuntimeCapabilityCleanup,
  withRuntimeCapability as withSharedRuntimeCapability,
  type RuntimeCleanupStage,
} from '@openzeppelin/adapter-runtime-utils';
import type { NetworkConfig, RuntimeCapability, SolanaNetworkConfig } from '@openzeppelin/ui-types';
import { isSolanaNetworkConfig } from '@openzeppelin/ui-types';

export function asSolanaNetworkConfig(config: NetworkConfig): SolanaNetworkConfig {
  if (!isSolanaNetworkConfig(config)) {
    throw new Error('Expected a Solana network configuration.');
  }

  return config;
}

export function withRuntimeCapability(
  networkConfig: SolanaNetworkConfig,
  capabilityName = 'capability'
): RuntimeCapability {
  return withSharedRuntimeCapability(networkConfig, capabilityName);
}

export function guardRuntimeCapability<T extends object>(
  capability: T,
  networkConfig: SolanaNetworkConfig,
  capabilityName: string,
  onDispose?: () => void | Promise<void>,
  cleanupStage: RuntimeCleanupStage = 'general'
): T & RuntimeCapability {
  return guardSharedRuntimeCapability(
    capability,
    networkConfig,
    capabilityName,
    onDispose,
    cleanupStage
  );
}

export function registerRuntimeCapabilityCleanup(
  capability: RuntimeCapability,
  cleanup: () => void | Promise<void>,
  cleanupStage: RuntimeCleanupStage = 'general'
): void {
  registerSharedRuntimeCapabilityCleanup(capability, cleanup, cleanupStage);
}
