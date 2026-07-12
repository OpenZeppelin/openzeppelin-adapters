import { describe, expect, it } from 'vitest';

import { ConformanceConfigError } from '../types';
import { describeConformance } from '../vitest-binding';
import { FORWARD_VECTORS, makeCompliant, REVERSE_VECTORS } from './fixtures';

/**
 * INV-19 — `describeConformance` is a faithful, order-preserving projection of the report:
 * PASS/FAIL → `it`, SKIPPED → `it.skip`, one per `InvariantResult`, in report order, and the
 * only exception it propagates is `ConformanceConfigError` (a caller programmer-error that
 * should fail collection loudly).
 *
 * Emission is proven END-TO-END at collection time (below and in `binding.test.ts`): the
 * projected `it`s run green and the `it.skip`s show as skipped in the reporter. The optional
 * lifecycle family is included here so its result is proven to project too.
 *
 * A finer in-process spy on the exact `it`/`it.skip` call count and order (Code-stage Open Q1)
 * is NOT achievable without a runner-injection seam: the binding imports `it` from the `vitest`
 * ES-module namespace, whose exotic `[[Set]]`/`[[DefineOwnProperty]]` reject both `vi.spyOn`
 * and direct reassignment in-process. See the artifact's Out of Scope + Step-Back Suggestion.
 */

// End-to-end emission proof (collection-time): every projected result is a real vitest test.
// A guarded compliant capability with the lifecycle probe opted in → all PASS/SKIP, so this
// stays green while exercising the four required families AND the optional INV-26 projection.
await describeConformance({
  suiteName: 'binding-projection: compliant + lifecycle probe',
  makeCapability: () => makeCompliant(true),
  forwardVectors: FORWARD_VECTORS,
  reverseVectors: REVERSE_VECTORS,
  lifecycleProbe: true,
});

describe('INV-19 — projection exception behavior', () => {
  it('propagates ConformanceConfigError at collection (a caller programmer-error fails loudly)', async () => {
    await expect(describeConformance({ makeCapability: null as never })).rejects.toBeInstanceOf(
      ConformanceConfigError
    );
  });
});
