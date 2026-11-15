/**
 * SF-2 (#92) type contract of `EvmExplorerNetworkConfig` and the widened explorer parameters.
 *
 * Covers INV-1 (exact field set), INV-2 (backward-compatible assignability) and INV-3 (a foreign
 * explorer-only literal does not compile). These are type-level invariants: the assertions run
 * under `pnpm typecheck:tests` (this file is NOT in tsconfig.tests.json's legacy exclude list),
 * and every `@ts-expect-error` is load-bearing because an unused directive fails `tsc`.
 *
 * The `it` bodies also execute under vitest so a deleted file or a skipped suite shows up as a
 * missing test, but the real verdict is the compiler's.
 */
import { describe, expect, expectTypeOf, it } from 'vitest';

import type {
  EvmNetworkConfig,
  MidnightNetworkConfig,
  NetworkConfig,
  PolkadotNetworkConfig,
  SolanaNetworkConfig,
  StellarNetworkConfig,
} from '@openzeppelin/ui-types';

import { createExplorer } from '../../capabilities/explorer';
import type { EvmExplorerNetworkConfig as EvmExplorerNetworkConfigFromExplorerEntry } from '../../capabilities/explorer';
import {
  getEvmExplorerAddressUrl,
  getEvmExplorerTxUrl,
  resolveExplorerConfig,
} from '../../configuration/explorer';
import type { EvmExplorerNetworkConfig as EvmExplorerNetworkConfigFromRoot } from '../../index';
import type {
  EvmCompatibleNetworkConfig,
  EvmExplorerNetworkConfig,
  TypedEvmNetworkConfig,
} from '../network';

type ExplorerKeys =
  | 'id'
  | 'name'
  | 'ecosystem'
  | 'explorerUrl'
  | 'apiUrl'
  | 'primaryExplorerApiIdentifier'
  | 'supportsEtherscanV2';

type RequiredKeys<T> = {
  [K in keyof T]-?: Record<string, never> extends Pick<T, K> ? never : K;
}[keyof T];
type OptionalKeys<T> = Exclude<keyof T, RequiredKeys<T>>;

type CreateExplorerParam = NonNullable<Parameters<typeof createExplorer>[0]>;
type HelperParam = Parameters<typeof getEvmExplorerAddressUrl>[1];

describe('INV-1: EvmExplorerNetworkConfig has exactly the seven explorer keys', () => {
  it('keyof is exactly the seven explorer-path keys (happy path)', () => {
    expectTypeOf<keyof EvmExplorerNetworkConfig>().toEqualTypeOf<ExplorerKeys>();
    expectTypeOf<keyof EvmExplorerNetworkConfig<string>>().toEqualTypeOf<ExplorerKeys>();
  });

  it('id, name, ecosystem are required; the other four are optional (boundary)', () => {
    expectTypeOf<RequiredKeys<EvmExplorerNetworkConfig>>().toEqualTypeOf<
      'id' | 'name' | 'ecosystem'
    >();
    expectTypeOf<OptionalKeys<EvmExplorerNetworkConfig>>().toEqualTypeOf<
      'explorerUrl' | 'apiUrl' | 'primaryExplorerApiIdentifier' | 'supportsEtherscanV2'
    >();
  });

  it('value types follow EvmNetworkConfig (Pick, not restated)', () => {
    expectTypeOf<EvmExplorerNetworkConfig['ecosystem']>().toEqualTypeOf<'evm'>();
    expectTypeOf<EvmExplorerNetworkConfig['explorerUrl']>().toEqualTypeOf<
      EvmNetworkConfig['explorerUrl']
    >();
    expectTypeOf<EvmExplorerNetworkConfig['apiUrl']>().toEqualTypeOf<EvmNetworkConfig['apiUrl']>();
    expectTypeOf<EvmExplorerNetworkConfig['supportsEtherscanV2']>().toEqualTypeOf<
      EvmNetworkConfig['supportsEtherscanV2']
    >();
    expectTypeOf<EvmExplorerNetworkConfig['primaryExplorerApiIdentifier']>().toEqualTypeOf<
      EvmNetworkConfig['primaryExplorerApiIdentifier']
    >();
  });

  it('carries no RPC or chain-connection key (failure: #92 workaround would return)', () => {
    type Forbidden =
      | 'rpcUrl'
      | 'chainId'
      | 'viemChain'
      | 'network'
      | 'type'
      | 'isTestnet'
      | 'nativeCurrency'
      | 'exportConstName'
      | 'icon'
      | 'requiresExplorerApiKey';
    expectTypeOf<Extract<keyof EvmExplorerNetworkConfig, Forbidden>>().toEqualTypeOf<never>();
  });

  it('rejects literals missing a required key (failure)', () => {
    // @ts-expect-error INV-1: `id` is required
    const noId: EvmExplorerNetworkConfig = { ecosystem: 'evm', name: 'N' };
    // @ts-expect-error INV-1: `name` is required
    const noName: EvmExplorerNetworkConfig = { ecosystem: 'evm', id: 'n' };
    // @ts-expect-error INV-1: `ecosystem` is required (dev decision D2)
    const noEcosystem: EvmExplorerNetworkConfig = { id: 'n', name: 'N' };
    expect([noId, noName, noEcosystem]).toHaveLength(3);
  });

  it('a minimal three-key literal and a full seven-key literal both compile (boundary)', () => {
    const minimal = { ecosystem: 'evm', id: 'n', name: 'N' } satisfies EvmExplorerNetworkConfig;
    const full = {
      ecosystem: 'evm',
      id: 'n',
      name: 'N',
      explorerUrl: 'https://x.io',
      apiUrl: 'https://api.x.io',
      primaryExplorerApiIdentifier: 'etherscan-v2',
      supportsEtherscanV2: true,
    } satisfies EvmExplorerNetworkConfig;
    expect(Object.keys(minimal)).toHaveLength(3);
    expect(Object.keys(full)).toHaveLength(7);
  });

  it('is the same type from the core root, the /explorer entry and the types module', () => {
    expectTypeOf<EvmExplorerNetworkConfigFromRoot>().toEqualTypeOf<EvmExplorerNetworkConfig>();
    expectTypeOf<EvmExplorerNetworkConfigFromExplorerEntry>().toEqualTypeOf<EvmExplorerNetworkConfig>();
  });
});

