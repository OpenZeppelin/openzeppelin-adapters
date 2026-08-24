import { mainnet } from 'viem/chains';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The dedicated `metaMask()` wagmi connector was removed because it pulls in
 * `@metamask/sdk`, which ships a proprietary ConsenSys licence limited to
 * Non-Commercial Use and requires any derivative to carry that same restriction
 * forward. We publish under AGPL-3.0, which forbids conveying the work under added
 * restrictions, so the two cannot both be satisfied.
 *
 * These assertions cover what we control: the connector list handed to
 * `createConfig`. `@metamask/sdk` is a hard dependency of `@wagmi/connectors`, so
 * removing the connector is necessary but not sufficient -- the install-tree half is
 * enforced by the `.pnpmfile.cjs` hook and `scripts/check-dependency-licenses.cjs`.
 *
 * MetaMask's browser extension is still reachable via `injected()` plus EIP-6963
 * discovery; what is gone is MetaMask mobile deep-link / QR pairing.
 */
const injected = vi.fn(() => ({ id: 'injected' }));
const safe = vi.fn(() => ({ id: 'safe' }));
const metaMask = vi.fn(() => ({ id: 'metaMask' }));
const createConfig = vi.fn((options: Record<string, unknown>) => ({ ...options, _config: true }));

vi.mock('@wagmi/connectors', () => ({ injected, safe, metaMask }));
vi.mock('@wagmi/core', () => ({
  createConfig,
  connect: vi.fn(),
  disconnect: vi.fn(),
  getAccount: vi.fn(() => ({ address: undefined, isConnected: false })),
  getPublicClient: vi.fn(),
  getWalletClient: vi.fn(),
  switchChain: vi.fn(),
  watchAccount: vi.fn(() => () => undefined),
}));
vi.mock('@openzeppelin/ui-utils', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  appConfigService: { getRpcEndpointOverride: vi.fn(() => undefined) },
  getUserRpcUrl: vi.fn(() => undefined),
  subscribeToUserRpcConfigChanges: vi.fn(() => () => undefined),
}));

async function buildDefaultConfig() {
  const { WagmiWalletImplementation } = await import('../wagmi-implementation');

  const implementation = new WagmiWalletImplementation({
    chains: [mainnet],
    networkConfigs: [{ id: 'ethereum-mainnet', chainId: mainnet.id }],
    logSystem: 'test',
  } as never);

  return implementation.getConfig();
}

describe('default wagmi config excludes the MetaMask SDK connector', () => {
  beforeEach(() => {
    createConfig.mockClear();
    injected.mockClear();
    safe.mockClear();
    metaMask.mockClear();
  });

  it('builds the connector list from injected() and safe() only', async () => {
    await buildDefaultConfig();

    expect(createConfig).toHaveBeenCalled();
    const options = createConfig.mock.calls[0]![0] as { connectors: { id: string }[] };

    expect(options.connectors.map((connector) => connector.id)).toEqual(['injected', 'safe']);
  });

  it('never calls the metaMask() connector factory', async () => {
    await buildDefaultConfig();

    expect(metaMask).not.toHaveBeenCalled();
    expect(injected).toHaveBeenCalled();
    expect(safe).toHaveBeenCalled();
  });

  it('leaves EIP-6963 discovery enabled so the extension is still reachable', async () => {
    await buildDefaultConfig();

    const options = createConfig.mock.calls[0]![0] as {
      multiInjectedProviderDiscovery?: boolean;
    };

    // Absent means wagmi's default (true). Explicit false would hide the extension
    // and, with metaMask() gone, leave no route to MetaMask at all.
    expect(options.multiInjectedProviderDiscovery ?? true).toBe(true);
  });
});
