import {
  guardRuntimeCapability as guardSharedRuntimeCapability,
  registerRuntimeCapabilityCleanup as registerSharedRuntimeCapabilityCleanup,
  withRuntimeCapability as withSharedRuntimeCapability,
  type RuntimeCleanupStage,
} from '@openzeppelin/adapter-runtime-utils';
import type { NetworkConfig, RuntimeCapability } from '@openzeppelin/ui-types';
import { isPolkadotNetworkConfig } from '@openzeppelin/ui-types';

import type { TypedPolkadotNetworkConfig } from '../types';

export function asTypedPolkadotNetworkConfig(config: NetworkConfig): TypedPolkadotNetworkConfig {
  if (!isPolkadotNetworkConfig(config)) {
    throw new Error('Expected a Polkadot network configuration.');
  }

  return config as TypedPolkadotNetworkConfig;
}

export function assertPolkadotEvmExecution(config: TypedPolkadotNetworkConfig): void {
  if (config.executionType !== 'evm') {
    throw new Error(
      `Operation not supported for execution type: ${config.executionType}. Only 'evm' is currently supported.`
    );
  }
}

export function withRuntimeCapability(
  networkConfig: TypedPolkadotNetworkConfig,
  capabilityName = 'capability'
): RuntimeCapability {
  return withSharedRuntimeCapability(networkConfig, capabilityName);
}

export function guardRuntimeCapability<T extends object>(
  capability: T,
  networkConfig: TypedPolkadotNetworkConfig,
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
