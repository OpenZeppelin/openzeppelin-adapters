import { VERSION as UI_TYPES_V } from '@openzeppelin/ui-types';
import type { EcosystemExport, SolanaNetworkConfig } from '@openzeppelin/ui-types';
import { VERSION as UI_UTILS_V, validatePeerVersions } from '@openzeppelin/ui-utils';

import { SolanaAdapter } from './adapter';
import { solanaAdapterConfig } from './config';
import { ecosystemMetadata } from './metadata';
import { solanaNetworks } from './networks';

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

export const ecosystemDefinition: EcosystemExport = {
  ...ecosystemMetadata,
  networks: solanaNetworks,
  createAdapter: (config) => new SolanaAdapter(config as SolanaNetworkConfig),
  adapterConfig: solanaAdapterConfig,
};

// Adapter-specific types
export type { SolanaContractArtifacts } from './types/artifacts';
export { isSolanaContractArtifacts } from './types/artifacts';

// Individual network exports
export { solanaMainnetBeta, solanaDevnet, solanaTestnet } from './networks';
