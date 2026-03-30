/**
 * Capability Interface Contracts
 *
 * These are the public interface contracts for the capability-based adapter
 * architecture. They define the API surface that adapter packages expose to
 * consumers. All interfaces are defined in @openzeppelin/ui-types.
 *
 * This file is a DESIGN ARTIFACT, not production code. It serves as the
 * contract specification for implementation.
 */

import type { NetworkConfig } from '@openzeppelin/ui-types';

// =============================================================================
// Base
// =============================================================================

/**
 * Base interface for Tier 2 and Tier 3 capabilities.
 * Provides access to the network configuration the capability was created for.
 */
export interface RuntimeCapability {
  readonly networkConfig: NetworkConfig;
}

// =============================================================================
// Tier 1: Lightweight / Declarative (no network, no side-effects)
// =============================================================================

export interface AddressingCapability {
  isValidAddress(address: string): boolean;
}

export interface ExplorerCapability {
  getExplorerUrl(networkId: string, address: string): string | null;
  getExplorerTxUrl?(networkId: string, txHash: string): string | null;
}

export interface NetworkCatalogCapability {
  getNetworks(): NetworkConfig[];
}

export interface UiLabelsCapability {
  getUiLabels(): Record<string, string>;
}

// =============================================================================
// Tier 2: Schema / Definition (async, network-aware, no wallet)
// =============================================================================

export interface ContractLoadingCapability extends RuntimeCapability {
  loadContract(address: string, ...args: unknown[]): Promise<ContractSchema>;
  loadContractWithMetadata?(address: string, metadata: unknown): Promise<ContractSchema>;
  getContractDefinitionInputs(): ContractDefinitionInput[];
  getSupportedContractDefinitionProviders?(): string[];
  compareContractDefinitions?(a: unknown, b: unknown): boolean;
  validateContractDefinition?(definition: unknown): boolean;
  hashContractDefinition?(definition: unknown): string;
  getArtifactPersistencePolicy?(): ArtifactPersistencePolicy;
  prepareArtifactsForFunction?(functionId: string): Promise<unknown>;
}

export interface SchemaCapability extends RuntimeCapability {
  getWritableFunctions(schema: ContractSchema): FunctionSchema[];
  isViewFunction(schema: ContractSchema, functionId: string): boolean;
  filterAutoQueryableFunctions?(schema: ContractSchema): FunctionSchema[];
  getFunctionDecorations?(schema: ContractSchema, functionId: string): FunctionDecoration[];
}

export interface TypeMappingCapability extends RuntimeCapability {
  mapParameterTypeToFieldType(type: string, components?: unknown[]): FieldTypeMapping;
  getCompatibleFieldTypes(type: string): string[];
  generateDefaultField(type: string): unknown;
  getTypeMappingInfo(): TypeMappingInfo[];
  getRuntimeFieldBinding?(fieldType: string): RuntimeFieldBinding | null;
}

export interface QueryCapability extends RuntimeCapability {
  queryViewFunction(address: string, functionId: string, args: unknown[]): Promise<unknown>;
  formatFunctionResult(
    result: unknown,
    schema: ContractSchema,
    functionId: string
  ): FormattedResult;
  getCurrentBlock(): Promise<number | bigint>;
}

// =============================================================================
// Tier 3: Runtime / Stateful (wallet, execution, network services)
// =============================================================================

export interface ExecutionCapability extends RuntimeCapability {
  formatTransactionData(address: string, functionId: string, args: unknown[]): Promise<unknown>;
  signAndBroadcast(txData: unknown): Promise<TransactionResult>;
  waitForTransactionConfirmation?(txHash: string): Promise<TransactionReceipt>;
  getSupportedExecutionMethods(): ExecutionMethodDetail[];
  validateExecutionConfig(config: unknown): boolean;
}

export interface WalletCapability extends RuntimeCapability {
  supportsWalletConnection(): boolean;
  getAvailableConnectors(): Connector[];
  connectWallet(connectorId: string): Promise<void>;
  disconnectWallet(): Promise<void>;
  getWalletConnectionStatus(): WalletConnectionStatus;
  onWalletConnectionChange?(callback: (status: WalletConnectionStatus) => void): () => void;
  getExportableWalletConfigFiles?(): Record<string, string>;
}

export interface UiKitCapability extends RuntimeCapability {
  getAvailableUiKits(): UiKitInfo[];
  configureUiKit?(kitId: string, config: unknown): void;
  getEcosystemReactUiContextProvider?(): React.ComponentType<{ children: React.ReactNode }>;
  getEcosystemReactHooks?(): Record<string, (...args: unknown[]) => unknown>;
  getEcosystemWalletComponents?(): WalletComponents;
  getRelayerOptionsComponent?(): React.ComponentType<unknown> | null;
}

export interface RelayerCapability extends RuntimeCapability {
  getRelayers(): Promise<RelayerInfo[]>;
  getRelayer(id: string): Promise<RelayerInfo | null>;
  getNetworkServiceForms(): NetworkServiceForm[];
  getDefaultServiceConfig(): Record<string, unknown>;
  validateNetworkServiceConfig?(config: unknown): boolean;
  testNetworkServiceConnection?(config: unknown): Promise<boolean>;
  validateRpcEndpoint?(url: string): boolean;
  testRpcConnection?(url: string): Promise<boolean>;
  validateExplorerConfig?(config: unknown): boolean;
  testExplorerConnection?(config: unknown): Promise<boolean>;
}

