import type { AccessControlCapability, StellarNetworkConfig } from '@openzeppelin/ui-types';

import { createStellarAccessControlService } from '../access-control/service';
import { asStellarNetworkConfig } from './helpers';

export function createAccessControl(config: StellarNetworkConfig): AccessControlCapability {
  const networkConfig = asStellarNetworkConfig(config);
  const service = createStellarAccessControlService(networkConfig);

  return Object.assign(service, {
    networkConfig,
    dispose() {},
  }) as AccessControlCapability;
}
