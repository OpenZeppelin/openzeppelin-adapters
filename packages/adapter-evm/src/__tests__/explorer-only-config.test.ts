/**
 * SF-2 (#92) at the adapter-evm surface: the explorer-only config through the public
 * `@openzeppelin/adapter-evm/explorer` entry, checked against every shipped network.
 *
 * INV-14 (projection parity) across all shipped networks × 4 resolution paths × 2 link kinds,
 * including the adapter profile's explorer factory (`capabilityFactories.explorer`, the
 * INV-2 call site at `profiles/shared.ts:135`; line 170 is a plain `createExplorer(config)`).
 * INV-13 at source level: the Tier-1 entry's runtime export set is unchanged. The built-dist
 * half of INV-13 is in the SF-2 proof script.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TypedEvmNetworkConfig } from '@openzeppelin/adapter-evm-core';
import * as explorerEntry from '@openzeppelin/adapter-evm/explorer';
import { createExplorer, type EvmExplorerNetworkConfig } from '@openzeppelin/adapter-evm/explorer';
import { appConfigService, userNetworkServiceConfigService } from '@openzeppelin/ui-utils';

import { evmNetworks } from '../networks';
import { capabilityFactories } from '../profiles/shared';

vi.mock('@openzeppelin/ui-utils', async () => {
  const actual =
    await vi.importActual<typeof import('@openzeppelin/ui-utils')>('@openzeppelin/ui-utils');
  return {
    ...actual,
    appConfigService: { getGlobalServiceConfig: vi.fn(), getExplorerApiKey: vi.fn() },
    userNetworkServiceConfigService: { get: vi.fn() },
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
});

const mockGlobal = vi.mocked(appConfigService.getGlobalServiceConfig);
const mockExplorerKey = vi.mocked(appConfigService.getExplorerApiKey);
const mockUserGet = vi.mocked(userNetworkServiceConfigService.get);

const ADDR = '0xabCDeF0123456789AbcdEf0123456789aBCDEF01';
const TX = '0x5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060';

type Path = 'user' | 'v2' | 'app' | 'default';
const PATHS: readonly Path[] = ['user', 'v2', 'app', 'default'];

function arrange(path: Path): void {
  mockUserGet.mockReturnValue(
    path === 'user' ? { explorerUrl: 'https://override.example/', apiKey: 'user-key' } : null
  );
  mockGlobal.mockImplementation((name) => {
    if (name === 'etherscanv2' && path === 'v2') return { apiKey: 'v2-key' };
    if (name !== 'etherscanv2' && path === 'app') return { apiKey: 'app-key' };
    return undefined;
  });
  mockExplorerKey.mockReturnValue(undefined);
}

/** What a browser app writes inline: the seven explorer fields, no RPC. */
function project(n: TypedEvmNetworkConfig): EvmExplorerNetworkConfig {
  const explorerOnly: EvmExplorerNetworkConfig = { ecosystem: n.ecosystem, id: n.id, name: n.name };
  if (n.explorerUrl !== undefined) explorerOnly.explorerUrl = n.explorerUrl;
  if (n.apiUrl !== undefined) explorerOnly.apiUrl = n.apiUrl;
  if (n.primaryExplorerApiIdentifier !== undefined)
    explorerOnly.primaryExplorerApiIdentifier = n.primaryExplorerApiIdentifier;
  if (n.supportsEtherscanV2 !== undefined) explorerOnly.supportsEtherscanV2 = n.supportsEtherscanV2;
  return explorerOnly;
}

function links(explorer: {
  getExplorerUrl(a: string): string | null;
  getExplorerTxUrl?(h: string): string | null;
}) {
  return [explorer.getExplorerUrl(ADDR), explorer.getExplorerTxUrl?.(TX) ?? null];
}

const profileExplorer = (network: TypedEvmNetworkConfig) => {
  const factory = capabilityFactories.explorer;
  if (!factory) throw new Error('adapter-evm profile has no explorer factory');
  return factory(network);
};

beforeEach(() => {
  vi.clearAllMocks();
  arrange('default');
});

describe('INV-14: explorer-only projection matches every shipped network (SC-005)', () => {
  it('the matrix covers both V2 and non-V2 explorer-API networks (non-vacuous)', () => {
    expect(evmNetworks.length).toBeGreaterThanOrEqual(20);
    expect(evmNetworks.some((n) => n.supportsEtherscanV2)).toBe(true);
    expect(evmNetworks.some((n) => !n.supportsEtherscanV2)).toBe(true);
    expect(evmNetworks.every((n) => typeof n.explorerUrl === 'string')).toBe(true);
  });

  it.each(evmNetworks.map((n) => [n.id, n] as const))(
    '%s: full config, profile path and explorer-only give identical links on all 4 paths',
    (_id, network) => {
      for (const path of PATHS) {
        arrange(path);
        const expected = links(createExplorer(network));
        expect(expected[0]).toMatch(/^https:\/\/[^/]+.*\/address\/0x/);
        expect(links(createExplorer(project(network)))).toEqual(expected);
        expect(links(profileExplorer(network))).toEqual(expected);
      }
    }
  );
});

describe('INV-5 / AS-1: explorer-only config through the public adapter-evm entry', () => {
  it('builds real Sepolia links with no RPC URL and no chain id', () => {
    const explorer = createExplorer({
      ecosystem: 'evm',
      id: 'ethereum-sepolia',
      name: 'Sepolia',
      explorerUrl: 'https://sepolia.etherscan.io',
    });
    expect(explorer.getExplorerUrl(ADDR)).toBe(`https://sepolia.etherscan.io/address/${ADDR}`);
    expect(explorer.getExplorerTxUrl?.(TX)).toBe(`https://sepolia.etherscan.io/tx/${TX}`);
  });

  it('without explorerUrl both links are null (AS-4)', () => {
    const explorer = createExplorer({ ecosystem: 'evm', id: 'x', name: 'X' });
    expect(links(explorer)).toEqual([null, null]);
  });

  it('a foreign ecosystem is rejected at construction with the main message (AS-3)', () => {
    const foreign = { ecosystem: 'polkadot', id: 'p', name: 'P', explorerUrl: 'https://x.io' };
    expect(() => Reflect.apply(createExplorer, undefined, [foreign])).toThrowError(
      new Error('Expected an EVM network configuration, received polkadot.')
    );
  });
});

describe('INV-13: the /explorer Tier-1 entry runtime export set is unchanged', () => {
  it('exports only createExplorer at runtime (the type adds no value export)', () => {
    expect(Object.keys(explorerEntry).sort()).toEqual(['createExplorer']);
  });
});
