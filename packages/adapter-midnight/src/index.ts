/**
 * Midnight Adapter Entry Point
 *
 * Browser Compatibility:
 *
 * This ensures Midnight-specific browser shims are only loaded when the user
 * selects the Midnight ecosystem, keeping other adapters lightweight.
 */

// Initialize browser environment (Buffer + CommonJS polyfills) as soon as adapter is imported
import './browser-init';

import { VERSION as UI_COMPONENTS_V } from '@openzeppelin/ui-components';
import { VERSION as UI_REACT_V } from '@openzeppelin/ui-react';
import { VERSION as UI_TYPES_V } from '@openzeppelin/ui-types';
import type { EcosystemExport, MidnightNetworkConfig } from '@openzeppelin/ui-types';
import { VERSION as UI_UTILS_V, validatePeerVersions } from '@openzeppelin/ui-utils';

import { MidnightAdapter } from './adapter';
import { midnightAdapterConfig } from './config';
import { ecosystemMetadata } from './metadata';
import { midnightNetworks } from './networks';

declare const __OZ_PEER_MINIMUMS__: Record<string, string>;

validatePeerVersions('@openzeppelin/adapter-midnight', {
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

export const ecosystemDefinition: EcosystemExport = {
  ...ecosystemMetadata,
  networks: midnightNetworks,
  createAdapter: (config) => new MidnightAdapter(config as MidnightNetworkConfig),
  adapterConfig: midnightAdapterConfig,
};

export * from './adapter';
export { default } from './adapter';

// Adapter-specific types
export type { MidnightContractArtifacts } from './types';
export { isMidnightContractArtifacts } from './types';

// Individual network exports
export { midnightTestnet } from './networks';
