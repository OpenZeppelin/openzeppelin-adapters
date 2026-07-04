/**
 * SF-5 · `ens-provenance.ts` — `EnsProvenance` type + `isEnsProvenance` guard + builders test suite.
 *
 * The pure, client-free half of SF-5: the observable-facts provenance extension and its narrowing
 * guard. These functions have no I/O, so they are verified directly (the service-level observation of
 * `external`, race-freedom, and client selection live in `service.ens-v2.test.ts`).
 *
 * Organized by invariant:
 *   Req/Res — INV-3 (fresh per build), INV-4 (strict superset), INV-5 (`system` discriminant),
 *   INV-6 (`coinType` number range), INV-7 (`scopedToNetworkId` iff chain-scoped), INV-8 (curated
 *   label), INV-9 (label⇄external coupling at the build site), INV-10 (sound guard, SC-005).
 *   Error Semantics — INV-16 (`deriveCoinType` throw surface).
 *   Idempotency — INV-19 (deterministic, distinct-identity builds).
 *
 * Type-level invariants (INV-4/5/6 shapes, INV-26 optionality) are asserted with `expectTypeOf` and
 * enforced by `tsc --noEmit`; every runtime property additionally has a value assertion.
 */
import { EnsInvalidChainIdError } from 'viem';
import { describe, expect, expectTypeOf, it } from 'vitest';

import type { ResolutionProvenance } from '@openzeppelin/ui-types';

import {
  buildEnsProvenance,
  deriveCoinType,
  isEnsProvenance,
  scopedNetworkId,
  type EnsProvenance,
} from '../ens-provenance';
import { baseEnsProvenance } from '../provenance';
import { BASE_CHAIN_ID, BASE_COIN_TYPE, BASE_COIN_TYPE_BIGINT } from './fixtures';

/** The SF-4 user-safe label allowlist the two curated literals must satisfy (INV-8). */
const LABEL_ALLOWLIST = /^[A-Za-z][A-Za-z0-9 ]{0,63}$/;

// ===========================================================================
// Request/Response Contract
// ===========================================================================

describe('EnsProvenance — strict superset of an UNCHANGED base ResolutionProvenance (INV-4)', () => {
  it('is assignable to the base type — every base field is present on the extension', () => {
    // Type-level: EnsProvenance MUST remain assignable to ResolutionProvenance (superset, not fork).
    expectTypeOf<EnsProvenance>().toMatchTypeOf<ResolutionProvenance>();
    // Runtime: a built value carries every base field plus the two SF-5 extensions.
    const p = buildEnsProvenance({ external: false, coinType: 60n, networkId: 'ethereum-mainnet' });
    expect(p).toHaveProperty('label'); // base
    expect(p).toHaveProperty('external'); // base
    expect(p).toHaveProperty('system'); // extension
    expect(p).toHaveProperty('coinType'); // extension
    // A base-typed consumer keeps reading base fields with no widening/narrowing.
    const asBase: ResolutionProvenance = p;
    expect(asBase.external).toBe(false);
  });
});

describe('EnsProvenance — `system` is always the literal "ens" (INV-5)', () => {
  it('sets system unconditionally on both external states, and carries no `version` field', () => {
    expect(buildEnsProvenance({ external: false, coinType: 60n, networkId: 'n' }).system).toBe(
      'ens'
    );
    expect(buildEnsProvenance({ external: true, coinType: 60n, networkId: 'n' }).system).toBe(
      'ens'
    );
    // The stale `version: 'v1'|'v2'` sketch was deliberately NOT carried (G4) — assert it is absent.
    const p = buildEnsProvenance({ external: false, coinType: 60n, networkId: 'n' });
    expect('version' in p).toBe(false);
    expectTypeOf<EnsProvenance['system']>().toEqualTypeOf<'ens'>();
  });
});

