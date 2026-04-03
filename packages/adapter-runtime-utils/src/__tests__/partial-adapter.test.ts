import { describe, expect, it } from 'vitest';

import type {
  AddressingCapability,
  CapabilityFactoryMap,
  ExplorerCapability,
  NetworkCatalogCapability,
  NetworkConfig,
  UiLabelsCapability,
} from '@openzeppelin/ui-types';
import { UnsupportedProfileError } from '@openzeppelin/ui-types';

import { createRuntimeFromFactories, PROFILE_REQUIREMENTS } from '../profile-runtime';

const mockNetworkConfig = {
  id: 'minimal-testnet',
  exportConstName: 'minimalTestnet',
  name: 'Minimal Testnet',
  ecosystem: 'minimal',
  network: 'minimal',
  type: 'testnet',
  isTestnet: true,
  chainId: 99999,
  rpcUrl: 'https://rpc.minimal.example.com',
  nativeCurrency: { name: 'Minimal Token', symbol: 'MIN', decimals: 18 },
} as unknown as NetworkConfig;

/**
 * Simulates a third-party adapter author who implements only Tier 1 capabilities.
 * This is the minimal viable adapter for Declarative-profile consumers.
 */
function createMinimalTier1Adapter(): CapabilityFactoryMap {
  const addressing: AddressingCapability = {
    isValidAddress(address: string): boolean {
      return /^0x[0-9a-fA-F]{40}$/.test(address);
    },
  };

  const explorer: ExplorerCapability = {
    getExplorerUrl(address: string): string | null {
      return `https://explorer.minimal.example.com/address/${address}`;
    },
    getExplorerTxUrl(txHash: string): string | null {
      return `https://explorer.minimal.example.com/tx/${txHash}`;
    },
  };

  const networkCatalog: NetworkCatalogCapability = {
    getNetworks(): NetworkConfig[] {
      return [mockNetworkConfig];
    },
  };

  const uiLabels: UiLabelsCapability = {
    getUiLabels(): Record<string, string> {
      return { transactionLabel: 'Transaction', addressLabel: 'Address' };
    },
  };

  return {
    addressing: () => addressing,
    explorer: () => explorer,
    networkCatalog: () => networkCatalog,
    uiLabels: () => uiLabels,
  };
}

/**
 * Even more minimal: only 3 of 4 Tier 1 capabilities (missing UiLabels).
 * This should fail for every profile since all profiles require all Tier 1.
 */
function createIncompleteTier1Adapter(): CapabilityFactoryMap {
  return {
    addressing: () => ({
      isValidAddress: () => true,
    }),
    explorer: () => ({
      getExplorerUrl: () => null,
    }),
    networkCatalog: () => ({
      getNetworks: () => [mockNetworkConfig],
    }),
  };
}

