import { VERSION as UI_TYPES_V } from '@openzeppelin/ui-types';
import type {
  CapabilityFactoryMap,
  EcosystemExport,
  NetworkConfig,
  ProfileName,
} from '@openzeppelin/ui-types';
import { VERSION as UI_UTILS_V, validatePeerVersions } from '@openzeppelin/ui-utils';

import { asSolanaNetworkConfig } from './capabilities/helpers';

import { solanaAdapterConfig } from './config';
import { ecosystemMetadata } from './metadata';
import { solanaNetworks } from './networks';
import { capabilityFactories, createRuntime } from './profiles';

declare const __OZ_PEER_MINIMUMS__: Record<string, string>;

validatePeerVersions('@openzeppelin/adapter-solana', {
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
  networks: solanaNetworks,
  capabilities,
  createRuntime: (profile: ProfileName, config: NetworkConfig, options) =>
    createRuntime(profile, asSolanaNetworkConfig(config), options),
  adapterConfig: solanaAdapterConfig,
};

export type { SolanaContractArtifacts } from './types/artifacts';
export { isSolanaContractArtifacts } from './types/artifacts';

export { solanaMainnetBeta, solanaDevnet, solanaTestnet } from './networks';
