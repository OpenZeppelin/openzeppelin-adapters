/**
 * 003 SF-4 · `service.ts` — opt-in-gated forward mainnet-L1 miss-fallback test suite.
 *
 * **SF-4 primary ON matrix** (UR bound `NAME_NOT_FOUND` → single L1 `resolveVia` + SF-2 triplet):
 * spec acceptance scenarios 1–3, never-silent-fallback on bound gateway/timeout (KEY INV-10),
 * `NAME_NOT_FOUND`-only eligibility (INV-11), non-UR 001-1b exclusion (INV-9), I/O budget spies.
 *
 * Opt-in OFF forward contract (`SC-001`, INV-2) is owned by `service.mainnet-l1-opt-in.test.ts`
 * (SF-1). SF-2 triplet integration rows also appear in `network-fallback-provenance.test.ts`.
 *
 * All L1 miss-fallback scenarios require `ENABLE_MAINNET_L1_MISS_FALLBACK` (default OFF elsewhere).
 *
 * Organized by invariant category. Every `describe` names the invariant(s) it covers.
 */
import { describe, expect, it, vi } from 'vitest';

import type { ResolutionResult, ResolvedAddress } from '@openzeppelin/ui-types';

import {
  chainAgnosticScope,
  expectCompleteFallbackTriplet,
  expectNoFallbackTriplet,
  isCrossNetworkFallback,
} from './helpers/fallback-provenance';

import { isEnsProvenance } from '../ens-provenance';
import { createEvmNameResolutionService } from '../service';
import {
  ENABLE_MAINNET_L1_MISS_FALLBACK,
  EVM_NETWORK_CONFIG,
  L2_NETWORK_CONFIG,
  makeClient,
  makeDecodedRevert,
  makeDualReverseClients,
  makeHttpError,
  makeTimeoutError,
  SEPOLIA_NETWORK_CONFIG,
  VITALIK_ADDRESS,
} from './fixtures';

function expectError(result: ResolutionResult<ResolvedAddress>) {
  if (result.ok) {
    throw new Error(`expected { ok: false } but got success: ${JSON.stringify(result.value)}`);
  }
  return result.error;
}

