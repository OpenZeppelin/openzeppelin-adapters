import {
  guardRuntimeCapability as guardSharedRuntimeCapability,
  registerRuntimeCapabilityCleanup as registerSharedRuntimeCapabilityCleanup,
  withRuntimeCapability as withSharedRuntimeCapability,
  type RuntimeCleanupStage,
} from '@openzeppelin/adapter-runtime-utils';
import type {
  ExecutionConfig,
  ExecutionMethodDetail,
  FormFieldType,
  NetworkConfig,
  RuntimeCapability,
  TransactionStatusUpdate,
  TxStatus,
} from '@openzeppelin/ui-types';

import type { CapabilityExecutor } from '../shared/executor';
import { EvmProviderKeys, type TypedEvmNetworkConfig } from '../types';

export type { CapabilityExecutor } from '../shared/executor';

/**
 * The injected transaction-submission callback shared by every write-capable capability
 * factory (`createAccessControl`, `createIRS`, `createERC3643`, `createERC4626`, …). The
 * adapter runtime supplies this; capabilities never touch wallet/signing infrastructure
 * directly.
 *
 * ## Execution-contract conformance (FR-018 — CONFIRMED, research.md R6)
 *
 * This is the same injected-callback shape as `ExecutionCapability.signAndBroadcast`
 * (`@openzeppelin/ui-types`), whose optional `waitForTransactionConfirmation(txHash)` already
 * expresses the async submit-then-poll model the RI plugin needs. No new execution primitive
 * was added: the callback may submit and then poll internally before resolving the confirmed
 * hash, and the existing `EoaExecutionStrategy` / `RelayerExecutionStrategy` compose behind it
 * unchanged (the RI plugin's future strategy submits in-process and polls, then resolves here).
 * Capabilities stay strategy-agnostic and carry no Relayer-plugin-runtime coupling (FR-011).
 * Verified by `erc3643/__tests__/erc3643.execution-strategy.test.ts` (submit-then-poll) and
 * `erc3643.strategies.test.ts` (strategy-agnostic composition).
 */
export type SignAndBroadcast = (
  transactionData: unknown,
  executionConfig: ExecutionConfig,
  onStatusChange: (status: TxStatus, details: TransactionStatusUpdate) => void,
  runtimeApiKey?: string
) => Promise<{ txHash: string; result?: unknown }>;

/**
 * Adapt an injected {@link SignAndBroadcast} into the {@link CapabilityExecutor} that
 * services delegate to, normalizing the result to `{ id: txHash }`.
 *
 * Extracted so write-capable factories share one submission adapter instead of each
 * re-implementing the same closure.
 */
export function adaptSignAndBroadcast(signAndBroadcast: SignAndBroadcast): CapabilityExecutor {
  return async (txData, executionConfig, onStatusChange, runtimeApiKey) => {
    const result = await signAndBroadcast(
      txData,
      executionConfig,
      onStatusChange ?? (() => {}),
      runtimeApiKey
    );

    return { id: result.txHash };
  };
}

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
