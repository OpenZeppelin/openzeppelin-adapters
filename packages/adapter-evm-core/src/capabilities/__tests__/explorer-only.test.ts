/**
 * SF-2 (#92) runtime contract of the explorer capability for explorer-only configs.
 *
 * Every `describe` names the invariant it verifies (03-invariants.md, INV-4…INV-12, INV-14).
 * The type-level half (INV-1…INV-3) lives in `types/__tests__/explorer-network-config.types.test.ts`.
 *
 * The two config services and the logger are mocked so each resolution path is selected
 * deterministically: (1) user override, (2) Etherscan-V2 global key, (3) app/identifier key,
 * (4) default.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  NetworkConfig,
  PolkadotNetworkConfig,
  StellarNetworkConfig,
} from '@openzeppelin/ui-types';
import { appConfigService, logger, userNetworkServiceConfigService } from '@openzeppelin/ui-utils';

import { resolveExplorerConfig } from '../../configuration/explorer';
import * as rpc from '../../configuration/rpc';
import type { EvmCompatibleNetworkConfig, EvmExplorerNetworkConfig } from '../../types/network';
import { createExplorer } from '../explorer';
import { asEvmExplorerNetworkConfig, asTypedEvmNetworkConfig } from '../helpers';

const mutators = vi.hoisted(() => ({
  save: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
  clear: vi.fn(),
}));

vi.mock('@openzeppelin/ui-utils', async () => {
  const actual =
    await vi.importActual<typeof import('@openzeppelin/ui-utils')>('@openzeppelin/ui-utils');
  return {
    ...actual,
    appConfigService: {
      getGlobalServiceConfig: vi.fn(),
      getExplorerApiKey: vi.fn(),
    },
    userNetworkServiceConfigService: {
      get: vi.fn(),
      // Mutators exist only so INV-10 can assert they are never called.
      ...mutators,
    },
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
});

vi.mock('../../configuration/rpc', async () => {
  const actual =
    await vi.importActual<typeof import('../../configuration/rpc')>('../../configuration/rpc');
  return {
    ...actual,
    resolveRpcUrl: vi.fn(actual.resolveRpcUrl),
    getUserRpcUrl: vi.fn(actual.getUserRpcUrl),
    buildRpcUrl: vi.fn(actual.buildRpcUrl),
    testEvmRpcConnection: vi.fn(actual.testEvmRpcConnection),
    getEvmCurrentBlock: vi.fn(actual.getEvmCurrentBlock),
  };
});

const mockGlobal = vi.mocked(appConfigService.getGlobalServiceConfig);
const mockExplorerKey = vi.mocked(appConfigService.getExplorerApiKey);
const mockUserGet = vi.mocked(userNetworkServiceConfigService.get);
const mockInfo = vi.mocked(logger.info);

const ADDR = '0xabCDeF0123456789AbcdEf0123456789aBCDEF01';
const TX = '0x5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060';
const EXPLORER_KEYS = [
  'id',
  'name',
  'ecosystem',
  'explorerUrl',
  'apiUrl',
  'primaryExplorerApiIdentifier',
  'supportsEtherscanV2',
] as const satisfies readonly (keyof EvmExplorerNetworkConfig)[];

const SENTINEL = {
  user: 'SENTINEL_KEY_USER_1f2e',
  v2: 'SENTINEL_KEY_V2_3d4c',
  global: 'SENTINEL_KEY_GLOBAL_5b6a',
  explorerKey: 'SENTINEL_KEY_EXPLORER_7988',
  rpc: 'SENTINEL_RPC_KEY_a0b1',
};

type Path = 'user' | 'v2' | 'app' | 'default';
const PATHS: readonly Path[] = ['user', 'v2', 'app', 'default'];

/** Full configs, one per resolution-relevant shape. */
const FULL: Record<'v2' | 'routescan' | 'plain', EvmCompatibleNetworkConfig<'evm'>> = {
  v2: fullConfig({
    id: 'ethereum-sepolia',
    name: 'Sepolia',
    explorerUrl: 'https://sepolia.etherscan.io',
    apiUrl: 'https://api.etherscan.io/v2/api',
    primaryExplorerApiIdentifier: 'etherscan-v2',
    supportsEtherscanV2: true,
  }),
  routescan: fullConfig({
    id: 'avalanche-fuji',
    name: 'Fuji',
    explorerUrl: 'https://testnet.snowtrace.io/',
    apiUrl: 'https://api.routescan.io/v2/network/testnet/evm/43113/etherscan/api',
    primaryExplorerApiIdentifier: 'routescan',
    supportsEtherscanV2: false,
  }),
  plain: fullConfig({
    id: 'zksync-era-sepolia',
    name: 'zkSync Era Sepolia',
    explorerUrl: 'https://sepolia.explorer.zksync.io',
  }),
};