function expectValue(result: ResolutionResult<ResolvedAddress>): ResolvedAddress {
  if (!result.ok) {
    throw new Error(`expected { ok: true } but got error: ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

function makeForwardDualClients(
  boundGetEnsAddress: ReturnType<typeof vi.fn>,
  l1GetEnsAddress: ReturnType<typeof vi.fn>
) {
  const { bound, l1 } = makeDualReverseClients();
  bound.client.getEnsAddress = boundGetEnsAddress;
  l1.client.getEnsAddress = l1GetEnsAddress;
  return { bound, l1, boundGetEnsAddress, l1GetEnsAddress };
}

// ===========================================================================
// Request/Response Contract — spec acceptance + ladder totality (INV-1, INV-6)
// ===========================================================================

describe('resolveName — SF-4 forward miss-fallback ladder (INV-1, INV-6)', () => {
  it('acceptance 1: Sepolia UR + opt-in ON — bound NAME_NOT_FOUND then L1 hit', async () => {
    const boundGetEnsAddress = vi.fn().mockResolvedValue(null);
    const l1GetEnsAddress = vi.fn().mockResolvedValue(VITALIK_ADDRESS);
    const { bound, l1 } = makeForwardDualClients(boundGetEnsAddress, l1GetEnsAddress);
    const service = createEvmNameResolutionService(
      SEPOLIA_NETWORK_CONFIG,
      bound.client,
      l1.client,
      ENABLE_MAINNET_L1_MISS_FALLBACK
    );

    const value = expectValue(await service.resolveName('vitalik.eth'));

    expect(boundGetEnsAddress).toHaveBeenCalledTimes(1);
    expect(l1GetEnsAddress).toHaveBeenCalledTimes(1);
    expect(value.address).toBe(VITALIK_ADDRESS);
    expectCompleteFallbackTriplet(value.provenance, SEPOLIA_NETWORK_CONFIG.id);
  });

  it('acceptance 2: bound hit short-circuits — zero L1 I/O regardless of opt-in', async () => {
    const boundGetEnsAddress = vi.fn().mockResolvedValue(VITALIK_ADDRESS);
    const l1GetEnsAddress = vi.fn().mockResolvedValue(VITALIK_ADDRESS);
    const { bound, l1 } = makeForwardDualClients(boundGetEnsAddress, l1GetEnsAddress);
    const service = createEvmNameResolutionService(
      SEPOLIA_NETWORK_CONFIG,
      bound.client,
      l1.client,
      ENABLE_MAINNET_L1_MISS_FALLBACK
    );

    const value = expectValue(await service.resolveName('vitalik.eth'));

    expect(value.address).toBe(VITALIK_ADDRESS);
    expect(l1GetEnsAddress).not.toHaveBeenCalled();
    expectNoFallbackTriplet(value.provenance);
  });

  it('acceptance 3: non-UR L2 + opt-in ON — canonical 001-1b L1 path, no fallback triplet', async () => {
    const boundGetEnsAddress = vi.fn();
    const l1GetEnsAddress = vi.fn().mockResolvedValue(VITALIK_ADDRESS);
    const { client: boundClient } = makeClient({
      supported: false,
      getEnsAddress: boundGetEnsAddress,
    });
    const { client: l1Client } = makeClient({ getEnsAddress: l1GetEnsAddress, boundChainId: 1 });
    const service = createEvmNameResolutionService(
      L2_NETWORK_CONFIG,
      boundClient,
      l1Client,
      ENABLE_MAINNET_L1_MISS_FALLBACK
    );

    const value = expectValue(await service.resolveName('vitalik.eth'));

    expect(boundGetEnsAddress).not.toHaveBeenCalled();
    expect(l1GetEnsAddress).toHaveBeenCalledTimes(1);
    expectNoFallbackTriplet(value.provenance);
    expect(isEnsProvenance(value.provenance)).toBe(true);
  });
});

// ===========================================================================
// Request/Response Contract — provenance three-row (INV-3, INV-5, INV-7, INV-8)
// ===========================================================================

describe('resolveName — D-R7 forward provenance three-row (INV-5, INV-7, INV-8)', () => {
  it('Sepolia miss-fallback success: absent scopedToNetworkId + complete triplet', async () => {
    const { bound, l1 } = makeForwardDualClients(
      vi.fn().mockResolvedValue(null),
      vi.fn().mockResolvedValue(VITALIK_ADDRESS)
    );
    const service = createEvmNameResolutionService(
      SEPOLIA_NETWORK_CONFIG,
      bound.client,
      l1.client,
      ENABLE_MAINNET_L1_MISS_FALLBACK
    );

    const value = expectValue(await service.resolveName('vitalik.eth'));

    expect(chainAgnosticScope(value.provenance)).toBe('global');
    expect('scopedToNetworkId' in value.provenance).toBe(false);
    expectCompleteFallbackTriplet(value.provenance, SEPOLIA_NETWORK_CONFIG.id);
    expect(isEnsProvenance(value.provenance)).toBe(true);
    if (isEnsProvenance(value.provenance)) expect(value.provenance.coinType).toBe(60);
  });

  it('Sepolia bound-local hit: no triplet; L1 never consulted', async () => {
    const localAddress = '0x1111111111111111111111111111111111111111';
    const { bound, l1, l1GetEnsAddress } = makeForwardDualClients(
      vi.fn().mockResolvedValue(localAddress),
      vi.fn().mockResolvedValue(VITALIK_ADDRESS)
    );
    const service = createEvmNameResolutionService(
      SEPOLIA_NETWORK_CONFIG,
      bound.client,
      l1.client,
      ENABLE_MAINNET_L1_MISS_FALLBACK
    );

    const value = expectValue(await service.resolveName('local.sepolia.eth'));

    expect(value.address).toBe(localAddress);
    expectNoFallbackTriplet(value.provenance);
    expect(l1GetEnsAddress).not.toHaveBeenCalled();
  });

  it('mainnet-bound miss: gate false — bound terminal, L1 untouched', async () => {
    const boundGetEnsAddress = vi.fn().mockResolvedValue(null);
    const l1GetEnsAddress = vi.fn().mockResolvedValue(VITALIK_ADDRESS);
    const { bound, l1 } = makeDualReverseClients({
      boundGetEnsName: vi.fn(),
      boundChainId: 1,
    });
    bound.client.getEnsAddress = boundGetEnsAddress;
    l1.client.getEnsAddress = l1GetEnsAddress;
    const service = createEvmNameResolutionService(
      EVM_NETWORK_CONFIG,
      bound.client,
      l1.client,
      ENABLE_MAINNET_L1_MISS_FALLBACK
    );

    expect(expectError(await service.resolveName('missing.eth')).code).toBe('NAME_NOT_FOUND');
    expect(boundGetEnsAddress).toHaveBeenCalledTimes(1);
    expect(l1GetEnsAddress).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Request/Response Contract — definitive empty signals (INV-1, INV-11)
// ===========================================================================

describe('resolveName — forward NAME_NOT_FOUND eligibility breadth (INV-1, INV-11)', () => {
  const ELIGIBLE_SIGNALS = [
    ['null', vi.fn().mockResolvedValue(null)],
    ['ResolverNotFound', vi.fn().mockRejectedValue(makeDecodedRevert('ResolverNotFound'))],
    ['ResolverNotContract', vi.fn().mockRejectedValue(makeDecodedRevert('ResolverNotContract'))],
    ['ResolverError', vi.fn().mockRejectedValue(makeDecodedRevert('ResolverError'))],
  ] as const;

  it.each(ELIGIBLE_SIGNALS)(
    'bound %s on Sepolia + opt-in ON → one L1 getEnsAddress then L1 success',
    async (_label, boundGetEnsAddress) => {
      const l1GetEnsAddress = vi.fn().mockResolvedValue(VITALIK_ADDRESS);
      const { bound, l1 } = makeForwardDualClients(boundGetEnsAddress, l1GetEnsAddress);
      const service = createEvmNameResolutionService(
        SEPOLIA_NETWORK_CONFIG,
        bound.client,
        l1.client,
        ENABLE_MAINNET_L1_MISS_FALLBACK
      );

      expectValue(await service.resolveName('vitalik.eth'));
      expect(boundGetEnsAddress).toHaveBeenCalledTimes(1);
      expect(l1GetEnsAddress).toHaveBeenCalledTimes(1);
    }
  );

  it('bound UnsupportedResolverProfile + opt-in ON → UNSUPPORTED_NAME, zero L1 calls', async () => {
    const boundGetEnsAddress = vi
      .fn()
      .mockRejectedValue(makeDecodedRevert('UnsupportedResolverProfile'));
    const l1GetEnsAddress = vi.fn().mockResolvedValue(VITALIK_ADDRESS);
    const { bound, l1 } = makeForwardDualClients(boundGetEnsAddress, l1GetEnsAddress);
    const service = createEvmNameResolutionService(
      SEPOLIA_NETWORK_CONFIG,
      bound.client,
      l1.client,
      ENABLE_MAINNET_L1_MISS_FALLBACK
    );

    const error = expectError(await service.resolveName('noaddr.eth'));
    expect(error.code).toBe('UNSUPPORTED_NAME');
    expect(l1GetEnsAddress).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Error Semantics — KEY never-silent-fallback (INV-10)
// ===========================================================================

describe('resolveName — KEY: bound failure NEVER falls through to L1 (INV-10)', () => {
  it.each([
    ['RESOLUTION_TIMEOUT', makeTimeoutError()],
    ['EXTERNAL_GATEWAY_ERROR via HttpRequestError', makeHttpError()],
  ])(
    'acceptance 3: bound %s → typed error; L1 getEnsAddress receives ZERO calls',
    async (_label, thrown) => {
      const boundGetEnsAddress = vi.fn().mockRejectedValue(thrown);
      const l1GetEnsAddress = vi.fn().mockResolvedValue(VITALIK_ADDRESS);
      const { bound, l1 } = makeForwardDualClients(boundGetEnsAddress, l1GetEnsAddress);
      const service = createEvmNameResolutionService(
        SEPOLIA_NETWORK_CONFIG,
        bound.client,
        l1.client,
        ENABLE_MAINNET_L1_MISS_FALLBACK
      );

      const error = expectError(await service.resolveName('vitalik.eth'));
      expect(error.code).not.toBe('NAME_NOT_FOUND');
      expect(l1GetEnsAddress).not.toHaveBeenCalled();
    }
  );
});

// ===========================================================================
// Error Semantics — L1 terminal discipline (INV-12, INV-13)
// ===========================================================================

describe('resolveName — L1 terminal outcomes (INV-12, INV-13)', () => {
  it('bound miss + L1 empty → NAME_NOT_FOUND (no third tier)', async () => {
    const boundGetEnsAddress = vi.fn().mockResolvedValue(null);
    const l1GetEnsAddress = vi.fn().mockResolvedValue(null);
    const { bound, l1 } = makeForwardDualClients(boundGetEnsAddress, l1GetEnsAddress);
    const service = createEvmNameResolutionService(
      SEPOLIA_NETWORK_CONFIG,
      bound.client,
      l1.client,
      ENABLE_MAINNET_L1_MISS_FALLBACK
    );

    expect(expectError(await service.resolveName('missing.eth')).code).toBe('NAME_NOT_FOUND');
    expect(l1GetEnsAddress).toHaveBeenCalledTimes(1);
  });

  it('bound miss + L1 gateway failure → typed error, never silent address', async () => {
    const boundGetEnsAddress = vi.fn().mockResolvedValue(null);
    const l1GetEnsAddress = vi.fn().mockRejectedValue(makeTimeoutError());
    const { bound, l1 } = makeForwardDualClients(boundGetEnsAddress, l1GetEnsAddress);
    const service = createEvmNameResolutionService(
      SEPOLIA_NETWORK_CONFIG,
      bound.client,
      l1.client,
      ENABLE_MAINNET_L1_MISS_FALLBACK
    );

    const error = expectError(await service.resolveName('vitalik.eth'));
    expect(error.code).toBe('RESOLUTION_TIMEOUT');
    expect(error.code).not.toBe('NAME_NOT_FOUND');
  });

  it('bound miss + L1 invalid address bytes → NAME_NOT_FOUND (M1), no triplet', async () => {
    const boundGetEnsAddress = vi.fn().mockResolvedValue(null);
    const l1GetEnsAddress = vi.fn().mockResolvedValue('0xdead');
    const { bound, l1 } = makeForwardDualClients(boundGetEnsAddress, l1GetEnsAddress);
    const service = createEvmNameResolutionService(
      SEPOLIA_NETWORK_CONFIG,
      bound.client,
      l1.client,
      ENABLE_MAINNET_L1_MISS_FALLBACK
    );

    const result = await service.resolveName('evil.eth');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NAME_NOT_FOUND');
  });
});

// ===========================================================================
// Error Semantics — strict:true on both clients (INV-14)
// ===========================================================================

describe('resolveName — strict:true on bound and L1 getEnsAddress (INV-14)', () => {
  it('both attempts pass strict:true on miss-fallback path', async () => {
    const boundGetEnsAddress = vi.fn().mockResolvedValue(null);
    const l1GetEnsAddress = vi.fn().mockResolvedValue(VITALIK_ADDRESS);
    const { bound, l1 } = makeForwardDualClients(boundGetEnsAddress, l1GetEnsAddress);
    const service = createEvmNameResolutionService(
      SEPOLIA_NETWORK_CONFIG,
      bound.client,
      l1.client,
      ENABLE_MAINNET_L1_MISS_FALLBACK
    );

    await service.resolveName('vitalik.eth');

    expect(boundGetEnsAddress.mock.calls[0][0]).toMatchObject({ strict: true });
    expect(l1GetEnsAddress.mock.calls[0][0]).toMatchObject({ strict: true });
  });
});

// ===========================================================================
// Idempotency & Retry — deterministic emission (INV-17, INV-19)
// ===========================================================================

describe('resolveName — deterministic forward L1-fallback outcomes (INV-17, INV-19)', () => {
  it('double-call under stable stubs yields identical triplet values', async () => {
    const { bound, l1 } = makeForwardDualClients(
      vi.fn().mockResolvedValue(null),
      vi.fn().mockResolvedValue(VITALIK_ADDRESS)
    );
    const service = createEvmNameResolutionService(
      SEPOLIA_NETWORK_CONFIG,
      bound.client,
      l1.client,
      ENABLE_MAINNET_L1_MISS_FALLBACK
    );

    const first = await service.resolveName('vitalik.eth');
    const second = await service.resolveName('vitalik.eth');
    expect(first).toEqual(second);
  });
});

// ===========================================================================
// Side-Effect Ordering — I/O sequence (INV-23)
// ===========================================================================

describe('resolveName — bound → L1 I/O ordering (INV-23)', () => {
  it('eligible bound miss consults L1 only after bound attempt completes', async () => {
    const callOrder: string[] = [];
    const boundGetEnsAddress = vi.fn().mockImplementation(async () => {
      callOrder.push('bound');
      return null;
    });
    const l1GetEnsAddress = vi.fn().mockImplementation(async () => {
      callOrder.push('l1');
      return VITALIK_ADDRESS;
    });
    const { bound, l1 } = makeForwardDualClients(boundGetEnsAddress, l1GetEnsAddress);
    const service = createEvmNameResolutionService(
      SEPOLIA_NETWORK_CONFIG,
      bound.client,
      l1.client,
      ENABLE_MAINNET_L1_MISS_FALLBACK
    );

    expectValue(await service.resolveName('vitalik.eth'));
    expect(callOrder).toEqual(['bound', 'l1']);
  });

  it('malformed name + opt-in ON → zero getEnsAddress calls (INV-24)', async () => {
    const boundGetEnsAddress = vi.fn();
    const l1GetEnsAddress = vi.fn();
    const { bound, l1 } = makeForwardDualClients(boundGetEnsAddress, l1GetEnsAddress);
    const service = createEvmNameResolutionService(
      SEPOLIA_NETWORK_CONFIG,
      bound.client,
      l1.client,
      ENABLE_MAINNET_L1_MISS_FALLBACK
    );

    expectError(await service.resolveName(VITALIK_ADDRESS));
    expect(boundGetEnsAddress).not.toHaveBeenCalled();
    expect(l1GetEnsAddress).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Resource Limits — bounded work spy counts (INV-26, INV-27)
// ===========================================================================

describe('resolveName — forward I/O budget (INV-26)', () => {
  it('opt-in ON eligible miss: bound=1, L1=1', async () => {
    const boundGetEnsAddress = vi.fn().mockResolvedValue(null);
    const l1GetEnsAddress = vi.fn().mockResolvedValue(VITALIK_ADDRESS);
    const { bound, l1 } = makeForwardDualClients(boundGetEnsAddress, l1GetEnsAddress);
    const service = createEvmNameResolutionService(
      SEPOLIA_NETWORK_CONFIG,
      bound.client,
      l1.client,
      ENABLE_MAINNET_L1_MISS_FALLBACK
    );

    expectValue(await service.resolveName('vitalik.eth'));
    expect(boundGetEnsAddress).toHaveBeenCalledTimes(1);
    expect(l1GetEnsAddress).toHaveBeenCalledTimes(1);
  });

  it('opt-in ON bound gateway failure: bound=1, L1=0', async () => {
    const boundGetEnsAddress = vi.fn().mockRejectedValue(makeHttpError());
    const l1GetEnsAddress = vi.fn().mockResolvedValue(VITALIK_ADDRESS);
    const { bound, l1 } = makeForwardDualClients(boundGetEnsAddress, l1GetEnsAddress);
    const service = createEvmNameResolutionService(
      SEPOLIA_NETWORK_CONFIG,
      bound.client,
      l1.client,
      ENABLE_MAINNET_L1_MISS_FALLBACK
    );

    expectError(await service.resolveName('vitalik.eth'));
    expect(boundGetEnsAddress).toHaveBeenCalledTimes(1);
    expect(l1GetEnsAddress).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Sensitive Data Handling — Principle II classifiers (INV-29, INV-30)
// ===========================================================================

describe('resolveName — chain-agnostic fallback classification (INV-29, INV-30)', () => {
  it('L1 miss-fallback success classifies via resolvedViaNetworkFallback only', async () => {
    const { bound, l1 } = makeForwardDualClients(
      vi.fn().mockResolvedValue(null),
      vi.fn().mockResolvedValue(VITALIK_ADDRESS)
    );
    const service = createEvmNameResolutionService(
      SEPOLIA_NETWORK_CONFIG,
      bound.client,
      l1.client,
      ENABLE_MAINNET_L1_MISS_FALLBACK
    );

    const value = expectValue(await service.resolveName('vitalik.eth'));
    expect(isCrossNetworkFallback(value.provenance)).toBe(true);
    expect(chainAgnosticScope(value.provenance)).toBe('global');
  });

  it('mainnet-bound forward hit without triplet does not imply cross-network fallback', async () => {
    const { client } = makeClient({ boundChainId: 1 });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);

    const value = expectValue(await service.resolveName('vitalik.eth'));
    expect(isCrossNetworkFallback(value.provenance)).toBe(false);
    expectNoFallbackTriplet(value.provenance);
  });
});