describe('EnsProvenance — `coinType` is a safe-integer number, always set (INV-6)', () => {
  it('stores mainnet as the number 60 (not 60n)', () => {
    const p = buildEnsProvenance({ external: false, coinType: 60n, networkId: 'n' });
    expect(p.coinType).toBe(60);
    expect(typeof p.coinType).toBe('number');
    expectTypeOf<EnsProvenance['coinType']>().toEqualTypeOf<number>();
  });

  it('stores a chain-scoped coinType as a safe-integer number (Base → 2147492101)', () => {
    const p = buildEnsProvenance({
      external: false,
      coinType: BASE_COIN_TYPE_BIGINT,
      networkId: 'base-mainnet',
    });
    expect(p.coinType).toBe(BASE_COIN_TYPE);
    expect(Number.isSafeInteger(p.coinType)).toBe(true);
    // JSON-serializable (the bigint-store hazard the invariant guards against).
    expect(() => JSON.stringify(p)).not.toThrow();
  });
});

describe('EnsProvenance — `scopedToNetworkId` present IFF chain-scoped (INV-7 / scenario-1)', () => {
  it('is ABSENT (key-not-present, not undefined) on a mainnet-bound (coinType 60) result', () => {
    const p = buildEnsProvenance({ external: false, coinType: 60n, networkId: 'ethereum-mainnet' });
    expect('scopedToNetworkId' in p).toBe(false);
  });

  it('equals the BOUND network id on a chain-scoped (coinType !== 60) result — never mainnet, never CAIP-2', () => {
    const p = buildEnsProvenance({
      external: false,
      coinType: BASE_COIN_TYPE_BIGINT,
      networkId: 'base-mainnet',
    });
    expect(p.scopedToNetworkId).toBe('base-mainnet');
    expect(p.scopedToNetworkId).not.toBe('ethereum-mainnet'); // not the resolving client's chain
    expect(p.scopedToNetworkId).not.toMatch(/:/); // not a CAIP-2 string
  });

  it('scopedNetworkId helper is the single "scoped iff not mainnet" rule source', () => {
    expect(scopedNetworkId(60n, 'base-mainnet')).toBeUndefined();
    expect(scopedNetworkId(BASE_COIN_TYPE_BIGINT, 'base-mainnet')).toBe('base-mainnet');
  });
});

