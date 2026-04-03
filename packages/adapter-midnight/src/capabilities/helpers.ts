import {
  guardRuntimeCapability as guardSharedRuntimeCapability,
  registerRuntimeCapabilityCleanup as registerSharedRuntimeCapabilityCleanup,
  withRuntimeCapability as withSharedRuntimeCapability,
  type RuntimeCleanupStage,
} from '@openzeppelin/adapter-runtime-utils';
import type {
  MidnightNetworkConfig,
  NetworkConfig,
  RuntimeCapability,
} from '@openzeppelin/ui-types';
import { isMidnightNetworkConfig } from '@openzeppelin/ui-types';

export function asMidnightNetworkConfig(config: NetworkConfig): MidnightNetworkConfig {
  if (!isMidnightNetworkConfig(config)) {
    throw new Error('Expected a Midnight network configuration.');
  }
  return config;
}

export function withRuntimeCapability(
  networkConfig: MidnightNetworkConfig,
  capabilityName = 'capability'
): RuntimeCapability {
  return withSharedRuntimeCapability(networkConfig, capabilityName);
}

export function guardRuntimeCapability<T extends object>(
  capability: T,
  networkConfig: MidnightNetworkConfig,
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

const MIDNIGHT_UI_LABELS: Record<string, string> = {
  relayerConfigTitle: 'Transaction Configuration',
  relayerConfigActiveDesc: 'Customize transaction parameters for submission',
  relayerConfigInactiveDesc: 'Using recommended transaction configuration for reliability',
  relayerConfigPresetTitle: 'Recommended Preset Active',
  relayerConfigPresetDesc: 'Transactions will use recommended parameters for quick inclusion',
  relayerConfigCustomizeBtn: 'Customize Settings',
  detailsTitle: 'Relayer Details',
  network: 'Network',
  relayerId: 'Relayer ID',
  active: 'Active',
  paused: 'Paused',
  systemDisabled: 'System Disabled',
  balance: 'Balance',
  nonce: 'Nonce',
  pending: 'Pending Transactions',
  lastTransaction: 'Last Transaction',
};

export function getMidnightUiLabels(): Record<string, string> {
  return { ...MIDNIGHT_UI_LABELS };
}
