import { mainnet } from 'viem/chains';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { appConfigService, userNetworkServiceConfigService } from '@openzeppelin/ui-utils';

import { baseMainnet, ethereumMainnet } from '../networks';
import { resolveMainnetRpcUrl } from '../profiles/shared';

/**
 * F2 (Principle II) — the dedicated mainnet ENS L1 client must resolve its RPC endpoint through the
 * SAME user → app-config-override → default precedence the package uses for every other RPC, keyed on
 * the ETHEREUM MAINNET network (never the bound L2), with viem's public default only as last resort.
 * No secret is hardcoded, and a configured L1 override is honored on the L2-bound cross-chain path.
 */
describe('resolveMainnetRpcUrl — mainnet-keyed override precedence (F2)', () => {
  const VIEM_PUBLIC_DEFAULT = mainnet.rpcUrls.default.http[0];
  const KEYED_MAINNET_RPC = 'https://eth-mainnet.example/v2/SECRET_KEY';
  const APP_OVERRIDE_RPC = 'https://mainnet-override.example/rpc';

  beforeEach(() => {
    // Neutral defaults: no user config, no app override → every lookup falls through to the default.
    vi.spyOn(userNetworkServiceConfigService, 'get').mockReturnValue(null);
    vi.spyOn(appConfigService, 'getRpcEndpointOverride').mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('honors a user-configured mainnet RPC on an L2-bound path (highest precedence)', () => {
    vi.spyOn(userNetworkServiceConfigService, 'get').mockImplementation((networkId, serviceId) =>
      networkId === ethereumMainnet.id && serviceId === 'rpc' ? { rpcUrl: KEYED_MAINNET_RPC } : null
    );

    expect(resolveMainnetRpcUrl(baseMainnet)).toBe(KEYED_MAINNET_RPC);
  });

  it('honors an app-config mainnet override when no user config is set', () => {
    vi.spyOn(appConfigService, 'getRpcEndpointOverride').mockImplementation((networkId) =>
      networkId === ethereumMainnet.id ? APP_OVERRIDE_RPC : undefined
    );

    expect(resolveMainnetRpcUrl(baseMainnet)).toBe(APP_OVERRIDE_RPC);
  });

  it('falls back to viem public default when neither user nor override is configured', () => {
    expect(resolveMainnetRpcUrl(baseMainnet)).toBe(VIEM_PUBLIC_DEFAULT);
  });

  it('keys the override on mainnet, NOT the bound L2 — an L2 override is ignored', () => {
    // A user override exists for the bound L2 (base), but NOT for mainnet: the L1 client must ignore
    // the L2 override and fall through to the mainnet default, proving it never resolves the wrong chain.
    vi.spyOn(userNetworkServiceConfigService, 'get').mockImplementation((networkId, serviceId) =>
      networkId === baseMainnet.id && serviceId === 'rpc'
        ? { rpcUrl: 'https://base-l2.example/should-not-be-used' }
        : null
    );

    expect(resolveMainnetRpcUrl(baseMainnet)).toBe(VIEM_PUBLIC_DEFAULT);
  });

  it('when the bound network IS mainnet, honors its own configured endpoint directly', () => {
    vi.spyOn(userNetworkServiceConfigService, 'get').mockImplementation((networkId, serviceId) =>
      networkId === ethereumMainnet.id && serviceId === 'rpc' ? { rpcUrl: KEYED_MAINNET_RPC } : null
    );

    expect(resolveMainnetRpcUrl(ethereumMainnet)).toBe(KEYED_MAINNET_RPC);
  });
});
