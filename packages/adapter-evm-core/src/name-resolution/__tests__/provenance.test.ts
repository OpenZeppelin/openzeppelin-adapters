/**
 * SF-2 · `provenance.ts` — provenance builders test suite.
 *
 * Covers `baseEnsProvenance()` (legacy SF-2 forward v1) and 003 cross-network fallback builders
 * (`networkFallbackProvenanceFields`, `composeNetworkFallbackProvenance`, `MAINNET_NETWORK_ID`).
 */
import { describe, expect, it } from 'vitest';

import type { ResolutionProvenance } from '@openzeppelin/ui-types';

import {
  expectNoFallbackTriplet,
  isCompleteNetworkFallbackProvenance,
  isCrossNetworkFallback,
} from './helpers/fallback-provenance';

import {
  baseEnsProvenance,
  boundReverseProvenance,
  composeNetworkFallbackProvenance,
  MAINNET_NETWORK_ID,
  networkFallbackProvenanceFields,
} from '../provenance';
import { EVM_NETWORK_CONFIG } from './fixtures';

describe('baseEnsProvenance — fixed user-safe shape (INV-5)', () => {
  it('deep-equals the canonical v1 forward provenance', () => {
    expect(baseEnsProvenance()).toEqual({ label: 'ENS', external: false });
  });

  it('sets external:false on the v1 forward path (no incidental-gateway claim)', () => {
    expect(baseEnsProvenance().external).toBe(false);
  });

  it('omits scopedToNetworkId entirely — network-scoping is SF-5, not v1', () => {
    const provenance: ResolutionProvenance = baseEnsProvenance();
    expect('scopedToNetworkId' in provenance).toBe(false);
    expect(provenance.scopedToNetworkId).toBeUndefined();
  });
});

describe('baseEnsProvenance — fresh allocation per call (INV-5 / INV-13)', () => {
  it('returns a NEW object each call — no shared/frozen singleton aliased into results', () => {
    const a = baseEnsProvenance();
    const b = baseEnsProvenance();
    expect(a).not.toBe(b); // distinct identity — mutating one result can never bleed into another
    expect(a).toEqual(b); // …but structurally identical
  });
});

describe('baseEnsProvenance — user-safe label (INV-19 / SF-4 allowlist)', () => {
  it('label is the fixed literal "ENS"', () => {
    expect(baseEnsProvenance().label).toBe('ENS');
  });

  it('label carries no URL scheme or key-shaped substring (leak-free)', () => {
    const { label } = baseEnsProvenance();
    expect(label).not.toMatch(/:\/\//); // no scheme://host — would fail SF-4's allowlist
    expect(label).not.toMatch(/[A-Za-z0-9_-]{16,}/); // no long key-shaped token
  });
});

// ===========================================================================
// SF-2 · networkFallbackProvenanceFields (INV-3, INV-6, INV-12, INV-18, INV-23, INV-28)
// ===========================================================================

describe('MAINNET_NETWORK_ID — canonical mainnet slug (INV-6, INV-24)', () => {
  it('equals the mainnet profile networkConfig.id fixture', () => {
    expect(MAINNET_NETWORK_ID).toBe(EVM_NETWORK_CONFIG.id);
  });
});

describe('networkFallbackProvenanceFields — triplet builder (INV-3, INV-28)', () => {
  it('returns the complete canonical fallback shape', () => {
    const fields = networkFallbackProvenanceFields({
      queriedOnNetworkId: 'ethereum-sepolia',
      resolvedOnNetworkId: MAINNET_NETWORK_ID,
    });
    expect(fields).toEqual({
      resolvedViaNetworkFallback: true,
      queriedOnNetworkId: 'ethereum-sepolia',
      resolvedOnNetworkId: MAINNET_NETWORK_ID,
    });
  });

  it('omits label, external, and scopedToNetworkId (INV-28)', () => {
    const fields = networkFallbackProvenanceFields({
      queriedOnNetworkId: 'ethereum-sepolia',
      resolvedOnNetworkId: MAINNET_NETWORK_ID,
    });
    expect('label' in fields).toBe(false);
    expect('external' in fields).toBe(false);
    expect('scopedToNetworkId' in fields).toBe(false);
  });

  it('returns a fresh object per call (INV-12)', () => {
    const args = {
      queriedOnNetworkId: 'ethereum-sepolia',
      resolvedOnNetworkId: MAINNET_NETWORK_ID,
    };
    const a = networkFallbackProvenanceFields(args);
    const b = networkFallbackProvenanceFields(args);
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe('composeNetworkFallbackProvenance — spread composition (INV-28)', () => {
  it('preserves base label/external/scope while adding triplet keys', () => {
    const base: ResolutionProvenance = {
      label: 'ENS via external gateway',
      external: true,
      scopedToNetworkId: 'ethereum-sepolia',
    };
    const composed = composeNetworkFallbackProvenance(base, {
      queriedOnNetworkId: 'ethereum-sepolia',
      resolvedOnNetworkId: MAINNET_NETWORK_ID,
    });
    expect(composed.label).toBe('ENS via external gateway');
    expect(composed.external).toBe(true);
    expect(composed.scopedToNetworkId).toBe('ethereum-sepolia');
    expect(composed.resolvedViaNetworkFallback).toBe(true);
    expect(composed.queriedOnNetworkId).toBe('ethereum-sepolia');
    expect(composed.resolvedOnNetworkId).toBe(MAINNET_NETWORK_ID);
  });
});

describe('boundReverseProvenance — non-fallback bound-local shape (INV-8)', () => {
  it('carries scopedToNetworkId and no fallback triplet', () => {
    const provenance = boundReverseProvenance('ethereum-sepolia');
    expect(provenance).toEqual({
      label: 'ENS',
      external: false,
      scopedToNetworkId: 'ethereum-sepolia',
    });
    expectNoFallbackTriplet(provenance);
  });
});

describe('fallback classifiers — integrity negatives (INV-3, INV-4, INV-20)', () => {
  it('orphan ids without resolvedViaNetworkFallback === true are not fallback', () => {
    const orphan: ResolutionProvenance = {
      label: 'ENS',
      external: false,
      queriedOnNetworkId: 'ethereum-sepolia',
      resolvedOnNetworkId: MAINNET_NETWORK_ID,
    };
    expect(isCrossNetworkFallback(orphan)).toBe(false);
    expect(isCompleteNetworkFallbackProvenance(orphan)).toBe(false);
  });

  it('mainnet-bound baseEnsProvenance (absent scope, no triplet) is not fallback', () => {
    const provenance = baseEnsProvenance();
    expectNoFallbackTriplet(provenance);
    expect(isCrossNetworkFallback(provenance)).toBe(false);
  });
});
