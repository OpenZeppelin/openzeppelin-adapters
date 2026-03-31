import type { AccessControlCapability, StellarNetworkConfig } from '@openzeppelin/ui-types';

import { createStellarAccessControlService } from '../access-control/service';
import { asStellarNetworkConfig, guardRuntimeCapability } from './helpers';

export function createAccessControl(config: StellarNetworkConfig): AccessControlCapability {
  const networkConfig = asStellarNetworkConfig(config);
  const service = createStellarAccessControlService(networkConfig);

  return guardRuntimeCapability(
    service,
    networkConfig,
    'accessControl',
    () => service.dispose(),
    'subscription'
  ) as AccessControlCapability;
}
