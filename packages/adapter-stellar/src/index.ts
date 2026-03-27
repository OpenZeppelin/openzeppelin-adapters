import { VERSION as UI_COMPONENTS_V } from '@openzeppelin/ui-components';
import { VERSION as UI_TYPES_V } from '@openzeppelin/ui-types';
import type { EcosystemExport, StellarNetworkConfig } from '@openzeppelin/ui-types';
import { VERSION as UI_UTILS_V, validatePeerVersions } from '@openzeppelin/ui-utils';

import { StellarAdapter } from './adapter';
import { stellarAdapterConfig } from './config';
import { ecosystemMetadata } from './metadata';
import { stellarNetworks } from './networks';

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
export { StellarAdapter } from './adapter';

export const ecosystemDefinition: EcosystemExport = {
  ...ecosystemMetadata,
  networks: stellarNetworks,
  createAdapter: (config) => new StellarAdapter(config as StellarNetworkConfig),
  adapterConfig: stellarAdapterConfig,
};

// Adapter-specific types
export type { StellarContractArtifacts } from './types/artifacts';
export { isStellarContractArtifacts } from './types/artifacts';

// Individual network exports
export { stellarPublic, stellarTestnet } from './networks';
