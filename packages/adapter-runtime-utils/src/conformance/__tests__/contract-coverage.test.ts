import { describe, expect, it } from 'vitest';

import type { ResolvedName } from '@openzeppelin/ui-types';

import { checkConformance } from '../checker';
import { checkForwardVerified } from '../checks/forward-verified';
import type { CheckStatus, InvariantId } from '../types';
import {
  compliantForward,
  FORWARD_VECTORS,
  makeCompliant,
  makeStub,
  REVERSE_VECTORS,
} from './fixtures';

/**
 * Request/Response contract coverage for the harness's report surface:
 * INV-1 (report shape + `passed` computed), INV-2 (total, exactly-once coverage),
 * INV-3 (invariant-numbered, unique keys + collision dedup), INV-4 (UIKit INV-6
 * concrete-boolean, the truthiness-vs-`typeof` boundary), INV-6 (vector-expectation
 * fidelity — the forward-direction EXPECT path the Code-stage seeded suite left uncovered).
 */

const VALID_INVARIANTS: ReadonlySet<InvariantId> = new Set([
  'INV-6',
  'INV-8',
  'INV-12',
  'INV-16',
  'EXPECT',
  'INV-26',
]);
const VALID_STATUSES: ReadonlySet<CheckStatus> = new Set(['PASS', 'FAIL', 'SKIPPED']);

/** Build a `ResolvedName` while injecting an adversarial (possibly non-boolean) forwardVerified. */
function resolvedNameWith(forwardVerified: unknown): ResolvedName {
  return {
    address: '0xabc',
    name: 'a.eth',
    // Deliberate single-step boundary cast: INV-4 must be probed with non-boolean inputs an
    // honest adapter type would forbid. `checkForwardVerified` reads the field as `unknown`.
    forwardVerified: forwardVerified as boolean,
    provenance: { label: 'ENS', external: false },
  };
}

describe('INV-1 — report shape and computed `passed`', () => {
  it('every result carries a valid invariant, status, non-empty key and message', async () => {
    const report = await checkConformance({
      makeCapability: () => makeCompliant(),
      forwardVectors: FORWARD_VECTORS,
      reverseVectors: REVERSE_VECTORS,
    });
    expect(report.results.length).toBeGreaterThan(0);
    for (const r of report.results) {
      expect(VALID_INVARIANTS.has(r.invariant)).toBe(true);
      expect(VALID_STATUSES.has(r.status)).toBe(true);
      expect(typeof r.key).toBe('string');
      expect(r.key.length).toBeGreaterThan(0);
      expect(typeof r.message).toBe('string');
      expect(r.message.length).toBeGreaterThan(0);
    }
  });

  it('`passed` is exactly `results.every(status !== FAIL)` — never an independent flag', async () => {
    // A stub with a non-user-safe label produces a mix of PASS + one FAIL.
    const report = await checkConformance({
      makeCapability: () =>
        makeStub({
          resolveName: (input) => {
            const r = compliantForward(input);
            return r.ok
              ? {
                  ok: true,
                  value: { ...r.value, provenance: { label: 'http://x', external: true } },
                }
              : r;
          },
        }),
      forwardVectors: [{ input: 'vitalik.eth', expect: { ok: true } }],
    });
    const recomputed = report.results.every((r) => r.status !== 'FAIL');
    expect(report.passed).toBe(recomputed);
    expect(report.passed).toBe(false); // the FAIL is present, so the report must fail
  });

  it('a SKIPPED-only report still passes (SKIPPED never contributes to failure)', async () => {
    const report = await checkConformance({
      makeCapability: () => makeStub({}), // neither method
      forwardVectors: FORWARD_VECTORS,
      reverseVectors: REVERSE_VECTORS,
    });
    expect(report.results.some((r) => r.status === 'SKIPPED')).toBe(true);
    expect(report.results.some((r) => r.status === 'FAIL')).toBe(false);
    expect(report.passed).toBe(true);
  });
});

describe('INV-2 — total, exactly-once case coverage', () => {
  it('emits exactly one result per applicable (family × case) with no drops', async () => {
    const report = await checkConformance({
      makeCapability: () => makeCompliant(),
      forwardVectors: FORWARD_VECTORS, // [success, failure]
      reverseVectors: REVERSE_VECTORS, // [success, failure]
    });
    // forward success → INV-16 + INV-12 (2); forward failure → INV-8 + INV-12 (2);
    // reverse success → INV-6 + INV-16 + INV-12 (3); reverse failure → INV-8 + INV-12 (2) = 9.
    expect(report.results).toHaveLength(9);
    const expectedKeys = [
      'inv16_forward_vitalik_eth_labelUserSafe',
      'inv12_forward_vitalik_eth_deterministic',
      'inv8_forward_NAME_NOT_FOUND_neverThrows',
      'inv12_forward_no_such_name_eth_deterministic',
      'inv6_0xd8da6bf26964af9d7eed9e03e53415d37aa96045_forwardVerifiedConcreteBoolean',
      'inv16_reverse_0xd8da6bf26964af9d7eed9e03e53415d37aa96045_labelUserSafe',
      'inv12_reverse_0xd8da6bf26964af9d7eed9e03e53415d37aa96045_deterministic',
      'inv8_reverse_ADDRESS_NOT_FOUND_neverThrows',
      'inv12_reverse_0x0000000000000000000000000000000000000000_deterministic',
    ];
    const actualKeys = report.results.map((r) => r.key).sort();
    expect(actualKeys).toEqual([...expectedKeys].sort());
  });

  it('an absent-method failure vector SKIPs INV-8 + INV-12 rather than dropping them', async () => {
    const report = await checkConformance({
      makeCapability: () => makeStub({ resolveName: compliantForward }), // no resolveAddress
      reverseVectors: [{ input: '0xzero', expect: { ok: false, code: 'ADDRESS_NOT_FOUND' } }],
    });
    const skipped = report.results.filter((r) => r.status === 'SKIPPED');
    expect(skipped.map((r) => r.invariant).sort()).toEqual(['INV-12', 'INV-8']);
    expect(report.passed).toBe(true);
  });
});

