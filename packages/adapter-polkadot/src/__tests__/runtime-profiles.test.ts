import { describe, expect, it } from 'vitest';

import { UnsupportedProfileError } from '@openzeppelin/ui-types';

import { polkadotHubTestnet } from '../networks';
import { createRuntime } from '../profiles/shared-state';
import type { TypedPolkadotNetworkConfig } from '../types';

describe('createRuntime profile matrix', () => {
  it('rejects non-EVM execution with UnsupportedProfileError', () => {
    const substrateConfig = {
      ...polkadotHubTestnet,
      executionType: 'substrate',
    } as unknown as TypedPolkadotNetworkConfig;

    expect(() => createRuntime('declarative', substrateConfig)).toThrow(UnsupportedProfileError);
  });

  it('constructs declarative runtime for EVM Polkadot networks', () => {
    const runtime = createRuntime('declarative', polkadotHubTestnet);
    expect(runtime.addressing).toBeDefined();
    runtime.dispose();
  });
});
