/**
 * SF-4 · SC-005 proof — the REAL EVM `NameResolutionCapability` graded by the shared conformance gate.
 *
 * This is the headline "Pattern 1" wiring from
 * `@openzeppelin/adapter-runtime-utils/docs/conformance/integration-guide.md`: the compliant run lives
 * in the ADAPTER's own suite (never in `adapter-runtime-utils`), so the harness keeps its
 * zero-concrete-adapter-dependency property and no `adapter-runtime-utils → adapter-evm-core →
 * adapter-runtime-utils` cycle is created. Here `createNameResolution` (SF-2 forward + SF-3 reverse) is
 * driven over a **pinned, deterministic** mock viem client so the four required UIKit contract families
 * grade the ADAPTER, not the network:
 *
 *   - INV-6  — reverse `forwardVerified` is a concrete boolean.
 *   - INV-8  — expected failures never throw; they return an in-union typed error code.
 *   - INV-12 — resolution is deterministic under stable substrate state (called twice, compared).
 *   - INV-16 — `provenance.label` is user-safe under `DEFAULT_LABEL_POLICY`.
 *
 * Plus the OPTIONAL INV-26 lifecycle family (opt-in): it positively verifies the sole *sanctioned*
 * throw — a post-`dispose()` call raising `RuntimeDisposedError` — actually fires.
 *
 * `describeConformance` (top-level `await`) emits one green `it()` per invariant × case (the canonical
 * projection). The trailing `describe` re-runs the pure `checkConformance` core and asserts the SC-005
 * headline directly: `report.passed === true` with every required family PASS-and-no-FAIL. Both share
 * ONE config, so the two views can never diverge.
 *
 * The substrate is INPUT-AWARE on purpose: a single `makeCapability` closure services every vector, so
 * the mock must answer `vitalik.eth` / VITALIK_ADDRESS with the happy path and the failure inputs
 * (`nope.eth`, the zero address) with an empty record — driving NAME_NOT_FOUND / ADDRESS_NOT_FOUND from
 * the real adapter code, not from a hard-wired mock verdict.
 */
import { describe, expect, it, vi } from 'vitest';

import { checkConformance } from '@openzeppelin/adapter-runtime-utils/conformance';
import type {
  ConformanceConfig,
  ForwardVector,
  InvariantId,
  ReverseVector,
} from '@openzeppelin/adapter-runtime-utils/conformance';
import { describeConformance } from '@openzeppelin/adapter-runtime-utils/conformance/vitest';
import type { NameResolutionCapability } from '@openzeppelin/ui-types';

import { createNameResolution } from '../../capabilities/name-resolution';
import { EVM_NETWORK_CONFIG, makeClient, VITALIK_ADDRESS, VITALIK_NAME } from './fixtures';

/** The zero address — a well-formed EVM address with no reverse record → drives ADDRESS_NOT_FOUND. */
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/** An unregistered name the pinned resolver answers with an empty record → drives NAME_NOT_FOUND. */
const UNREGISTERED_NAME = 'nope.eth';

/**
 * The single DI seam (RS-TCK `createPublisher`): a FRESH capability per case over a PINNED,
 * deterministic substrate. The harness calls this once per case and never disposes required-family
 * instances. The mock is input-aware so one factory can serve both happy-path and failure vectors:
 *
 *   - `getEnsAddress` → VITALIK_ADDRESS only for `vitalik.eth`, else `null` (empty record → the SF-2
 *     never-throw NAME_NOT_FOUND path).
 *   - `getEnsName`    → VITALIK_NAME only for VITALIK_ADDRESS, else `null` (empty record → the SF-3
 *     never-throw ADDRESS_NOT_FOUND path).
 *
 * `getEnsAvatar` keeps the fixture default (a stable URL); avatar is excluded from the INV-12 compare
 * (`stableAvatarSurface: false`), so it never destabilizes determinism.
 */