describe('INV-2: everything accepted on main is still accepted, without a cast', () => {
  it('every arm of the ui-types NetworkConfig union fits createExplorer', () => {
    expectTypeOf<NetworkConfig>().toExtend<CreateExplorerParam>();
    expectTypeOf<EvmNetworkConfig>().toExtend<CreateExplorerParam>();
    expectTypeOf<SolanaNetworkConfig>().toExtend<CreateExplorerParam>();
    expectTypeOf<StellarNetworkConfig>().toExtend<CreateExplorerParam>();
    expectTypeOf<MidnightNetworkConfig>().toExtend<CreateExplorerParam>();
    expectTypeOf<PolkadotNetworkConfig>().toExtend<CreateExplorerParam>();
  });

  it('createExplorer stays optional (no-arg call compiles)', () => {
    expectTypeOf(createExplorer).toBeCallableWith();
    expectTypeOf(createExplorer).toBeCallableWith(undefined);
  });

  it('full EVM configs are assignable to the narrow type', () => {
    expectTypeOf<EvmNetworkConfig>().toExtend<EvmExplorerNetworkConfig>();
    expectTypeOf<TypedEvmNetworkConfig>().toExtend<EvmExplorerNetworkConfig>();
    expectTypeOf<EvmCompatibleNetworkConfig<'evm'>>().toExtend<EvmExplorerNetworkConfig>();
  });

  it('EVM-compatible (Polkadot) configs still fit the widened helper parameter', () => {
    expectTypeOf<EvmCompatibleNetworkConfig<string>>().toExtend<HelperParam>();
    expectTypeOf<EvmCompatibleNetworkConfig<'polkadot'>>().toExtend<HelperParam>();
    expectTypeOf<PolkadotNetworkConfig>().toExtend<HelperParam>();
    expectTypeOf<EvmCompatibleNetworkConfig>().toExtend<
      Parameters<typeof getEvmExplorerTxUrl>[1]
    >();
    expectTypeOf<EvmCompatibleNetworkConfig>().toExtend<
      Parameters<typeof resolveExplorerConfig>[0]
    >();
  });

  it("today's `rpcUrl: ''` workaround literal still compiles (boundary)", () => {
    const workaround = {
      ecosystem: 'evm',
      id: 'bank-console',
      name: 'Bank Console Chain',
      network: 'bank',
      exportConstName: 'bankConsole',
      type: 'mainnet',
      isTestnet: false,
      chainId: 1,
      rpcUrl: '',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      explorerUrl: 'https://etherscan.io',
    } satisfies EvmNetworkConfig;
    const capability = createExplorer(workaround);
    expect(typeof capability.getExplorerUrl).toBe('function');
  });
});

describe('INV-3: the narrow type only states what works', () => {
  it('a foreign-ecosystem explorer-only literal does not type as the narrow config (failure)', () => {
    // @ts-expect-error INV-3: ecosystem is the 'evm' literal
    const polkadot: EvmExplorerNetworkConfig = { ecosystem: 'polkadot', id: 'p', name: 'P' };
    // @ts-expect-error INV-3: wrong-case ecosystem is foreign too
    const upper: EvmExplorerNetworkConfig = { ecosystem: 'EVM', id: 'p', name: 'P' };
    expect([polkadot, upper]).toHaveLength(2);
  });

  it('createExplorer has no arm for a foreign explorer-only literal (failure)', () => {
    expect(() =>
      createExplorer(
        // @ts-expect-error INV-3: no NetworkConfig arm matches, and the narrow arm wants 'evm'
        { ecosystem: 'polkadot', id: 'p', name: 'P', explorerUrl: 'https://x.io' }
      )
    ).toThrow(Error);
  });

  it('an EVM explorer-only literal compiles into createExplorer (happy path)', () => {
    const capability = createExplorer({
      ecosystem: 'evm',
      id: 'n',
      name: 'N',
      explorerUrl: 'https://x.io',
    });
    expectTypeOf(capability.getExplorerUrl).returns.toEqualTypeOf<string | null>();
    expect(capability.getExplorerUrl('0x0000000000000000000000000000000000000001')).toBe(
      'https://x.io/address/0x0000000000000000000000000000000000000001'
    );
  });
});
