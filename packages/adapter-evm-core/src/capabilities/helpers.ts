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
} from '@openzeppelin/ui-types';

import { EvmProviderKeys, type TypedEvmNetworkConfig } from '../types';

export function asTypedEvmNetworkConfig(config: NetworkConfig): TypedEvmNetworkConfig {
  if (config.ecosystem !== 'evm') {
    throw new Error(`Expected an EVM network configuration, received ${config.ecosystem}.`);
  }

  return config as TypedEvmNetworkConfig;
}

export function withRuntimeCapability(
  networkConfig: TypedEvmNetworkConfig,
  capabilityName = 'capability'
): RuntimeCapability {
  return withSharedRuntimeCapability(networkConfig, capabilityName);
}

export function guardRuntimeCapability<T extends object>(
  capability: T,
  networkConfig: TypedEvmNetworkConfig,
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

export function getEvmSupportedExecutionMethods(): Promise<ExecutionMethodDetail[]> {
  return Promise.resolve([
    {
      type: 'eoa',
      name: 'EOA (External Account)',
      description: 'Execute using a standard wallet address.',
    },
    {
      type: 'relayer',
      name: 'OpenZeppelin Relayer',
      description: 'Execute via a OpenZeppelin open source transaction relayer service.',
      disabled: false,
    },
    {
      type: 'multisig',
      name: 'Safe Multisig',
      description: 'Execute via a Safe multisignature wallet.',
      disabled: true,
    },
  ]);
}

export function getEvmUiLabels(): Record<string, string> {
  return {
    relayerConfigTitle: 'Gas Configuration',
    relayerConfigActiveDesc: 'Customize gas pricing strategy for transaction submission',
    relayerConfigInactiveDesc: 'Using recommended gas configuration for reliable transactions',
    relayerConfigPresetTitle: 'Fast Speed Preset Active',
    relayerConfigPresetDesc: 'Transactions will use high priority gas pricing for quick inclusion',
    relayerConfigCustomizeBtn: 'Customize Gas Settings',
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
}

export function getEvmContractDefinitionInputs(): FormFieldType[] {
  return [
    {
      id: 'contractAddress',
      name: 'contractAddress',
      label: 'Contract Address',
      type: 'blockchain-address',
      validation: { required: true },
      placeholder: '0x1234...abcd',
      helperText:
        'Enter the deployed contract address. For verified contracts, the ABI will be fetched automatically from the block explorer.',
    },
    {
      id: 'contractDefinition',
      name: 'contractDefinition',
      label: 'Contract ABI (Optional)',
      type: 'code-editor',
      validation: { required: false },
      placeholder:
        '[{"inputs":[],"name":"myFunction","outputs":[],"stateMutability":"nonpayable","type":"function"}]',
      helperText:
        "If the contract is not verified on the block explorer, paste the contract's ABI JSON here. You can find this in your contract's compilation artifacts or deployment files.",
      codeEditorProps: {
        language: 'json',
        placeholder: 'Paste your contract ABI JSON here...',
        maxHeight: '500px',
        performanceThreshold: 3000,
      },
    },
  ];
}

export function getEvmContractDefinitionProviders(): Array<{ key: string; label?: string }> {
  return [
    { key: EvmProviderKeys.Etherscan, label: 'Etherscan' },
    { key: EvmProviderKeys.Sourcify, label: 'Sourcify' },
  ];
}
