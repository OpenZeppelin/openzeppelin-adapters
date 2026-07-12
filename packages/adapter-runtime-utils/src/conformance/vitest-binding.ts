import { expect, it } from 'vitest';

import { checkConformance } from './checker';
import type { ConformanceConfig } from './types';

/**
 * Thin vitest binding — the ONLY file in the conformance module that imports a test runner
 * (INV-23). Runs {@link checkConformance} ONCE at collection time (the capability calls run
 * over the caller's pinned substrate), then projects each `InvariantResult` onto exactly one
 * test, in report order (INV-19):
 *  - `PASS` → `it(key, () => {})`
 *  - `FAIL` → `it(key, () => expect.fail(message))`
 *  - `SKIPPED` → `it.skip(key)`
 *
 * MUST be awaited at the top level of a test file (vitest supports top-level await), because
 * results are captured before the `it()`s are emitted:
 *
 * ```ts
 * await describeConformance({ makeCapability, forwardVectors, reverseVectors });
 * ```
 *
 * It never classifies adapter behavior itself (that is `checkConformance`'s job) and never
 * merges, drops, or reorders results. The only exception it propagates is
 * `ConformanceConfigError` — a caller programmer-error that should fail collection loudly.
 */
export async function describeConformance(config: ConformanceConfig): Promise<void> {
  const report = await checkConformance(config);

  for (const result of report.results) {
    if (result.status === 'SKIPPED') {
      it.skip(result.key);
      continue;
    }
    if (result.status === 'FAIL') {
      it(result.key, () => {
        expect.fail(result.message);
      });
      continue;
    }
    it(result.key, () => {
      // PASS — presence of a green test documents the satisfied invariant/case.
    });
  }
}
