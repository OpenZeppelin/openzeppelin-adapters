/**
 * SF-2 · `service.ts` — the `normalizeName`-throw backstop (INV-11, site 2 / INV-12 level 3).
 *
 * Isolated in its own file because it requires mocking `name-validation` so that `isValidName`
 * passes the step-2 shape gate but `normalizeName` STILL throws at step 3 — a state real inputs can't
 * reach (both call the same deterministic `normalize`), yet the code path (D-D backstop) must be
 * covered. The mock is file-scoped, so the rest of the suite keeps the real validation module.
 */
import { describe, expect, it, vi } from 'vitest';

import { createEvmNameResolutionService } from '../service';
import { EVM_NETWORK_CONFIG, makeClient } from './fixtures';

// File-scoped mock: shape gate ALWAYS passes, normalization ALWAYS throws — the rare backstop state.
// `vi.mock` is hoisted above the imports above by vitest's transform, so ordering it here (below the
// imports) satisfies `import/first` while still intercepting `../name-validation` for the service.
vi.mock('../name-validation', () => ({
  isValidName: vi.fn(() => true),
  normalizeName: vi.fn(() => {
    throw new Error('disallowed character in label');
  }),
}));

describe('resolveName — normalize-throw backstop (INV-11 site 2)', () => {
  it('a normalize throw AFTER the shape gate passes → UNSUPPORTED_NAME, before any I/O', async () => {
    const { client, getEnsAddress } = makeClient();
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);

    const result = await service.resolveName('survives-shape-gate.eth');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('UNSUPPORTED_NAME');
    if (result.error.code !== 'UNSUPPORTED_NAME') return;
    // Curated reason via describeNormalizeFailure — non-empty and derived from the normalize message.
    expect(result.error.reason).toMatch(/normaliz/i);
    expect(result.error.reason.length).toBeGreaterThan(0);
    // Normalize threw before the network call — no getEnsAddress round-trip (INV-16).
    expect(getEnsAddress).not.toHaveBeenCalled();
  });
});