function fullConfig(
  explorerFields: Omit<EvmExplorerNetworkConfig, 'ecosystem'>
): EvmCompatibleNetworkConfig<'evm'> {
  return {
    ecosystem: 'evm',
    network: 'test',
    type: 'testnet',
    isTestnet: true,
    exportConstName: 'testNetwork',
    chainId: 11155111,
    rpcUrl: `https://rpc.example.io/v2/${SENTINEL.rpc}`,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    ...explorerFields,
  };
}

/** The explorer-only projection P = pick(F, INV-1 keys); absent optional keys stay absent. */
function project(config: EvmCompatibleNetworkConfig<'evm'>): EvmExplorerNetworkConfig {
  const {
    id,
    name,
    ecosystem,
    explorerUrl,
    apiUrl,
    primaryExplorerApiIdentifier,
    supportsEtherscanV2,
  } = config;
  return {
    id,
    name,
    ecosystem,
    ...(explorerUrl !== undefined ? { explorerUrl } : {}),
    ...(apiUrl !== undefined ? { apiUrl } : {}),
    ...(primaryExplorerApiIdentifier !== undefined ? { primaryExplorerApiIdentifier } : {}),
    ...(supportsEtherscanV2 !== undefined ? { supportsEtherscanV2 } : {}),
  };
}

/** Selects resolution path `path` by arranging the mocked services. */
function arrange(path: Path, overrideUrl = 'https://user-explorer.example/'): void {
  mockUserGet.mockReturnValue(
    path === 'user' ? { explorerUrl: overrideUrl, apiKey: SENTINEL.user } : null
  );
  mockGlobal.mockImplementation((name) => {
    if (name === 'etherscanv2' && (path === 'v2' || path === 'user'))
      return { apiKey: SENTINEL.v2 };
    if (name !== 'etherscanv2' && path === 'app') return { apiKey: SENTINEL.global };
    return undefined;
  });
  mockExplorerKey.mockReturnValue(path === 'app' ? SENTINEL.explorerKey : undefined);
}

/** Calls a function the way untyped JS (or a cast) would, without an `as` in test code. */
function callUntyped<R>(fn: (...args: never[]) => R, arg: unknown): R {
  return Reflect.apply(fn, undefined, [arg]);
}

