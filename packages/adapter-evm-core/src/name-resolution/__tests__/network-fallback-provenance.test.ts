/**
 * 003 SF-2 · Cross-network fallback provenance — integration + contract test suite.
 *
 * Golden-matrix coverage for triplet emission: present on UR bound-empty → L1 (reverse + forward),
 * absent on non-UR direct L1 reverse (001-1b parity), bound-local hits, and error paths.
 * Organized by invariant category; every `describe` names the invariant(s) it covers.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import type { ResolutionProvenance } from '@openzeppelin/ui-types';

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
  makeDualReverseClients,
  makeHttpError,
  makeTimeoutError,
  SEPOLIA_NETWORK_CONFIG,
  VITALIK_ADDRESS,
  VITALIK_NAME,
} from './fixtures';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROVENANCE_SOURCE = readFileSync(join(__dirname, '../provenance.ts'), 'utf8');
const SERVICE_SOURCE = readFileSync(join(__dirname, '../service.ts'), 'utf8');

// ===========================================================================
// Request/Response Contract — golden matrix (INV-5, INV-7, INV-8, INV-15)
// ===========================================================================

describe('resolveAddress — UR bound-empty → L1 emits triplet (INV-5, INV-7, INV-15)', () => {
  it('definitive empty signals each produce complete triplet after L1 success', async () => {
    const boundGetEnsName = vi.fn().mockResolvedValue(null);
    const l1GetEnsName = vi.fn().mockResolvedValue(VITALIK_NAME);
    const { bound, l1 } = makeDualReverseClients({ boundGetEnsName, l1GetEnsName });
    const service = createEvmNameResolutionService(
      SEPOLIA_NETWORK_CONFIG,
      bound.client,
      l1.client,
      ENABLE_MAINNET_L1_MISS_FALLBACK
    );

    const result = await service.resolveAddress(VITALIK_ADDRESS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expectCompleteFallbackTriplet(result.value.provenance, SEPOLIA_NETWORK_CONFIG.id);
    expect(chainAgnosticScope(result.value.provenance)).toBe('global');
  });
});

describe('resolveAddress — non-UR direct L1 omits triplet (INV-15, INV-22 parity)', () => {
  it('L2 direct L1 success: buildEnsProvenance only — no fallback fields', async () => {
    const { client: boundClient, getEnsName: boundGetEnsName } = makeClient({ supported: false });
    const l1GetEnsName = vi.fn().mockResolvedValue(VITALIK_NAME);
    const { client: l1Client } = makeClient({ getEnsName: l1GetEnsName, boundChainId: 1 });
    const service = createEvmNameResolutionService(
      L2_NETWORK_CONFIG,
      boundClient,
      l1Client,
      ENABLE_MAINNET_L1_MISS_FALLBACK
    );

    const result = await service.resolveAddress(VITALIK_ADDRESS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(boundGetEnsName).not.toHaveBeenCalled();
    expectNoFallbackTriplet(result.value.provenance);
    expect(isEnsProvenance(result.value.provenance)).toBe(true);
  });
});

describe('resolveName — UR bound miss → L1 emits triplet (INV-5, INV-7, SF-4 wiring)', () => {
  it('Sepolia bound NAME_NOT_FOUND then L1 hit spreads complete triplet', async () => {
    const boundGetEnsAddress = vi.fn().mockResolvedValue(null);
    const l1GetEnsAddress = vi.fn().mockResolvedValue(VITALIK_ADDRESS);
    const { bound, l1 } = makeDualReverseClients();
    bound.client.getEnsAddress = boundGetEnsAddress;
    l1.client.getEnsAddress = l1GetEnsAddress;
    const service = createEvmNameResolutionService(
      SEPOLIA_NETWORK_CONFIG,
      bound.client,
      l1.client,
      ENABLE_MAINNET_L1_MISS_FALLBACK
    );

    const result = await service.resolveName('vitalik.eth');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(boundGetEnsAddress).toHaveBeenCalledTimes(1);
    expect(l1GetEnsAddress).toHaveBeenCalledTimes(1);
    expectCompleteFallbackTriplet(result.value.provenance, SEPOLIA_NETWORK_CONFIG.id);
    expect(chainAgnosticScope(result.value.provenance)).toBe('global');
  });

  it('Sepolia bound hit does not emit fallback triplet', async () => {
    const boundGetEnsAddress = vi.fn().mockResolvedValue(VITALIK_ADDRESS);
    const l1GetEnsAddress = vi.fn().mockResolvedValue(VITALIK_ADDRESS);
    const { bound, l1 } = makeDualReverseClients();
    bound.client.getEnsAddress = boundGetEnsAddress;
    l1.client.getEnsAddress = l1GetEnsAddress;
    const service = createEvmNameResolutionService(
      SEPOLIA_NETWORK_CONFIG,
      bound.client,
      l1.client,
      ENABLE_MAINNET_L1_MISS_FALLBACK
    );

    const result = await service.resolveName('vitalik.eth');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(l1GetEnsAddress).not.toHaveBeenCalled();
    expectNoFallbackTriplet(result.value.provenance);
  });
});

describe('resolveName — non-UR forward 1b omits triplet (INV-22)', () => {
  it('L2 chain-scoped L1 success with opt-in ON has no fallback fields', async () => {
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

    const result = await service.resolveName('vitalik.eth');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expectNoFallbackTriplet(result.value.provenance);
    expect(boundGetEnsAddress).not.toHaveBeenCalled();
    expect(l1GetEnsAddress).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// Error Semantics — success-only provenance (INV-9, INV-11)
// ===========================================================================

describe('fallback triplet is success-only (INV-9)', () => {
  it('reverse bound gateway failure with opt-in ON returns error without fallback keys', async () => {
    const { bound, l1 } = makeDualReverseClients({
      boundGetEnsName: vi.fn().mockRejectedValue(makeHttpError()),
      l1GetEnsName: vi.fn().mockResolvedValue(VITALIK_NAME),
    });
    const service = createEvmNameResolutionService(
      SEPOLIA_NETWORK_CONFIG,
      bound.client,
      l1.client,
      ENABLE_MAINNET_L1_MISS_FALLBACK
    );

    const result = await service.resolveAddress(VITALIK_ADDRESS);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect('resolvedViaNetworkFallback' in result.error).toBe(false);
    expect(l1.getEnsName).not.toHaveBeenCalled();
  });

  it('reverse bound empty + L1 empty returns ADDRESS_NOT_FOUND without provenance', async () => {
    const { bound, l1 } = makeDualReverseClients({
      boundGetEnsName: vi.fn().mockResolvedValue(null),
      l1GetEnsName: vi.fn().mockResolvedValue(null),
    });
    const service = createEvmNameResolutionService(
      SEPOLIA_NETWORK_CONFIG,
      bound.client,
      l1.client,
      ENABLE_MAINNET_L1_MISS_FALLBACK
    );

    const result = await service.resolveAddress(VITALIK_ADDRESS);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('ADDRESS_NOT_FOUND');
  });

  it('forward bound miss + L1 NAME_NOT_FOUND terminal has no triplet on error', async () => {
    const boundGetEnsAddress = vi.fn().mockResolvedValue(null);
    const l1GetEnsAddress = vi.fn().mockResolvedValue(null);
    const { bound, l1 } = makeDualReverseClients();
    bound.client.getEnsAddress = boundGetEnsAddress;
    l1.client.getEnsAddress = l1GetEnsAddress;
    const service = createEvmNameResolutionService(
      SEPOLIA_NETWORK_CONFIG,
      bound.client,
      l1.client,
      ENABLE_MAINNET_L1_MISS_FALLBACK
    );

    const result = await service.resolveName('missing.eth');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NAME_NOT_FOUND');
    expect(l1GetEnsAddress).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// Idempotency & Retry — deterministic emission (INV-12, INV-13)
// ===========================================================================

describe('fallback provenance allocation (INV-12, INV-13)', () => {
  it('two successive UR bound-empty → L1 successes return referentially distinct provenance', async () => {
    const boundGetEnsName = vi.fn().mockResolvedValue(null);
    const l1GetEnsName = vi.fn().mockResolvedValue(VITALIK_NAME);
    const { bound, l1 } = makeDualReverseClients({ boundGetEnsName, l1GetEnsName });
    const service = createEvmNameResolutionService(
      SEPOLIA_NETWORK_CONFIG,
      bound.client,
      l1.client,
      ENABLE_MAINNET_L1_MISS_FALLBACK
    );

    const first = await service.resolveAddress(VITALIK_ADDRESS);
    const second = await service.resolveAddress(VITALIK_ADDRESS);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.provenance).not.toBe(second.value.provenance);
    expect(first.value.provenance).toEqual(second.value.provenance);
  });

  it('double-call under stable stubs yields identical triplet values', async () => {
    const { bound, l1 } = makeDualReverseClients({
      boundGetEnsName: vi.fn().mockResolvedValue(null),
      l1GetEnsName: vi.fn().mockResolvedValue(VITALIK_NAME),
    });
    const service = createEvmNameResolutionService(
      SEPOLIA_NETWORK_CONFIG,
      bound.client,
      l1.client,
      ENABLE_MAINNET_L1_MISS_FALLBACK
    );

    const first = await service.resolveAddress(VITALIK_ADDRESS);
    const second = await service.resolveAddress(VITALIK_ADDRESS);
    expect(first).toEqual(second);
  });
});

// ===========================================================================
// Sensitive Data Handling — Principle II classifiers (INV-19, INV-20, INV-25)
// ===========================================================================

describe('chain-agnostic fallback classification (INV-19, INV-20)', () => {
  it('classifies fallback using resolvedViaNetworkFallback only — not coinType', () => {
    const withTriplet: ResolutionProvenance = {
      label: 'ENS',
      external: false,
      resolvedViaNetworkFallback: true,
      queriedOnNetworkId: SEPOLIA_NETWORK_CONFIG.id,
      resolvedOnNetworkId: EVM_NETWORK_CONFIG.id,
    };
    const ensEnriched = { ...withTriplet, system: 'ens' as const, coinType: 60 };
    expect(isCrossNetworkFallback(withTriplet)).toBe(true);
    expect(isCrossNetworkFallback(ensEnriched)).toBe(true);
  });

  it('absent scopedToNetworkId on triplet success does not imply fallback without flag (INV-20)', () => {
    const mainnetHit: ResolutionProvenance = { label: 'ENS', external: false };
    expect(chainAgnosticScope(mainnetHit)).toBe('global');
    expect(isCrossNetworkFallback(mainnetHit)).toBe(false);
  });

  it('fallback triplet does not alter show/hide scope gate (INV-25)', () => {
    const fallbackHit: ResolutionProvenance = {
      label: 'ENS',
      external: false,
      resolvedViaNetworkFallback: true,
      queriedOnNetworkId: SEPOLIA_NETWORK_CONFIG.id,
      resolvedOnNetworkId: EVM_NETWORK_CONFIG.id,
    };
    expect(chainAgnosticScope(fallbackHit)).toBe('global');
    expect(chainAgnosticScope(fallbackHit)).toBe(
      chainAgnosticScope({ label: 'ENS', external: false })
    );
  });
});

// ===========================================================================
// Performance, Scalability & Re-usability — DRY builder audit (INV-23)
// ===========================================================================

describe('single DRY triplet emission site (INV-23)', () => {
  it('resolvedViaNetworkFallback is assigned only inside provenance.ts builder', () => {
    expect(PROVENANCE_SOURCE).toContain('resolvedViaNetworkFallback: true');
    expect(SERVICE_SOURCE).not.toMatch(/resolvedViaNetworkFallback\s*:\s*true/);
    expect(SERVICE_SOURCE).toContain('composeNetworkFallbackProvenance');
    expect(SERVICE_SOURCE).toContain('precededByBoundMiss');
  });
});

// ===========================================================================
// Auth Boundary — emission requires bound miss context (INV-14, INV-15)
// ===========================================================================

describe('precededByBoundMiss threads through reverse ladder (INV-15)', () => {
  it('bound transport failure with opt-in ON never reaches L1 — no triplet path', async () => {
    const { bound, l1 } = makeDualReverseClients({
      boundGetEnsName: vi.fn().mockRejectedValue(makeTimeoutError()),
      l1GetEnsName: vi.fn().mockResolvedValue(VITALIK_NAME),
    });
    const service = createEvmNameResolutionService(
      SEPOLIA_NETWORK_CONFIG,
      bound.client,
      l1.client,
      ENABLE_MAINNET_L1_MISS_FALLBACK
    );

    const result = await service.resolveAddress(VITALIK_ADDRESS);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('RESOLUTION_TIMEOUT');
    expect(l1.getEnsName).not.toHaveBeenCalled();
  });
});