/**
 * AccessControlCapability is a direct promotion of the existing
 * AccessControlService interface (19 methods + 20 supporting types + 5 error
 * classes). See @openzeppelin/ui-types/adapters/access-control.ts for the
 * full interface definition.
 *
 * The capability IS the service — no wrapper, no reduction.
 */
export interface AccessControlCapability extends RuntimeCapability {
  getRoles(contractAddress: string): Promise<AccessControlRole[]>;
  getOwner(contractAddress: string): Promise<string | null>;
  getAdmins(contractAddress: string): Promise<string[]>;
  grantRole(contractAddress: string, role: string, account: string): Promise<TransactionResult>;
  revokeRole(contractAddress: string, role: string, account: string): Promise<TransactionResult>;
  renounceRole(contractAddress: string, role: string, account: string): Promise<TransactionResult>;
  hasRole(contractAddress: string, role: string, account: string): Promise<boolean>;
}

// =============================================================================
// Profile Types
// =============================================================================

export type ProfileName = 'declarative' | 'viewer' | 'transactor' | 'composer' | 'operator';

// =============================================================================
// Runtime & Export
// =============================================================================

export interface EcosystemRuntime {
  readonly networkConfig: NetworkConfig;

  // Tier 1 (always present)
  readonly addressing: AddressingCapability;
  readonly explorer: ExplorerCapability;
  readonly networkCatalog: NetworkCatalogCapability;
  readonly uiLabels: UiLabelsCapability;

  // Tier 2 (profile-dependent)
  readonly contractLoading?: ContractLoadingCapability;
  readonly schema?: SchemaCapability;
  readonly typeMapping?: TypeMappingCapability;
  readonly query?: QueryCapability;

  // Tier 3 (profile-dependent)
  readonly execution?: ExecutionCapability;
  readonly wallet?: WalletCapability;
  readonly uiKit?: UiKitCapability;
  readonly relayer?: RelayerCapability;
  readonly accessControl?: AccessControlCapability;

  dispose(): void;
}

export interface CapabilityFactoryMap {
  addressing?: (config: NetworkConfig) => AddressingCapability;
  explorer?: (config: NetworkConfig) => ExplorerCapability;
  networkCatalog?: () => NetworkCatalogCapability;
  uiLabels?: () => UiLabelsCapability;
  contractLoading?: (config: NetworkConfig) => ContractLoadingCapability;
  schema?: (config: NetworkConfig) => SchemaCapability;
  typeMapping?: (config: NetworkConfig) => TypeMappingCapability;
  query?: (config: NetworkConfig) => QueryCapability;
  execution?: (config: NetworkConfig) => ExecutionCapability;
  wallet?: (config: NetworkConfig) => WalletCapability;
  uiKit?: (config: NetworkConfig) => UiKitCapability;
  relayer?: (config: NetworkConfig) => RelayerCapability;
  accessControl?: (config: NetworkConfig) => AccessControlCapability;
}

/**
 * Updated EcosystemExport — replaces createAdapter with capability-based API.
 * Extends EcosystemMetadata for backward-compatible metadata (id, name, icon).
 */
export interface EcosystemExport extends EcosystemMetadata {
  networks: NetworkConfig[];
  capabilities: CapabilityFactoryMap;
  createRuntime: (profile: ProfileName, config: NetworkConfig) => EcosystemRuntime;
  adapterConfig?: AdapterConfig;
}

// =============================================================================
// Errors
// =============================================================================

/**
 * Thrown when accessing a capability or method on a disposed runtime.
 */
export class RuntimeDisposedError extends Error {
  constructor(capabilityName?: string) {
    super(
      capabilityName
        ? `Cannot access ${capabilityName}: runtime has been disposed`
        : 'Runtime has been disposed'
    );
    this.name = 'RuntimeDisposedError';
  }
}

/**
 * Thrown when createRuntime requests a profile that requires capabilities
 * the adapter does not implement.
 */
export class UnsupportedProfileError extends Error {
  constructor(profile: ProfileName, missingCapabilities: string[]) {
    super(
      `Adapter does not support profile "${profile}": missing capabilities [${missingCapabilities.join(', ')}]`
    );
    this.name = 'UnsupportedProfileError';
  }
}

// =============================================================================
// Placeholder types referenced above (actual definitions in @openzeppelin/ui-types)
// =============================================================================

type ContractSchema = unknown;
type ContractDefinitionInput = unknown;
type ArtifactPersistencePolicy = unknown;
type FunctionSchema = unknown;
type FunctionDecoration = unknown;
type FieldTypeMapping = unknown;
type TypeMappingInfo = unknown;
type RuntimeFieldBinding = unknown;
type FormattedResult = unknown;
type TransactionResult = unknown;
type TransactionReceipt = unknown;
type ExecutionMethodDetail = unknown;
type Connector = unknown;
type WalletConnectionStatus = unknown;
type UiKitInfo = unknown;
type WalletComponents = unknown;
type RelayerInfo = unknown;
type NetworkServiceForm = unknown;
type EcosystemMetadata = unknown;
type AdapterConfig = unknown;