describe('INV-3 — invariant-numbered, unique keys with collision dedup', () => {
  it('each key is prefixed with the tag matching its invariant family', async () => {
    const report = await checkConformance({
      makeCapability: () => makeCompliant(),
      forwardVectors: FORWARD_VECTORS,
      reverseVectors: REVERSE_VECTORS,
    });
    const prefix: Record<InvariantId, string> = {
      'INV-6': 'inv6_',
      'INV-8': 'inv8_',
      'INV-12': 'inv12_',
      'INV-16': 'inv16_',
      EXPECT: 'inv_expect_',
      'INV-26': 'inv26_',
    };
    for (const r of report.results) {
      expect(r.key.startsWith(prefix[r.invariant])).toBe(true);
    }
  });

  it('two vectors sharing a label produce distinct keys (a `_2` suffix disambiguates)', async () => {
    const report = await checkConformance({
      makeCapability: () =>
        makeStub({
          resolveName: (input) => ({
            ok: true,
            value: { name: input, address: '0xabc', provenance: { label: 'ENS', external: false } },
          }),
        }),
      forwardVectors: [
        { input: 'first.eth', label: 'dup', expect: { ok: true } },
        { input: 'second.eth', label: 'dup', expect: { ok: true } },
      ],
    });
    const keys = report.results.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length); // all unique despite the label collision
    expect(keys.some((k) => k.endsWith('_2'))).toBe(true); // the deduper fired
  });
});

describe('INV-4 — UIKit INV-6 fidelity: forwardVerified is a CONCRETE boolean', () => {
  it('`typeof`, not truthiness: false PASSes, true PASSes', () => {
    expect(checkForwardVerified(resolvedNameWith(false)).status).toBe('PASS');
    expect(checkForwardVerified(resolvedNameWith(true)).status).toBe('PASS');
  });

  it('a missing / undefined / non-boolean value FAILs', () => {
    expect(checkForwardVerified(resolvedNameWith(undefined)).status).toBe('FAIL');
    expect(checkForwardVerified(resolvedNameWith('true')).status).toBe('FAIL'); // string, not boolean
    expect(checkForwardVerified(resolvedNameWith(1)).status).toBe('FAIL'); // number, not boolean
    expect(checkForwardVerified(resolvedNameWith(null)).status).toBe('FAIL');
  });

  it('end-to-end: a forwardVerified:false reverse adapter PASSes UIKit INV-6', async () => {
    const report = await checkConformance({
      makeCapability: () =>
        makeStub({
          resolveAddress: (input) => ({
            ok: true,
            value: {
              address: input,
              name: 'vitalik.eth',
              forwardVerified: false, // concrete boolean — MUST NOT be misread as "missing"
              provenance: { label: 'ENS', external: false },
            },
          }),
        }),
      reverseVectors: [{ input: '0xabc', expect: { ok: true } }],
    });
    const inv6 = report.results.find((r) => r.invariant === 'INV-6');
    expect(inv6?.status).toBe('PASS');
    expect(report.passed).toBe(true);
  });
});

describe('INV-6 — vector-expectation fidelity (forward direction)', () => {
  it('declared ok:true forward returning {ok:false} → EXPECT FAIL + INV-16/INV-12 SKIPPED, no INV-6', async () => {
    const report = await checkConformance({
      makeCapability: () =>
        makeStub({
          resolveName: (input) => ({ ok: false, error: { code: 'NAME_NOT_FOUND', name: input } }),
        }),
      forwardVectors: [{ input: 'ghost.eth', label: 'ghost', expect: { ok: true } }],
    });
    expect(report.passed).toBe(false);
    const expectResult = report.results.find((r) => r.invariant === 'EXPECT');
    expect(expectResult?.status).toBe('FAIL');
    expect(expectResult?.key).toBe('inv_expect_forward_ghost_expectedSuccessGotFailure');
    expect(report.results.find((r) => r.invariant === 'INV-16')?.status).toBe('SKIPPED');
    expect(report.results.find((r) => r.invariant === 'INV-12')?.status).toBe('SKIPPED');
    // Forward has no UIKit INV-6 family — it must not appear.
    expect(report.results.some((r) => r.invariant === 'INV-6')).toBe(false);
  });
});
