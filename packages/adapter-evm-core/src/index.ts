/**
 * @openzeppelin/adapter-evm-core
 *
 * Core EVM blockchain adapter functionality extracted from adapter-evm.
 * This package provides reusable, stateless modules for EVM-compatible adapters.
 *
 * @packageDocumentation
 */

// ============================================================================
// ABI Module - ABI loading, transformation, and comparison
// ============================================================================
export {
  // Transformation
  transformAbiToSchema,
  createAbiFunctionItem,
  // Loading
  loadEvmContract,
  loadAbiFromEtherscan,
  loadAbiFromEtherscanV1,
  loadAbiFromEtherscanV2,
  loadAbiFromSourcify,
  getSourcifyContractAppUrl,
  shouldUseV2Api,
  testEtherscanV2Connection,
  // Convenience wrappers
  loadContractSchema,
  loadContractWithFullMetadata,
  compareContractDefinitions,
  validateContractDefinition,
  hashContractDefinition,
  // Comparison
  AbiComparisonService,
  abiComparisonService,
  // Types
  type EvmContractLoadResult,
  type ContractLoadOptions,
  type EtherscanAbiResult,
  type SourcifyAbiResult,
  type AbiComparisonResult,
  type AbiDifference,
  type AbiValidationResult,
  isValidAbiArray,
  isValidAbiItem,
} from './abi';

// ============================================================================
// Mapping Module - Type mapping and form field generation
// ============================================================================
export {
  // Type mapping
  mapEvmParamTypeToFieldType,
  getEvmCompatibleFieldTypes,
  EVM_TYPE_TO_FIELD_TYPE,
  getEvmTypeMappingInfo,
  // Field generation
  generateEvmDefaultField,
} from './mapping';

// ============================================================================
// Transform Module - Input parsing and output formatting
// ============================================================================
export { parseEvmInput, formatEvmFunctionResult } from './transform';

// ============================================================================
// Query Module - View function querying
// ============================================================================
export { queryEvmViewFunction, isEvmViewFunction } from './query';

// ============================================================================
// Transaction Module - Transaction formatting, execution strategies, and sending
// ============================================================================
export {
  // Formatting
  formatEvmTransactionData,
  // Execution strategy interface
  type AdapterExecutionStrategy,
  // Execution strategies
  EoaExecutionStrategy,
  RelayerExecutionStrategy,
  type EvmRelayerTransactionOptions,
  // Transaction functions
  executeEvmTransaction,
  signAndBroadcastEvmTransaction,
  waitForEvmTransactionConfirmation,
  // Types
  type EvmWalletImplementation,
  type EvmWalletConnectionStatus,
  type EvmWalletConnectionResult,
  type EvmWalletDisconnectResult,
} from './transaction';

// ============================================================================
// Wallet Module - Wallet implementation and UI configuration utilities
// ============================================================================
export {
  // Wagmi provider context
  WagmiProviderInitializedContext,
  // Wagmi hooks
  useIsWagmiProviderInitialized,
  useManagedWagmiDisconnect,
  // Wagmi components
  SafeWagmiComponent,
  // Wallet UI components
  CustomConnectButton,
  ConnectorDialog,
  CustomAccountDisplay,
  CustomNetworkSwitcher,
  type ConnectButtonProps,
  // Core connection utilities
  connectAndEnsureCorrectNetworkCore,
  DEFAULT_DISCONNECTED_STATUS,
  // Wallet implementation
  WagmiWalletImplementation,
  type GetWagmiConfigForRainbowKitFn,
  // Wallet types
  type WagmiWalletConfig,
  type WagmiConfigChains,
  type WalletNetworkConfig,
  // RainbowKit utilities
  generateRainbowKitConfigFile,
  generateRainbowKitExportables,
  type RainbowKitConfigOptions,
  // RainbowKit types
  type AppInfo,
  type RainbowKitConnectButtonProps,
  type RainbowKitProviderProps,
  type RainbowKitKitConfig,
  type RainbowKitCustomizations,
  isRainbowKitCustomizations,
  extractRainbowKitCustomizations,
  // RainbowKit utility functions
  validateRainbowKitConfig,
  getRawUserNativeConfig,
  // RainbowKit component factories
  createRainbowKitConnectButton,
  createRainbowKitComponents,
  // RainbowKit config service
  createRainbowKitWagmiConfig,
  getWagmiConfigForRainbowKit,
  // UI Kit Manager factory
  createUiKitManager,
  type UiKitManagerState,
  type UiKitManagerDependencies,
  type UiKitManager,
  type RainbowKitAssetsResult,
  // RainbowKit Asset Manager
  ensureRainbowKitAssetsLoaded,
  // Configuration Resolution
  resolveAndInitializeKitConfig,
  resolveFullUiKitConfiguration,
  // Wallet component filtering utilities
  filterWalletComponents,
  getComponentExclusionsFromConfig,
} from './wallet';

