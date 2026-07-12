/**
 * SF-2 · `provenance.ts` — `baseEnsProvenance()` test suite.
 *
 * Verifies INV-5 (fixed user-safe shape `{ label: 'ENS', external: false }`, fresh per call, no v1
 * network-scoping) and the label half of INV-19 (`label` is the constant `'ENS'`, never a URL /
 * gateway host / keyed identifier — the property SF-4's conformance `label`-allowlist and UIKit
 * INV-16 enforce). INV-13's "fresh object per call, no aliased singleton" is verified here too.
 */
import { describe, expect, it } from 'vitest';

import type { ResolutionProvenance } from '@openzeppelin/ui-types';

import { baseEnsProvenance } from '../provenance';

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
