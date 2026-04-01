import type { MidnightNetworkConfig } from '@openzeppelin/ui-types';

import type { MidnightContractArtifacts } from '../types';

export interface MidnightArtifactContext {
  getArtifacts(): MidnightContractArtifacts | null;
  setArtifacts(artifacts: MidnightContractArtifacts | null): void;
}

export function createMidnightArtifactContext(): MidnightArtifactContext {
  let artifacts: MidnightContractArtifacts | null = null;
  return {
    getArtifacts() {
      return artifacts;
    },
    setArtifacts(next) {
      artifacts = next;
    },
  };
}

const sharedByNetworkConfig = new WeakMap<MidnightNetworkConfig, MidnightArtifactContext>();

/**
 * One artifact bag per `MidnightNetworkConfig` object identity so contract-loading, query,
 * execution, schema, and type-mapping stay aligned for the same network selection.
 */
export function getSharedMidnightArtifactContext(
  config: MidnightNetworkConfig
): MidnightArtifactContext {
  let ctx = sharedByNetworkConfig.get(config);
  if (!ctx) {
    ctx = createMidnightArtifactContext();
    sharedByNetworkConfig.set(config, ctx);
  }
  return ctx;
}
