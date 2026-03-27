/**
 * @openzeppelin/adapter-polkadot
 *
 * Polkadot adapter for the UI Builder, supporting EVM-compatible networks
 * in the Polkadot ecosystem (Polkadot Hub, Kusama Hub, Moonbeam, Moonriver).
 *
 * @packageDocumentation
 */

import { VERSION as UI_TYPES_V } from '@openzeppelin/ui-types';
import type { EcosystemExport } from '@openzeppelin/ui-types';
import { VERSION as UI_UTILS_V, validatePeerVersions } from '@openzeppelin/ui-utils';

import { PolkadotAdapter } from './adapter';
import { polkadotAdapterConfig } from './config';
import { ecosystemMetadata } from './metadata';
import { polkadotNetworks } from './networks';

declare const __OZ_PEER_MINIMUMS__: Record<string, string>;

validatePeerVersions('@openzeppelin/adapter-polkadot', {
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
export { PolkadotAdapter } from './adapter';

export const ecosystemDefinition: EcosystemExport = {
  ...ecosystemMetadata,
  networks: polkadotNetworks,
  createAdapter: (config) => new PolkadotAdapter(config),
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