const makeCapability = (): NameResolutionCapability => {
  const { client } = makeClient({
    getEnsAddress: vi.fn(async (args: { name: string }) =>
      args.name === VITALIK_NAME ? VITALIK_ADDRESS : null
    ),
    getEnsName: vi.fn(async (args: { address: string }) =>
      args.address.toLowerCase() === VITALIK_ADDRESS.toLowerCase() ? VITALIK_NAME : null
    ),
  });
  return createNameResolution(EVM_NETWORK_CONFIG, { publicClient: client });
};

const forwardVectors: readonly ForwardVector[] = [
  { input: VITALIK_NAME, expect: { ok: true } },
  { input: UNREGISTERED_NAME, expect: { ok: false, code: 'NAME_NOT_FOUND' } },
];

const reverseVectors: readonly ReverseVector[] = [
  { input: VITALIK_ADDRESS, expect: { ok: true } },
  { input: ZERO_ADDRESS, expect: { ok: false, code: 'ADDRESS_NOT_FOUND' } },
];

/** ONE config, shared by the vitest projection and the direct pure-core assertion — they can't drift. */
const config: ConformanceConfig = {
  suiteName: 'adapter-evm-core NameResolutionCapability (SC-005)',
  makeCapability,
  forwardVectors,
  reverseVectors,
  stableAvatarSurface: false, // avatar is excluded from the determinism compare (the default)
  lifecycleProbe: true, // opt into INV-26: positively verify the post-dispose sanctioned throw fires
};

// The canonical projection: one green it() per invariant × case. Top-level await is mandatory — the
// capability calls run at collection time, before the it()s are emitted (see integration-guide.md).
await describeConformance(config);

/**
 * The SC-005 headline, asserted directly on the pure-core report so a regression names the exact
 * family. A REAL compliant adapter over a pinned substrate must yield `report.passed === true`, with
 * every required family carrying ≥1 PASS and ZERO FAIL.
 */
describe('SC-005 — the real EVM NameResolutionCapability passes conformance', () => {
  /** The four required UIKit contract families (INV-26 is optional; EXPECT is fidelity, not a family). */
  const REQUIRED_FAMILIES: readonly InvariantId[] = ['INV-6', 'INV-8', 'INV-12', 'INV-16'];

  it('report.passed is true — no required family FAILs', async () => {
    const report = await checkConformance(config);

    const failures = report.results.filter((r) => r.status === 'FAIL');
    // A named diagnostic so a red run tells the reader exactly which invariant × case broke.
    expect(
      failures.map((f) => `${f.key}: ${f.message}`),
      'expected zero conformance FAILs'
    ).toEqual([]);
    expect(report.passed).toBe(true);
  });

  it.each(REQUIRED_FAMILIES)('required family %s: ≥1 PASS and 0 FAIL', async (family) => {
    const report = await checkConformance(config);
    const inFamily = report.results.filter((r) => r.invariant === family);

    expect(
      inFamily.length,
      `${family} produced no results — the family did not run`
    ).toBeGreaterThan(0);
    expect(
      inFamily.filter((r) => r.status === 'FAIL').map((f) => `${f.key}: ${f.message}`),
      `${family} must have zero FAILs`
    ).toEqual([]);
    expect(
      inFamily.some((r) => r.status === 'PASS'),
      `${family} must contribute at least one PASS (not all SKIPPED)`
    ).toBe(true);
  });

  it('reverse family is graded, not SKIPPED — SF-3 resolveAddress is wired (INV-6 applies)', async () => {
    const report = await checkConformance(config);
    // INV-6 is reverse-only; a PASS here proves the reverse path (and thus resolveAddress) was exercised.
    const inv6 = report.results.filter((r) => r.invariant === 'INV-6');
    expect(inv6.length).toBeGreaterThan(0);
    expect(inv6.every((r) => r.status === 'PASS')).toBe(true);
  });

  it('INV-26 lifecycle: the post-dispose call raises the sanctioned RuntimeDisposedError', async () => {
    const report = await checkConformance(config);
    const inv26 = report.results.filter((r) => r.invariant === 'INV-26');
    expect(inv26.length).toBe(1);
    expect(inv26[0]?.status).toBe('PASS');
  });
});
