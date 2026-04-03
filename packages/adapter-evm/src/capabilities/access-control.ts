import {
  createAccessControl as createCoreAccessControl,
  type CreateAccessControlOptions,
  type TypedEvmNetworkConfig,
} from '@openzeppelin/adapter-evm-core';

export function createAccessControl(
  config: TypedEvmNetworkConfig,
  options: CreateAccessControlOptions
) {
  return createCoreAccessControl(config, options);
}