// ============================================================================
// Configuration Module - RPC, Explorer, and Access Control Indexer configuration
// ============================================================================
export {
  // RPC
  buildRpcUrl,
  getUserRpcUrl,
  resolveRpcUrl,
  validateEvmRpcEndpoint,
  testEvmRpcConnection,
  getEvmCurrentBlock,
  // Explorer
  resolveExplorerConfig,
  resolveExplorerApiKeyFromAppConfig,
  getEvmExplorerAddressUrl,
  getEvmExplorerTxUrl,
  validateEvmExplorerConfig,
  testEvmExplorerConnection,
  // Access control indexer
  getUserAccessControlIndexerUrl,
  resolveAccessControlIndexerUrl,
  // Network service configuration
  validateEvmNetworkServiceConfig,
  testEvmNetworkServiceConnection,
} from './configuration';

// ============================================================================
// Proxy Module - Proxy detection and implementation resolution
// ============================================================================
export {
  detectProxyFromAbi,
  getImplementationAddress,
  getAdminAddress,
  type ProxyDetectionResult,
} from './proxy';

// ============================================================================
// Validation Module - Execution configuration validation
// ============================================================================
export {
  validateEoaConfig,
  validateEvmEoaConfig,
  validateRelayerConfig,
  validateEvmRelayerConfig,
  validateEvmExecutionConfig,
  isValidEvmAddress,
  type EvmWalletStatus,
} from './validation';

// ============================================================================
// Utils Module - Utility functions
// ============================================================================
export {
  // JSON utilities
  stringifyWithBigInt,
  // Formatting
  formatMethodName,
  formatInputName,
  // Gas utilities
  weiToGwei,
  gweiToWei,
  // Artifacts
  validateAndConvertEvmArtifacts,
  // Public client (needed by the adapter-evm registration layer to build the injected ENS client)
  createEvmPublicClient,
} from './utils';

// ============================================================================
// Access Control Module - Access control detection, reads, writes, and history
// ============================================================================
export {
  // Service
  createEvmAccessControlService,
  EvmAccessControlService,
  // Actions
  assembleAcceptAdminTransferAction,
  assembleAcceptOwnershipAction,
  assembleBeginAdminTransferAction,
  assembleCancelAdminTransferAction,
  assembleChangeAdminDelayAction,
  assembleGrantRoleAction,
  assembleRenounceOwnershipAction,
  assembleRenounceRoleAction,
  assembleRevokeRoleAction,
  assembleRollbackAdminDelayAction,
  assembleTransferOwnershipAction,
  // Feature Detection
  detectAccessControlCapabilities,
  validateAccessControlSupport,
  // Indexer Client
  createIndexerClient,
  EvmIndexerClient,
  // On-Chain Reader
  getAdmin,
  getCurrentBlock,
  readCurrentRoles,
  readOwnership,
  // Validation
  validateAddress,
  validateRoleId,
  validateRoleIds,
  // Constants
  DEFAULT_ADMIN_ROLE,
  DEFAULT_ADMIN_ROLE_LABEL,
  ZERO_ADDRESS,
  // Types
  type EvmAccessControlContext,
  type EvmTransactionExecutor,
} from './access-control';

