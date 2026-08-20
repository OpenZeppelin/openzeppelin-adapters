import { mainnet } from 'viem/chains';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * WalletConnect support was removed because its provider pulls in @reown/appkit,
 * which moved to the Reown Community License at 1.8.3.
 *
 * RainbowKit cannot be made WalletConnect-free by omission: its default wallet list
 * is largely WalletConnect-backed, and `getDefaultConfig` types `projectId` as
 * required. The adapter therefore pins the wallet list explicitly.
 *
 * RainbowKit cannot be imported under vitest here (it pulls porto -> zod/mini,
 * which fails to resolve), so it is mocked. These assertions cover the part we
 * control: what the adapter hands to getDefaultConfig.
 */
const getDefaultConfig = vi.fn((_options: Record<string, unknown>) => ({ connectors: [] }));
const injectedWallet = vi.fn();
const safeWallet = vi.fn();

vi.mock('@rainbow-me/rainbowkit', () => ({ getDefaultConfig }));
vi.mock('@rainbow-me/rainbowkit/wallets', () => ({ injectedWallet, safeWallet }));

describe('RainbowKit wagmi config excludes WalletConnect', () => {
  beforeEach(() => {
    getDefaultConfig.mockClear();
  });

  async function build(wagmiParams: Record<string, unknown>) {
    const { createRainbowKitWagmiConfig } = await import('../config-service');
    return createRainbowKitWagmiConfig(
      { wagmiParams },
      [mainnet],
      { [mainnet.id]: 'ethereum-mainnet' },
      () => undefined
    );
  }

  it('pins the wallet list to connectors that do not use WalletConnect', async () => {
    await build({ appName: 'Test App' });

    expect(getDefaultConfig).toHaveBeenCalledTimes(1);
    const options = getDefaultConfig.mock.calls[0]![0] as unknown as {
      wallets: { groupName: string; wallets: unknown[] }[];
    };

    const wallets = options.wallets.flatMap((group) => group.wallets);
    expect(wallets).toEqual([injectedWallet, safeWallet]);
  });

  it('no longer requires the caller to supply a projectId', async () => {
    // This previously returned null and logged a warning when projectId was absent.
    const config = await build({ appName: 'No Project Id' });

    expect(config).not.toBeNull();
    expect(getDefaultConfig).toHaveBeenCalledTimes(1);
  });

  it('still lets a caller override the wallet list', async () => {
    const custom = [{ groupName: 'Custom', wallets: [injectedWallet] }];
    await build({ appName: 'Custom Wallets', wallets: custom });

    const options = getDefaultConfig.mock.calls[0]![0] as unknown as { wallets: unknown };
    expect(options.wallets).toBe(custom);
  });
});
