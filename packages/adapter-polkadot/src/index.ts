/**
 * @openzeppelin/adapter-polkadot
 *
 * Polkadot adapter for the UI Builder, supporting EVM-compatible networks
 * in the Polkadot ecosystem (Polkadot Hub, Kusama Hub, Moonbeam, Moonriver).
 *
 * @packageDocumentation
 */

import { VERSION as UI_COMPONENTS_V } from '@openzeppelin/ui-components';
import { VERSION as UI_REACT_V } from '@openzeppelin/ui-react';
import { VERSION as UI_TYPES_V } from '@openzeppelin/ui-types';
import type {
  CapabilityFactoryMap,
  EcosystemExport,
  NetworkConfig,
  ProfileName,
} from '@openzeppelin/ui-types';
import { VERSION as UI_UTILS_V, validatePeerVersions } from '@openzeppelin/ui-utils';

import { asTypedPolkadotNetworkConfig } from './capabilities/helpers';

import { polkadotAdapterConfig } from './config';
import { ecosystemMetadata } from './metadata';
import { polkadotNetworks } from './networks';
import { capabilityFactories, createRuntime } from './profiles';

declare const __OZ_PEER_MINIMUMS__: Record<string, string>;

validatePeerVersions('@openzeppelin/adapter-polkadot', {
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
  networks: polkadotNetworks,
  capabilities,
  createRuntime: (profile: ProfileName, config: NetworkConfig, options) =>
    createRuntime(profile, asTypedPolkadotNetworkConfig(config), options),
  adapterConfig: polkadotAdapterConfig,
};

// Types
export type {
  PolkadotExecutionType,
  PolkadotNetworkCategory,
  PolkadotRelayChain,
  TypedPolkadotNetworkConfig,
} from './types';

// Individual Hub networks (P1 - MVP)
export { polkadotHubMainnet, polkadotHubTestnet } from './networks';

// Individual Parachain networks (P2)
export { moonbeamMainnet, moonriverMainnet, moonbaseAlphaTestnet } from './networks';

// Custom Hub chain definitions
export { polkadotHub, polkadotHubTestNet } from './networks/chains';

// Parachain viem chains (re-exported from viem/chains)
export { moonbeam, moonriver, moonbaseAlpha } from './networks';

// Wallet components
export { PolkadotWalletUiRoot, polkadotChains, type PolkadotWalletUiRootProps } from './wallet';
