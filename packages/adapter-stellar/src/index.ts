import { VERSION as UI_COMPONENTS_V } from '@openzeppelin/ui-components';
import { VERSION as UI_TYPES_V } from '@openzeppelin/ui-types';
import type {
  CapabilityFactoryMap,
  EcosystemExport,
  StellarNetworkConfig,
} from '@openzeppelin/ui-types';
import { VERSION as UI_UTILS_V, validatePeerVersions } from '@openzeppelin/ui-utils';

import { stellarAdapterConfig } from './config';
import { ecosystemMetadata } from './metadata';
import { stellarNetworks } from './networks';
import { capabilityFactories, createRuntime } from './profiles';

declare const __OZ_PEER_MINIMUMS__: Record<string, string>;

validatePeerVersions('@openzeppelin/adapter-stellar', {
  '@openzeppelin/ui-components': {
    installed: UI_COMPONENTS_V,
    minimum: __OZ_PEER_MINIMUMS__['@openzeppelin/ui-components'],
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
  networks: stellarNetworks,
  capabilities,
  createRuntime: (profile, config, options) =>
    createRuntime(profile, config as StellarNetworkConfig, options),
  adapterConfig: stellarAdapterConfig,
};

// Adapter-specific types
export type { StellarContractArtifacts } from './types/artifacts';
export { isStellarContractArtifacts } from './types/artifacts';

// Individual network exports
export { stellarPublic, stellarTestnet } from './networks';
