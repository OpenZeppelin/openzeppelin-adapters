import type { TypedEvmNetworkConfig } from '@openzeppelin/adapter-evm-core';
import { VERSION as UI_COMPONENTS_V } from '@openzeppelin/ui-components';
import { VERSION as UI_REACT_V } from '@openzeppelin/ui-react';
import { VERSION as UI_TYPES_V } from '@openzeppelin/ui-types';
import type { CapabilityFactoryMap, EcosystemExport } from '@openzeppelin/ui-types';
import { VERSION as UI_UTILS_V, validatePeerVersions } from '@openzeppelin/ui-utils';

import { evmAdapterConfig } from './config';
import { ecosystemMetadata } from './metadata';
import { evmNetworks } from './networks';
import { capabilityFactories, createRuntime } from './profiles';

declare const __OZ_PEER_MINIMUMS__: Record<string, string>;

validatePeerVersions('@openzeppelin/adapter-evm', {
  '@openzeppelin/ui-components': {
    installed: UI_COMPONENTS_V,
    minimum: __OZ_PEER_MINIMUMS__['@openzeppelin/ui-components'],
  },
  '@openzeppelin/ui-react': {
    installed: UI_REACT_V,
    minimum: __OZ_PEER_MINIMUMS__['@openzeppelin/ui-react'],
  },
  '@openzeppelin/ui-types': {
    installed: UI_TYPES_V,
    minimum: __OZ_PEER_MINIMUMS__['@openzeppelin/ui-types'],
  },
  '@openzeppelin/ui-utils': {
    installed: UI_UTILS_V,
    minimum: __OZ_PEER_MINIMUMS__['@openzeppelin/ui-utils'],
  },
});

export { ecosystemMetadata } from './metadata';
export * from './capabilities';
export * from './profiles';

export const capabilities: CapabilityFactoryMap = capabilityFactories;

export const ecosystemDefinition: EcosystemExport = {
  ...ecosystemMetadata,
  networks: evmNetworks,
  capabilities,
  createRuntime: (profile, config, options) =>
    createRuntime(profile, config as TypedEvmNetworkConfig, options),
  adapterConfig: evmAdapterConfig,
};

// RainbowKit customization types (re-exported from core via rainbowkit/index.ts)
export type {
  AppInfo,
  RainbowKitConnectButtonProps,
  RainbowKitProviderProps,
  RainbowKitKitConfig,
  RainbowKitCustomizations,
} from './wallet/rainbowkit';
export { isRainbowKitCustomizations, extractRainbowKitCustomizations } from './wallet/rainbowkit';

// Individual network exports (useful for specific references)
export {
  ethereumMainnet,
  arbitrumMainnet,
  polygonMainnet,
  polygonZkEvmMainnet,
  baseMainnet,
  bscMainnet,
  optimismMainnet,
  avalancheMainnet,
  lineaMainnet,
  scrollMainnet,
  zkSyncEraMainnet,
  ethereumSepolia,
  arbitrumSepolia,
  polygonAmoy,
  polygonZkEvmCardona,
  baseSepolia,
  bscTestnet,
  optimismSepolia,
  avalancheFuji,
  lineaSepolia,
  scrollSepolia,
  zksyncSepoliaTestnet,
} from './networks';

// Core types for public API compatibility
export type {
  TypedEvmNetworkConfig,
  WriteContractParameters,
  EvmContractArtifacts,
} from '@openzeppelin/adapter-evm-core';
export { isEvmContractArtifacts, abiComparisonService } from '@openzeppelin/adapter-evm-core';

export type { EvmRelayerTransactionOptions } from '@openzeppelin/adapter-evm-core';