describe('EnsProvenance — label is a curated user-safe literal chosen from external (INV-8 / INV-9)', () => {
  it('is "ENS" when external is false and "ENS via external gateway" when true', () => {
    expect(buildEnsProvenance({ external: false, coinType: 60n, networkId: 'n' }).label).toBe(
      'ENS'
    );
    expect(buildEnsProvenance({ external: true, coinType: 60n, networkId: 'n' }).label).toBe(
      'ENS via external gateway'
    );
  });

  it('both literals satisfy the SF-4 allowlist and contain no URL / key / hex / control chars', () => {
    for (const external of [false, true]) {
      const { label } = buildEnsProvenance({ external, coinType: 60n, networkId: 'n' });
      expect(label).toMatch(LABEL_ALLOWLIST);
      expect(label).not.toMatch(/:\/\//); // no URL scheme
      expect(label).not.toMatch(/@/);
      expect(label).not.toMatch(/0x[0-9a-fA-F]{6,}/); // no address-shaped substring

      expect(label).not.toMatch(/[\u0000-\u001f\u007f]/); // no control chars
    }
  });

  it('label reflects the observed external verbatim (never inferred elsewhere — INV-9 at the build site)', () => {
    // The build site is the SOLE place label is chosen; it tracks the `external` arg exactly.
    expect(buildEnsProvenance({ external: true, coinType: 60n, networkId: 'n' }).external).toBe(
      true
    );
    expect(buildEnsProvenance({ external: false, coinType: 60n, networkId: 'n' }).external).toBe(
      false
    );
  });
});

describe('isEnsProvenance — total, pure, SOUND guard narrowing on `system` (INV-10 / SC-005)', () => {
  it('returns true for EnsProvenance built on either branch (mainnet-bound and chain-scoped)', () => {
    expect(
      isEnsProvenance(buildEnsProvenance({ external: false, coinType: 60n, networkId: 'n' }))
    ).toBe(true);
    expect(
      isEnsProvenance(
        buildEnsProvenance({ external: true, coinType: BASE_COIN_TYPE_BIGINT, networkId: 'base' })
      )
    ).toBe(true);
  });

  it('returns false for SF-3 reverse base provenance (no `system`)', () => {
    expect(isEnsProvenance(baseEnsProvenance())).toBe(false);
  });

  it('returns false for a base provenance that merely DISPLAYS "ENS" — proves no label string-matching', () => {
    // The exact violation scenario: a guard keyed on label would wrongly narrow this.
    expect(isEnsProvenance({ label: 'ENS', external: false })).toBe(false);
    expect(isEnsProvenance({ label: 'ENS via external gateway', external: true })).toBe(false);
  });

  it('is total and never throws on a malformed / partial / empty input', () => {
    expect(() => isEnsProvenance({} as ResolutionProvenance)).not.toThrow();
    expect(isEnsProvenance({} as ResolutionProvenance)).toBe(false);
    // A non-EVM adapter's provenance (arbitrary system-less shape) → false, no throw.
    expect(isEnsProvenance({ label: 'Solana Naming', external: false })).toBe(false);
  });

  it('narrows the static type so `coinType` is accessible after a true (type-level, SC-005)', () => {
    const p: ResolutionProvenance = buildEnsProvenance({
      external: false,
      coinType: 60n,
      networkId: 'n',
    });
    if (isEnsProvenance(p)) {
      expectTypeOf(p).toEqualTypeOf<EnsProvenance>();
      expect(p.coinType).toBe(60); // reachable only because the guard narrowed
    } else {
      throw new Error('guard should have narrowed a built EnsProvenance');
    }
  });
});

// ===========================================================================
// Error Semantics
// ===========================================================================

describe('deriveCoinType — ENSIP-9/11 forward map + contained throw surface (INV-16 / INV-6)', () => {
  it('maps mainnet (1) → 60n and Base (8453) → 2147492101n', () => {
    expect(deriveCoinType(1)).toBe(60n);
    expect(deriveCoinType(BASE_CHAIN_ID)).toBe(BASE_COIN_TYPE_BIGINT);
    expectTypeOf(deriveCoinType).returns.toEqualTypeOf<bigint>();
  });

  it('throws viem EnsInvalidChainIdError for an out-of-range / non-EVM chainId (caught by the service)', () => {
    expect(() => deriveCoinType(2 ** 40)).toThrow(EnsInvalidChainIdError);
    expect(() => deriveCoinType(-1)).toThrow(EnsInvalidChainIdError);
  });
});

// ===========================================================================
// Idempotency & Retry
// ===========================================================================

describe('buildEnsProvenance — fresh, deterministic, distinct-identity builds (INV-3 / INV-19)', () => {
  it('two builds with equal args are deep-equal but distinct objects (never a shared singleton)', () => {
    const a = buildEnsProvenance({ external: false, coinType: 60n, networkId: 'n' });
    const b = buildEnsProvenance({ external: false, coinType: 60n, networkId: 'n' });
    expect(a).toEqual(b); // structurally equal
    expect(a).not.toBe(b); // fresh object per call
  });

  it('is not frozen-shared across differing inputs — each call reflects its own args', () => {
    const mainnet = buildEnsProvenance({ external: false, coinType: 60n, networkId: 'ethereum' });
    const scoped = buildEnsProvenance({
      external: true,
      coinType: BASE_COIN_TYPE_BIGINT,
      networkId: 'base',
    });
    expect(mainnet).not.toEqual(scoped);
    expect('scopedToNetworkId' in mainnet).toBe(false);
    expect(scoped.scopedToNetworkId).toBe('base');
  });
});