function deepFreeze<T extends object>(value: T): T {
  for (const v of Object.values(value)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(value);
}

beforeEach(() => {
  vi.clearAllMocks();
  arrange('default');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('INV-4: the explorer path reads only the seven declared keys', () => {
  function tracked<T extends object>(target: T): { proxy: T; keys: Set<PropertyKey> } {
    const keys = new Set<PropertyKey>();
    const proxy = new Proxy(target, {
      get(t, k, r) {
        keys.add(k);
        return Reflect.get(t, k, r);
      },
      has(t, k) {
        keys.add(k);
        return Reflect.has(t, k);
      },
      getOwnPropertyDescriptor(t, k) {
        keys.add(k);
        return Reflect.getOwnPropertyDescriptor(t, k);
      },
    });
    return { proxy, keys };
  }

  it.each(Object.keys(FULL) as (keyof typeof FULL)[])(
    'explorer-only %s config: all 4 paths × both links touch no key outside the seven',
    (shape) => {
      const { proxy, keys } = tracked(project(FULL[shape]));
      const explorer = createExplorer(proxy);
      for (const path of PATHS) {
        arrange(path);
        explorer.getExplorerUrl(ADDR);
        explorer.getExplorerTxUrl?.(TX);
        resolveExplorerConfig(proxy);
      }
      expect(
        [...keys].filter((k) => !(EXPLORER_KEYS as readonly PropertyKey[]).includes(k))
      ).toEqual([]);
      expect(keys.has('ecosystem')).toBe(true);
    }
  );

  it('a full config proxy is never read for rpcUrl, chainId or any other non-explorer key', () => {
    const { proxy, keys } = tracked(FULL.v2);
    const explorer = createExplorer(proxy);
    for (const path of PATHS) {
      arrange(path);
      explorer.getExplorerUrl(ADDR);
      explorer.getExplorerTxUrl?.(TX);
    }
    expect([...keys].filter((k) => !(EXPLORER_KEYS as readonly PropertyKey[]).includes(k))).toEqual(
      []
    );
  });

  it('asEvmExplorerNetworkConfig returns the same reference (no clone, no defaults)', () => {
    const explorerOnly = project(FULL.plain);
    expect(asEvmExplorerNetworkConfig(explorerOnly)).toBe(explorerOnly);
    expect(asEvmExplorerNetworkConfig(FULL.v2)).toBe(FULL.v2);
    expect(Object.keys(asEvmExplorerNetworkConfig(explorerOnly)).sort()).toEqual(
      Object.keys(explorerOnly).sort()
    );
  });
});

describe('INV-5: explorer-only links are the real explorer URLs', () => {
  it.each([
    ['https://sepolia.etherscan.io'],
    ['https://sepolia.etherscan.io/'],
    ['https://sepolia.etherscan.io///'],
  ])('base %s → /address/ and /tx/ with trailing slashes trimmed', (explorerUrl) => {
    const explorer = createExplorer({ ecosystem: 'evm', id: 'x', name: 'X', explorerUrl });
    expect(explorer.getExplorerUrl(ADDR)).toBe(`https://sepolia.etherscan.io/address/${ADDR}`);
    expect(explorer.getExplorerTxUrl?.(TX)).toBe(`https://sepolia.etherscan.io/tx/${TX}`);
  });

  it('passes address casing through unchanged (boundary)', () => {
    const explorer = createExplorer(project(FULL.v2));
    const lower = ADDR.toLowerCase();
    expect(explorer.getExplorerUrl(ADDR)).toMatch(new RegExp(`/address/${ADDR}$`));
    expect(explorer.getExplorerUrl(lower)).toMatch(new RegExp(`/address/${lower}$`));
  });

  it('a user override keyed on the explorer-only id becomes the base (Edge Case 2)', () => {
    arrange('user', 'https://my-blockscout.example///');
    const explorer = createExplorer({
      ecosystem: 'evm',
      id: 'bank-chain',
      name: 'Bank',
      explorerUrl: 'https://default.example',
    });
    expect(explorer.getExplorerUrl(ADDR)).toBe(`https://my-blockscout.example/address/${ADDR}`);
    expect(explorer.getExplorerTxUrl?.(TX)).toBe(`https://my-blockscout.example/tx/${TX}`);
    expect(mockUserGet).toHaveBeenCalledWith('bank-chain', 'explorer');
  });

  it('a user override without explorerUrl leaves the config URL as the base', () => {
    mockUserGet.mockReturnValue({ apiKey: SENTINEL.user });
    const explorer = createExplorer(project(FULL.v2));
    expect(explorer.getExplorerUrl(ADDR)).toBe(`https://sepolia.etherscan.io/address/${ADDR}`);
  });
});

describe('INV-6 / INV-8: "no link" is null, never a throw, never a malformed URL', () => {
  const shapes: Array<[string, NetworkConfig | EvmExplorerNetworkConfig | undefined]> = [
    ['no config', undefined],
    ['explorer-only without explorerUrl', { ecosystem: 'evm', id: 'a', name: 'A' }],
    [
      'explorer-only with explorerUrl ""',
      { ecosystem: 'evm', id: 'a', name: 'A', explorerUrl: '' },
    ],
    ['full config without explorerUrl', fullConfig({ id: 'a', name: 'A' })],
  ];

  it.each(shapes)('%s → both links null (AS-4)', (_label, config) => {
    const explorer = createExplorer(config);
    for (const path of PATHS.filter((p) => p !== 'user')) {
      arrange(path);
      expect(explorer.getExplorerUrl(ADDR)).toBeNull();
      expect(explorer.getExplorerTxUrl?.(TX)).toBeNull();
    }
  });

  it('missing explorerUrl stays null when a user override has no explorerUrl either', () => {
    mockUserGet.mockReturnValue({ apiKey: SENTINEL.user });
    const explorer = createExplorer({ ecosystem: 'evm', id: 'a', name: 'A' });
    expect(explorer.getExplorerUrl(ADDR)).toBeNull();
    expect(explorer.getExplorerTxUrl?.(TX)).toBeNull();
  });

  it.each([
    [''],
    ['not-an-address'],
    ['0x123'],
    ['0xAbCdEf0123456789aBcDeF0123456789AbCdEf0'],
    ['0xAbCdEf0123456789aBcDeF0123456789AbCdEf011'],
    ['0xZZCdEf0123456789aBcDeF0123456789AbCdEf01'],
    ['0xAbCdEf0123456789aBcDeF0123456789AbCdEf01'], // mixed case, bad EIP-55 checksum
    ['../../x'],
    ['<script>alert(1)</script>'],
  ])('invalid address %j → null on both config shapes', (address) => {
    for (const config of [project(FULL.v2), FULL.v2]) {
      expect(() => createExplorer(config).getExplorerUrl(address)).not.toThrow();
      expect(createExplorer(config).getExplorerUrl(address)).toBeNull();
    }
  });

  it('empty tx hash → null on both config shapes', () => {
    for (const config of [project(FULL.v2), FULL.v2]) {
      expect(createExplorer(config).getExplorerTxUrl?.('')).toBeNull();
    }
  });

  it('a minimal three-key config never throws on any path and never yields "undefined"/"null" text', () => {
    const explorer = createExplorer(
      deepFreeze<EvmExplorerNetworkConfig>({ ecosystem: 'evm', id: 'm', name: 'Minimal' })
    );
    for (const path of PATHS) {
      arrange(path);
      const links = [explorer.getExplorerUrl(ADDR), explorer.getExplorerTxUrl?.(TX)];
      for (const link of links) {
        if (link !== null) expect(link).not.toMatch(/undefined|null/);
      }
      if (path !== 'user') expect(links).toEqual([null, null]);
    }
  });
});

describe('INV-7: ecosystem guard parity (same Error, same text, at construction)', () => {
  const stellar: StellarNetworkConfig = {
    ecosystem: 'stellar',
    id: 'stellar-testnet',
    name: 'Stellar Testnet',
    network: 'stellar',
    type: 'testnet',
    isTestnet: true,
    exportConstName: 'stellarTestnet',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    explorerUrl: 'https://stellar.expert/explorer/testnet',
  };
  const polkadot: PolkadotNetworkConfig = {
    ...fullConfig({ id: 'polkadot-hub', name: 'Polkadot Hub', explorerUrl: 'https://x.io' }),
    ecosystem: 'polkadot',
    executionType: 'evm',
    networkCategory: 'hub',
  };

  it.each<[string, NetworkConfig]>([
    ['stellar (typed full config)', stellar],
    ['polkadot EVM-compatible (Edge Case 3)', polkadot],
  ])('%s throws the exact main message at construction', (_label, config) => {
    let thrown: unknown;
    try {
      createExplorer(config);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown instanceof Error && thrown.constructor).toBe(Error);
    expect(thrown instanceof Error && thrown.message).toBe(
      `Expected an EVM network configuration, received ${config.ecosystem}.`
    );
    expect(() => asTypedEvmNetworkConfig(config)).toThrow(
      thrown instanceof Error ? thrown.message : 'unreachable'
    );
  });

  it.each([
    ['solana', { ecosystem: 'solana', id: 's', name: 'S', explorerUrl: 'https://x.io' }, 'solana'],
    ['midnight', { ecosystem: 'midnight', id: 'm', name: 'M' }, 'midnight'],
    ['polkadot explorer-only via cast', { ecosystem: 'polkadot', id: 'p', name: 'P' }, 'polkadot'],
    [
      'missing ecosystem (plain JS)',
      { id: 'u', name: 'U', explorerUrl: 'https://x.io' },
      'undefined',
    ],
    [
      'wrong-case EVM',
      { ecosystem: 'EVM', id: 'e', name: 'E', explorerUrl: 'https://x.io' },
      'EVM',
    ],
  ])(
    '%s → throws at construction with the same text as asTypedEvmNetworkConfig',
    (_l, input, shown) => {
      const expected = `Expected an EVM network configuration, received ${shown}.`;
      expect(() => callUntyped(createExplorer, input)).toThrowError(new Error(expected));
      expect(() => callUntyped(asTypedEvmNetworkConfig, input)).toThrowError(new Error(expected));
      expect(mockInfo).not.toHaveBeenCalled();
    }
  );

  it('no ecosystem:"evm" input throws at construction (happy path)', () => {
    for (const config of [
      { ecosystem: 'evm' as const, id: 'a', name: 'A' },
      project(FULL.routescan),
      FULL.routescan,
    ]) {
      expect(() => createExplorer(config)).not.toThrow();
    }
  });
});

describe('INV-9: deterministic, non-mutating, late-bound resolution', () => {
  it('a deep-frozen explorer-only config yields identical links on repeated calls', () => {
    const config = deepFreeze(project(FULL.v2));
    const snapshot = JSON.stringify(config);
    const explorer = createExplorer(config);
    for (const path of PATHS) {
      arrange(path);
      const first = [explorer.getExplorerUrl(ADDR), explorer.getExplorerTxUrl?.(TX)];
      const second = [explorer.getExplorerUrl(ADDR), explorer.getExplorerTxUrl?.(TX)];
      expect(second).toEqual(first);
    }
    expect(JSON.stringify(config)).toBe(snapshot);
  });

  it('a user override saved, changed, then cleared after construction applies on the next call', () => {
    const explorer = createExplorer(project(FULL.v2));
    expect(explorer.getExplorerUrl(ADDR)).toBe(`https://sepolia.etherscan.io/address/${ADDR}`);

    mockUserGet.mockReturnValue({ explorerUrl: 'https://first.example' });
    expect(explorer.getExplorerUrl(ADDR)).toBe(`https://first.example/address/${ADDR}`);

    mockUserGet.mockReturnValue({ explorerUrl: 'https://second.example' });
    expect(explorer.getExplorerTxUrl?.(TX)).toBe(`https://second.example/tx/${TX}`);

    mockUserGet.mockReturnValue(null);
    expect(explorer.getExplorerUrl(ADDR)).toBe(`https://sepolia.etherscan.io/address/${ADDR}`);
  });
});

describe('INV-10: read-only, with the same log trail', () => {
  const expectedLog: Record<Path, (name: string) => string> = {
    user: (n) => `Using user-configured explorer for ${n}`,
    v2: (n) => `Using global Etherscan V2 API key for ${n}`,
    app: (n) => `Using app-configured API key for ${n}`,
    default: (n) => `Using default explorer for ${n} (no API key configured)`,
  };

  it.each(PATHS)(
    '%s path: exactly one ExplorerConfig info log per link call, naming the network',
    (path) => {
      const explorer = createExplorer(project(FULL.v2));
      arrange(path);
      mockInfo.mockClear();
      explorer.getExplorerUrl(ADDR);
      expect(mockInfo).toHaveBeenCalledTimes(1);
      expect(mockInfo).toHaveBeenCalledWith('ExplorerConfig', expectedLog[path]('Sepolia'));
      explorer.getExplorerTxUrl?.(TX);
      expect(mockInfo).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(mockInfo.mock.calls)).not.toContain('undefined');
    }
  );

  it('logs nothing at construction or on early-null paths (invalid address, empty hash)', () => {
    const explorer = createExplorer(project(FULL.v2));
    explorer.getExplorerUrl('nope');
    explorer.getExplorerTxUrl?.('');
    createExplorer();
    expect(mockInfo).not.toHaveBeenCalled();
  });

  it('never calls a mutating service method on any path', () => {
    const explorer = createExplorer(project(FULL.v2));
    for (const path of PATHS) {
      arrange(path);
      explorer.getExplorerUrl(ADDR);
      explorer.getExplorerTxUrl?.(TX);
    }
    for (const mutator of Object.values(mutators)) {
      expect(mutator).not.toHaveBeenCalled();
    }
  });
});

describe('INV-11: no I/O and no RPC resolution on the explorer path', () => {
  it('drives every link case with fetch stubbed to throw and RPC helpers spied', () => {
    const fetchSpy = vi.fn(() => {
      throw new Error('INV-11: fetch must not be called');
    });
    vi.stubGlobal('fetch', fetchSpy);

    const configs = [
      project(FULL.v2),
      project(FULL.routescan),
      { ecosystem: 'evm' as const, id: 'a', name: 'A' },
    ];
    for (const config of configs) {
      const explorer = createExplorer(config);
      for (const path of PATHS) {
        arrange(path);
        for (const address of [ADDR, '', '0x1']) explorer.getExplorerUrl(address);
        for (const hash of [TX, '']) explorer.getExplorerTxUrl?.(hash);
      }
    }

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(vi.mocked(rpc.resolveRpcUrl)).not.toHaveBeenCalled();
    expect(vi.mocked(rpc.getUserRpcUrl)).not.toHaveBeenCalled();
    expect(vi.mocked(rpc.buildRpcUrl)).not.toHaveBeenCalled();
    expect(vi.mocked(rpc.testEvmRpcConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(rpc.getEvmCurrentBlock)).not.toHaveBeenCalled();
  });
});

describe('INV-12: explorer API keys never reach links or logs', () => {
  it.each(PATHS)(
    '%s path: no sentinel key in links or logger args (both config shapes)',
    (path) => {
      for (const config of [project(FULL.v2), FULL.v2, project(FULL.routescan), FULL.routescan]) {
        arrange(path);
        mockInfo.mockClear();
        const explorer = createExplorer(config);
        const resolved = resolveExplorerConfig(config);
        const out = [explorer.getExplorerUrl(ADDR), explorer.getExplorerTxUrl?.(TX)].join('\n');
        const logs = JSON.stringify(mockInfo.mock.calls);
        for (const secret of Object.values(SENTINEL)) {
          expect(out).not.toContain(secret);
          expect(logs).not.toContain(secret);
        }
        // Guard against a vacuous pass: the key really was resolved on keyed paths.
        const keyed = path !== 'default' && !(path === 'v2' && !config.supportsEtherscanV2);
        if (keyed) expect(resolved.apiKey).toMatch(/^SENTINEL_KEY_/);
      }
    }
  );
});

describe('INV-14: projection parity, F vs pick(F)', () => {
  it.each(Object.keys(FULL) as (keyof typeof FULL)[])(
    '%s: all 4 paths give byte-identical links and deep-equal resolved config',
    (shape) => {
      const full = FULL[shape];
      const narrow = project(full);
      for (const path of PATHS) {
        arrange(path);
        const fromFull = createExplorer(full);
        const fromNarrow = createExplorer(narrow);
        expect(fromNarrow.getExplorerUrl(ADDR)).toBe(fromFull.getExplorerUrl(ADDR));
        expect(fromNarrow.getExplorerTxUrl?.(TX)).toBe(fromFull.getExplorerTxUrl?.(TX));
        expect(resolveExplorerConfig(narrow)).toEqual(resolveExplorerConfig(full));
      }
    }
  );

  it('the four paths are really distinct for the V2 config (non-vacuous matrix)', () => {
    const seen = new Set<string>();
    for (const path of PATHS) {
      arrange(path);
      seen.add(JSON.stringify(resolveExplorerConfig(project(FULL.v2))));
    }
    expect(seen.size).toBe(4);
  });
});
