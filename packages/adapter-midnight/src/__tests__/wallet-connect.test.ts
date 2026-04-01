import { beforeEach, describe, expect, it, vi } from 'vitest';

import { midnightTestnet } from '../networks/testnet';
import { createRuntime } from '../profiles/shared-state';
import * as connection from '../wallet/connection';

vi.mock('../wallet/connection', () => {
  const supportsMidnightWalletConnection = vi.fn().mockReturnValue(true);
  const getMidnightAvailableConnectors = vi
    .fn()
    .mockResolvedValue([{ id: 'mnLace', name: 'Lace (Midnight)' }]);
  const disconnectMidnightWallet = vi.fn().mockResolvedValue({ disconnected: true });
  const getMidnightWalletConnectionStatus = vi
    .fn()
    .mockReturnValue({ isConnected: true, address: 'ct1qtestaddress', status: 'connected' });

  return {
    supportsMidnightWalletConnection,
    getMidnightAvailableConnectors,
    disconnectMidnightWallet,
    getMidnightWalletConnectionStatus,
  };
});

describe('Midnight wallet capability (composer runtime)', () => {
  const networkConfig = midnightTestnet;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('supports wallet connection when Lace is available', () => {
    const runtime = createRuntime('composer', networkConfig);
    try {
      expect(runtime.wallet!.supportsWalletConnection()).toBe(true);
    } finally {
      runtime.dispose();
    }
  });

  it('returns available connectors (Lace)', async () => {
    const runtime = createRuntime('composer', networkConfig);
    try {
      const connectors = await runtime.wallet!.getAvailableConnectors();
      expect(Array.isArray(connectors)).toBe(true);
      expect(connectors[0]).toEqual({ id: 'mnLace', name: 'Lace (Midnight)' });
    } finally {
      runtime.dispose();
    }
  });

  it('connectWallet is not supported (use ConnectButton path)', async () => {
    const runtime = createRuntime('composer', networkConfig);
    try {
      const result = await runtime.wallet!.connectWallet('mnLace');
      expect(result.connected).toBe(false);
      expect(result.error).toBeDefined();
    } finally {
      runtime.dispose();
    }
  });

  it('disconnects wallet via connection facade', async () => {
    const runtime = createRuntime('composer', networkConfig);
    try {
      const res = await runtime.wallet!.disconnectWallet();
      expect(res.disconnected).toBe(true);
      expect(vi.mocked(connection.disconnectMidnightWallet)).toHaveBeenCalledTimes(1);
    } finally {
      runtime.dispose();
    }
  });

  it('maps wallet connection status and injects chainId', () => {
    const runtime = createRuntime('composer', networkConfig);
    try {
      const status = runtime.wallet!.getWalletConnectionStatus();
      expect(status.isConnected).toBe(true);
      expect(status.address).toBe('ct1qtestaddress');
      expect(status.chainId).toBe(networkConfig.id);
    } finally {
      runtime.dispose();
    }
  });

  it('exposes provider root, hooks facade, and wallet components via uiKit', () => {
    const runtime = createRuntime('composer', networkConfig);
    try {
      const uiKit = runtime.uiKit!;
      const Provider = uiKit.getEcosystemReactUiContextProvider!();
      const hooks = uiKit.getEcosystemReactHooks!();
      const components = uiKit.getEcosystemWalletComponents!();

      expect(typeof Provider).toBe('function');
      expect(hooks).toBeDefined();
      const typedHooks = hooks as { useAccount?: unknown } | undefined;
      expect(typeof (typedHooks?.useAccount as unknown as () => unknown)).toBe('function');
      expect(components).toBeDefined();
      const typedComponents = components as
        | { ConnectButton?: unknown; AccountDisplay?: unknown }
        | undefined;
      expect(typeof (typedComponents?.ConnectButton as unknown as () => unknown)).toBe('function');
      expect(typeof (typedComponents?.AccountDisplay as unknown as () => unknown)).toBe('function');
    } finally {
      runtime.dispose();
    }
  });
});
