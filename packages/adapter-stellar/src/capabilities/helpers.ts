import {
  guardRuntimeCapability as guardSharedRuntimeCapability,
  registerRuntimeCapabilityCleanup as registerSharedRuntimeCapabilityCleanup,
  withRuntimeCapability as withSharedRuntimeCapability,
  type RuntimeCleanupStage,
} from '@openzeppelin/adapter-runtime-utils';
import type {
  ExecutionMethodDetail,
  FormFieldType,
  NetworkConfig,
  RuntimeCapability,
  StellarNetworkConfig,
} from '@openzeppelin/ui-types';
import { isStellarNetworkConfig } from '@openzeppelin/ui-types';

export function asStellarNetworkConfig(config: NetworkConfig): StellarNetworkConfig {
  if (!isStellarNetworkConfig(config)) {
    throw new Error('Expected a Stellar network configuration.');
  }

  return config;
}

export function withRuntimeCapability(
  networkConfig: StellarNetworkConfig,
  capabilityName = 'capability'
): RuntimeCapability {
  return withSharedRuntimeCapability(networkConfig, capabilityName);
}

export function guardRuntimeCapability<T extends object>(
  capability: T,
  networkConfig: StellarNetworkConfig,
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

export function getStellarSupportedExecutionMethods(): Promise<ExecutionMethodDetail[]> {
  return Promise.resolve([
    {
      type: 'eoa',
      name: 'EOA (External Account)',
      description: 'Execute using a standard Stellar account address.',
    },
    {
      type: 'relayer',
      name: 'OpenZeppelin Relayer',
      description: 'Execute via a OpenZeppelin open source transaction relayer service.',
      disabled: false,
    },
    {
      type: 'multisig',
      name: 'Stellar Multisig',
      description: 'Execute via a Stellar multisignature configuration.',
      disabled: true,
    },
  ]);
}

export function getStellarUiLabels(): Record<string, string> {
  return {
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
    nonce: 'Sequence',
    pending: 'Pending Transactions',
    lastTransaction: 'Last Transaction',
  };
}

export function getStellarContractDefinitionInputs(): FormFieldType[] {
  return [
    {
      id: 'contractAddress',
      name: 'contractAddress',
      label: 'Contract ID',
      type: 'blockchain-address',
      validation: { required: true },
      placeholder: 'C...',
      helperText: 'Enter the Stellar contract ID (C...).',
    },
  ];
}
