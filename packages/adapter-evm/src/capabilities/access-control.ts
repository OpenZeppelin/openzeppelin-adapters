import type { TypedEvmNetworkConfig } from '@openzeppelin/adapter-evm-core';
import {
  createAccessControl as createCoreAccessControl,
  type CreateAccessControlOptions,
} from '@openzeppelin/adapter-evm-core/access-control';

export function createAccessControl(
  config: TypedEvmNetworkConfig,
  options: CreateAccessControlOptions
) {
  return createCoreAccessControl(config, options);
}
