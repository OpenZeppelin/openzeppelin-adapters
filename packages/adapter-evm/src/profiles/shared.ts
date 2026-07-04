import { mainnet } from 'viem/chains';

import type { TypedEvmNetworkConfig } from '@openzeppelin/adapter-evm-core';
import {
  createRuntime as createCoreRuntime,
  createEvmPublicClient,
  resolveRpcUrl,
} from '@openzeppelin/adapter-evm-core';
import {
  createLazyRuntimeCapabilityFactories,
  registerRuntimeCapabilityCleanup,
} from '@openzeppelin/adapter-runtime-utils';
import type {
  CapabilityFactoryMap,
  EcosystemRuntime,
  ExecutionConfig,
  NetworkConfig,
  ProfileName,
  TransactionStatusUpdate,
  TxStatus,
} from '@openzeppelin/ui-types';

import {
  createAccessControl,
  createAddressing,
  createContractLoading,
  createExecution,
  createExplorer,
  createNameResolution,
  createNetworkCatalog,
  createQuery,
  createRelayer,
  createSchema,
  createTypeMapping,
  createUiKit,
  createUiLabels,
  createWallet,
} from '../capabilities';

function toTypedEvmNetworkConfig(config: NetworkConfig): TypedEvmNetworkConfig {
  if (config.ecosystem !== 'evm') {
    throw new Error(`Expected an EVM network configuration, received ${config.ecosystem}.`);
  }

  return config as TypedEvmNetworkConfig;
}

/**
 * Build the viem `PublicClient` injected into the name-resolution capability (SF-2, D-A). Constructed
 * here — the composition layer, where `config.viemChain` is in scope — and injected at the capability
 * boundary. `config.viemChain` for ENS-supporting networks carries `contracts.ensUniversalResolver`;
 * where it does not, `createEvmPublicClient` falls back to a minimal chain with no contracts, so the
 * capability's sync support-check reports `UNSUPPORTED_NETWORK` rather than crashing (D-B). Relies on
 * viem's default CCIP-Read; SF-5 introduces a dedicated ENS client builder if it needs custom gateways.
 */
function ensClient(config: TypedEvmNetworkConfig) {
  return createEvmPublicClient(resolveRpcUrl(config), config.viemChain);
}

/**
 * RPC endpoint for the dedicated **mainnet** ENS L1 client (SF-5, Design Open Q4). Precedence: when
 * the bound network *is* Ethereum mainnet, reuse its configured endpoint (so a user's keyed mainnet
 * RPC is honored); otherwise fall back to viem's built-in default mainnet public transport — a
 * documented rate-limit caveat, acceptable because this endpoint is used ONLY for the L2-bound
 * cross-chain path and carries no secret of its own (INV-24). The returned URL is never threaded into
 * provenance or errors (INV-24).
 */
function resolveMainnetRpcUrl(config: TypedEvmNetworkConfig): string {
  return config.chainId === mainnet.id ? resolveRpcUrl(config) : mainnet.rpcUrls.default.http[0];
}

/**
 * Build the dedicated **mainnet** L1 client injected into name resolution (SF-5, D-V1) — the ENS v2
 * Universal-Resolver entry point. `mainnet` always carries `contracts.ensUniversalResolver` (the
 * DAO-owned UR proxy), so the L1 cross-chain path resolves an L2-bound name chain-scoped via L1
 * (`coinType = toCoinType(boundChainId)`). Borrowed by the capability, never disposed (INV-21). The
 * bound per-network `ensClient` above is unchanged.
 */
function ensL1Client(config: TypedEvmNetworkConfig) {
  return createEvmPublicClient(resolveMainnetRpcUrl(config), mainnet);
}

function bridgeSignAndBroadcast(
  execution: ReturnType<typeof createExecution>
): (
  transactionData: unknown,
  executionConfig: ExecutionConfig,
  onStatusChange: (status: TxStatus, details: TransactionStatusUpdate) => void,
  runtimeApiKey?: string
) => Promise<{ txHash: string; result?: unknown }> {
  return (transactionData, executionConfig, onStatusChange, runtimeApiKey) =>
    execution.signAndBroadcast(
      transactionData,
      executionConfig,
      onStatusChange as (status: string, details: TransactionStatusUpdate) => void,
      runtimeApiKey
    );
}

export const capabilityFactories: CapabilityFactoryMap = {
  addressing: (_config?: NetworkConfig) => createAddressing(),
  explorer: (config?: NetworkConfig) =>
    createExplorer(config ? toTypedEvmNetworkConfig(config) : undefined),
  networkCatalog: createNetworkCatalog,
  uiLabels: createUiLabels,
  contractLoading: (config: NetworkConfig) =>
    createContractLoading(toTypedEvmNetworkConfig(config)),
  schema: (config: NetworkConfig) => createSchema(toTypedEvmNetworkConfig(config)),
  typeMapping: (config: NetworkConfig) => createTypeMapping(toTypedEvmNetworkConfig(config)),
  query: (config: NetworkConfig) => createQuery(toTypedEvmNetworkConfig(config)),
  execution: (config: NetworkConfig) => createExecution(toTypedEvmNetworkConfig(config)),
  wallet: (config: NetworkConfig) => createWallet(toTypedEvmNetworkConfig(config)),
  uiKit: (config: NetworkConfig) => createUiKit(toTypedEvmNetworkConfig(config)),
  relayer: (config: NetworkConfig) => createRelayer(toTypedEvmNetworkConfig(config)),
  nameResolution: (config: NetworkConfig) => {
    const typed = toTypedEvmNetworkConfig(config);
    return createNameResolution(typed, {
      publicClient: ensClient(typed),
      ensL1Client: ensL1Client(typed), // SF-5 — enables the L1 cross-chain path (D-V1)
    });
  },
  accessControl: (config: NetworkConfig) => {
    const typedConfig = toTypedEvmNetworkConfig(config);
    const execution = createExecution(typedConfig);
    const ac = createAccessControl(typedConfig, {
      signAndBroadcast: bridgeSignAndBroadcast(execution),
    });

    registerRuntimeCapabilityCleanup(ac, () => execution.dispose());

    return ac;
  },
};

function createRuntimeCapabilityFactories(config: TypedEvmNetworkConfig): CapabilityFactoryMap {
  return createLazyRuntimeCapabilityFactories(config, {
    addressing: () => createAddressing(),
    explorer: () => createExplorer(config),
    networkCatalog: () => createNetworkCatalog(),
    uiLabels: () => createUiLabels(),
    contractLoading: () => createContractLoading(config),
    schema: () => createSchema(config),
    typeMapping: () => createTypeMapping(config),
    query: (_runtimeConfig, getCapability) =>
      createQuery(config, {
        loadContract: (source) => getCapability('contractLoading').loadContract(source),
      }),
    execution: () => createExecution(config),
    wallet: () => createWallet(config),
    uiKit: () => createUiKit(config),
    relayer: () => createRelayer(config),
    nameResolution: () =>
      createNameResolution(config, {
        publicClient: ensClient(config),
        ensL1Client: ensL1Client(config), // SF-5 — enables the L1 cross-chain path (D-V1)
      }),
    accessControl: (_runtimeConfig, getCapability) =>
      createAccessControl(config, {
        signAndBroadcast: bridgeSignAndBroadcast(
          getCapability('execution') as ReturnType<typeof createExecution>
        ),
      }),
  });
}

export function createRuntime(
  profile: ProfileName,
  config: TypedEvmNetworkConfig,
  options?: { uiKit?: string }
): EcosystemRuntime {
  return createCoreRuntime(profile, config, createRuntimeCapabilityFactories(config), options);
}