describe('Partial adapter author support (US6)', () => {
  describe('CapabilityFactoryMap type satisfaction', () => {
    it('accepts a factory map with only Tier 1 capabilities', () => {
      const factories: CapabilityFactoryMap = createMinimalTier1Adapter();

      expect(factories.addressing).toBeDefined();
      expect(factories.explorer).toBeDefined();
      expect(factories.networkCatalog).toBeDefined();
      expect(factories.uiLabels).toBeDefined();

      expect(factories.contractLoading).toBeUndefined();
      expect(factories.schema).toBeUndefined();
      expect(factories.typeMapping).toBeUndefined();
      expect(factories.query).toBeUndefined();
      expect(factories.execution).toBeUndefined();
      expect(factories.wallet).toBeUndefined();
      expect(factories.uiKit).toBeUndefined();
      expect(factories.relayer).toBeUndefined();
      expect(factories.accessControl).toBeUndefined();
    });

    it('accepts a factory map with fewer than 4 Tier 1 capabilities', () => {
      const factories: CapabilityFactoryMap = createIncompleteTier1Adapter();

      expect(factories.addressing).toBeDefined();
      expect(factories.explorer).toBeDefined();
      expect(factories.networkCatalog).toBeDefined();
      expect(factories.uiLabels).toBeUndefined();
    });
  });

  describe('Declarative profile with minimal Tier 1 adapter', () => {
    it('succeeds when all 4 Tier 1 capabilities are provided', () => {
      const factories = createMinimalTier1Adapter();
      const runtime = createRuntimeFromFactories('declarative', mockNetworkConfig, factories);

      expect(runtime.networkConfig).toBe(mockNetworkConfig);
      expect(runtime.addressing.isValidAddress('0x' + 'a'.repeat(40))).toBe(true);
      expect(runtime.explorer.getExplorerUrl('0xabc')).toContain('0xabc');
      expect(runtime.networkCatalog.getNetworks()).toHaveLength(1);
      expect(runtime.uiLabels.getUiLabels()).toHaveProperty('transactionLabel');

      expect(runtime.contractLoading).toBeUndefined();
      expect(runtime.schema).toBeUndefined();
      expect(runtime.typeMapping).toBeUndefined();
      expect(runtime.query).toBeUndefined();
      expect(runtime.execution).toBeUndefined();
      expect(runtime.wallet).toBeUndefined();
      expect(runtime.uiKit).toBeUndefined();
      expect(runtime.relayer).toBeUndefined();
      expect(runtime.accessControl).toBeUndefined();
    });

    it('dispose() is idempotent on a Tier-1-only runtime', () => {
      const factories = createMinimalTier1Adapter();
      const runtime = createRuntimeFromFactories('declarative', mockNetworkConfig, factories);

      expect(() => {
        runtime.dispose();
        runtime.dispose();
      }).not.toThrow();
    });

    it('fails when a required Tier 1 capability is missing', () => {
      const factories = createIncompleteTier1Adapter();

      expect(() => createRuntimeFromFactories('declarative', mockNetworkConfig, factories)).toThrow(
        UnsupportedProfileError
      );

      try {
        createRuntimeFromFactories('declarative', mockNetworkConfig, factories);
      } catch (error) {
        expect(error).toBeInstanceOf(UnsupportedProfileError);
        const profileError = error as UnsupportedProfileError;
        expect(profileError.profile).toBe('declarative');
        expect(profileError.missingCapabilities).toContain('uiLabels');
      }
    });
  });

  describe('Higher profiles with minimal Tier 1 adapter', () => {
    const nonDeclarativeProfiles = ['viewer', 'transactor', 'composer', 'operator'] as const;

    it.each(nonDeclarativeProfiles)(
      'createRuntime("%s") throws UnsupportedProfileError with a Tier-1-only adapter',
      (profile) => {
        const factories = createMinimalTier1Adapter();

        expect(() => createRuntimeFromFactories(profile, mockNetworkConfig, factories)).toThrow(
          UnsupportedProfileError
        );

        try {
          createRuntimeFromFactories(profile, mockNetworkConfig, factories);
        } catch (error) {
          const profileError = error as UnsupportedProfileError;
          expect(profileError.profile).toBe(profile);

          const requiredForProfile = PROFILE_REQUIREMENTS[profile];
          const tier1 = ['addressing', 'explorer', 'networkCatalog', 'uiLabels'];
          const expectedMissing = requiredForProfile.filter((cap) => !tier1.includes(cap));

          expect(profileError.missingCapabilities).toEqual(expect.arrayContaining(expectedMissing));
          expect(profileError.missingCapabilities).toHaveLength(expectedMissing.length);
        }
      }
    );

    it('operator profile error lists all missing capabilities', () => {
      const factories = createMinimalTier1Adapter();

      try {
        createRuntimeFromFactories('operator', mockNetworkConfig, factories);
      } catch (error) {
        const profileError = error as UnsupportedProfileError;
        expect(profileError.missingCapabilities).toEqual(
          expect.arrayContaining([
            'contractLoading',
            'schema',
            'typeMapping',
            'query',
            'execution',
            'wallet',
            'uiKit',
            'accessControl',
          ])
        );
        expect(profileError.message).toContain('operator');
        expect(profileError.message).toContain('missing capabilities');
      }
    });
  });

  describe('Profile requirements matrix completeness', () => {
    it('every profile requires all 4 Tier 1 capabilities', () => {
      const tier1: Array<keyof CapabilityFactoryMap> = [
        'addressing',
        'explorer',
        'networkCatalog',
        'uiLabels',
      ];

      for (const profile of Object.keys(PROFILE_REQUIREMENTS) as Array<
        keyof typeof PROFILE_REQUIREMENTS
      >) {
        for (const cap of tier1) {
          expect(
            PROFILE_REQUIREMENTS[profile],
            `Profile "${profile}" should require "${cap}"`
          ).toContain(cap);
        }
      }
    });

    it('declarative requires exactly 4 capabilities (Tier 1 only)', () => {
      expect(PROFILE_REQUIREMENTS.declarative).toHaveLength(4);
    });

    it('higher profiles are strict supersets of declarative', () => {
      const declarativeSet = new Set(PROFILE_REQUIREMENTS.declarative);

      for (const profile of ['viewer', 'transactor', 'composer', 'operator'] as const) {
        const profileSet = new Set(PROFILE_REQUIREMENTS[profile]);
        for (const cap of declarativeSet) {
          expect(
            profileSet.has(cap),
            `"${profile}" should be a superset of "declarative" (missing "${cap}")`
          ).toBe(true);
        }
        expect(profileSet.size).toBeGreaterThan(declarativeSet.size);
      }
    });
  });
});