// ============================================================================
// Types Module - TypeScript type definitions
// ============================================================================
export {
  // Contract artifacts
  type EvmContractArtifacts,
  isEvmContractArtifacts,
  // Provider types
  EvmProviderKeys,
  type EvmContractDefinitionProviderKey,
  EVM_PROVIDER_ORDER_DEFAULT,
  isEvmProviderKey,
  // Network and ABI types
  type EvmCompatibleNetworkConfig,
  type TypedEvmNetworkConfig,
  type AbiItem,
  type WriteContractParameters,
  // Result types
  type EvmAbiLoadResult,
  type EvmProxyInfo,
  type EvmTransactionData,
} from './types';

// ============================================================================
// Capability Module - capability factory builders
// ============================================================================
export {
  createAccessControl,
  type CreateAccessControlOptions,
  createAddressing,
  createContractLoading,
  createERC3643,
  type CreateERC3643Options,
  createERC4626,
  type CreateERC4626Options,
  createExecution,
  createExplorer,
  createIRS,
  type CreateIRSOptions,
  createNameResolution,
  type CreateNameResolutionOptions,
  createNetworkCatalog,
  createQuery,
  createRelayer,
  createSchema,
  createTypeMapping,
  createUiKit,
  createUiLabels,
  createWallet,
} from './capabilities';

// ============================================================================
// IRS / ONCHAINID Module - identity registry capability internals
// ============================================================================
export {
  buildClaimPayload,
  createEvmIRSService,
  EvmIRSService,
  getJurisdiction as getIrsJurisdiction,
  getOnchainId,
  isTrustedIssuer,
  isVerified as isIrsVerified,
  type EvmIRSAddresses,
  type EvmIRSExecutor,
  type EvmIRSServiceOptions,
} from './irs';

// ============================================================================
// ERC-3643 / T-REX Module - permissioned-token capability internals
// ============================================================================
export {
  createEvmErc3643Service,
  EvmErc3643Service,
  mapErc3643Error,
  type EvmErc3643Executor,
  type EvmErc3643ServiceOptions,
  type Erc3643ErrorContext,
} from './erc3643';

// ============================================================================
// ERC-4626 / Tokenized Vault Module - vault capability internals
// ============================================================================
export {
  createEvmErc4626Service,
  EvmErc4626Service,
  mapErc4626Error,
  type EvmErc4626Executor,
  type EvmErc4626ServiceOptions,
  type Erc4626ErrorContext,
  type Erc4626Operation,
} from './erc4626';

// ============================================================================
// Name Resolution Module - ENS native-error → typed-union mapping (SF-1)
// ============================================================================
export {
  mapNameResolutionError,
  nameNotFound,
  addressNotFound,
  unsupportedName,
  unsupportedNetwork,
  ELAPSED_UNMEASURED,
  type NameResolutionErrorContext,
  // SF-2 forward path: sync shape gate, provenance builder, and the forward service.
  isValidName,
  normalizeName,
  baseEnsProvenance,
  boundReverseProvenance,
  composeNetworkFallbackProvenance,
  MAINNET_NETWORK_ID,
  networkFallbackProvenanceFields,
  EvmNameResolutionService,
  createEvmNameResolutionService,
  type CreateEvmNameResolutionServiceOptions,
  // SF-5 ENS v2: the EnsProvenance extension type + guard + builders (exported for downstream
  // narrowing via `isEnsProvenance` — SC-005 — without pulling in the service).
  isEnsProvenance,
  buildEnsProvenance,
  deriveCoinType,
  scopedNetworkId,
  type EnsProvenance,
} from './name-resolution';

// ============================================================================
// Profile Module - runtime composition helpers
// ============================================================================
export {
  createComposerRuntime,
  createDeclarativeRuntime,
  createOperatorRuntime,
  createRuntime,
  createTransactorRuntime,
  createViewerRuntime,
} from './profiles';
