import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import { checkConformance } from '../checker';
import { NAME_RESOLUTION_ERROR_CODES } from '../checks/never-throws';
import {
  compliantForward,
  compliantReverse,
  FORWARD_VECTORS,
  makeStub,
  REVERSE_VECTORS,
} from './fixtures';
import { spyOnFactory } from './harness-fixtures';

/**
 * Hygiene coverage — the properties that make the harness trustworthy as a gate rather than a
 * source of surprises. INV-17 (fresh instance per case, zero dispose on required families),
 * INV-18 (side-effect-free core), INV-20 (bounded work, no retries), INV-23 (zero
 * concrete-adapter deps, runner-free core, quarantined vitest), INV-24 (full pluggability).
 */

describe('INV-17 — one fresh instance per case; required families never dispose', () => {
  it('constructs exactly (1 probe + 1 per case) instances and disposes none', async () => {
    const { spy, factory } = spyOnFactory(() =>
      makeStub({ resolveName: compliantForward, resolveAddress: compliantReverse })
    );
    await checkConformance({
      makeCapability: factory,
      forwardVectors: FORWARD_VECTORS, // 2 cases
      reverseVectors: REVERSE_VECTORS, // 2 cases
    });
    // 1 feature-detect probe + 4 per-case constructions.
    expect(spy.constructions).toBe(5);
    expect(spy.disposes).toBe(0); // the four required families never dispose (INV-17)
  });
});

describe('INV-20 — bounded work: exactly two calls per vector, no retries', () => {
  it('calls each direction exactly twice per vector (INV-8/expectation + INV-12)', async () => {
    const { spy, factory } = spyOnFactory(() =>
      makeStub({ resolveName: compliantForward, resolveAddress: compliantReverse })
    );
    await checkConformance({
      makeCapability: factory,
      forwardVectors: FORWARD_VECTORS, // 2 vectors → 4 resolveName calls
      reverseVectors: REVERSE_VECTORS, // 2 vectors → 4 resolveAddress calls
    });
    expect(spy.resolveNameCalls).toBe(4);
    expect(spy.resolveAddressCalls).toBe(4);
  });

  it('a throwing vector is called exactly once — no retry and no wasteful second determinism call', async () => {
    const { spy, factory } = spyOnFactory(() =>
      makeStub({
        resolveName: () => {
          throw new Error('always-throws');
        },
      })
    );
    await checkConformance({
      makeCapability: factory,
      forwardVectors: [{ input: 'x.eth', expect: { ok: false, code: 'NAME_NOT_FOUND' } }],
    });
    // First call threw → INV-12 second invocation is skipped (determinism ungradable).
    expect(spy.resolveNameCalls).toBe(1);
  });
});

describe('INV-18 — the pure core performs no observable side effect', () => {
  it('makes zero console calls across a passing AND a failing run', async () => {
    const methods = ['log', 'info', 'warn', 'error', 'debug'] as const;
    const spies = methods.map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    try {
      await checkConformance({
        makeCapability: () => makeStub({ resolveName: compliantForward }),
        forwardVectors: FORWARD_VECTORS,
      });
      await checkConformance({
        makeCapability: () =>
          makeStub({
            resolveName: () => {
              throw new Error('boom');
            },
          }),
        forwardVectors: [{ input: 'x.eth', expect: { ok: false, code: 'NAME_NOT_FOUND' } }],
      });
      for (const s of spies) {
        expect(s).not.toHaveBeenCalled();
      }
    } finally {
      for (const s of spies) {
        s.mockRestore();
      }
    }
  });
});

describe('INV-23 — zero concrete-adapter deps; runner-free core; quarantined vitest', () => {
  const CORE_FILES = [
    '../checker.ts',
    '../deep-equal.ts',
    '../label-policy.ts',
    '../internal.ts',
    '../types.ts',
    '../index.ts',
    '../checks/never-throws.ts',
    '../checks/forward-verified.ts',
    '../checks/determinism.ts',
    '../checks/label-user-safe.ts',
    '../checks/lifecycle.ts',
  ];

  const importSpecifiers = (source: string): string[] => {
    const specs: string[] = [];
    const re = /(?:from|import)\s+['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(source)) !== null) {
      specs.push(match[1]);
    }
    return specs;
  };

  it.each(CORE_FILES)('%s imports only @openzeppelin/ui-types (no runner, no adapter)', (file) => {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    const external = importSpecifiers(source).filter((s) => !s.startsWith('.'));
    for (const spec of external) {
      expect(spec).toBe('@openzeppelin/ui-types');
    }
  });

  it('only the vitest binding imports vitest (the quarantine boundary holds)', () => {
    const binding = readFileSync(new URL('../vitest-binding.ts', import.meta.url), 'utf8');
    expect(importSpecifiers(binding)).toContain('vitest');
    // and no core file does
    for (const file of CORE_FILES) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(importSpecifiers(source)).not.toContain('vitest');
    }
  });
});

describe('INV-24 — full pluggability; no ecosystem-specific assumptions', () => {
  it('grades non-EVM-shaped inputs and labels with no `.eth` / `0x` assumption', async () => {
    const report = await checkConformance({
      makeCapability: () =>
        makeStub({
          resolveName: (input) => ({
            ok: true,
            value: {
              name: input,
              address: 'Sxyz…sol',
              provenance: { label: 'SNS', external: false },
            },
          }),
        }),
      forwardVectors: [
        { input: 'alice.sol', expect: { ok: true } },
        { input: 'bob.sol', expect: { ok: true } },
      ],
    });
    expect(report.passed).toBe(true);
    expect(report.results.some((r) => r.invariant === 'INV-16' && r.status === 'PASS')).toBe(true);
  });

  it('the closed error-code set is exactly the 7 ui-types codes and rejects fabrications', () => {
    expect(NAME_RESOLUTION_ERROR_CODES.size).toBe(7);
    for (const code of [
      'NAME_NOT_FOUND',
      'ADDRESS_NOT_FOUND',
      'UNSUPPORTED_NETWORK',
      'UNSUPPORTED_NAME',
      'RESOLUTION_TIMEOUT',
      'EXTERNAL_GATEWAY_ERROR',
      'ADAPTER_ERROR',
    ]) {
      expect(NAME_RESOLUTION_ERROR_CODES.has(code)).toBe(true);
    }
    expect(NAME_RESOLUTION_ERROR_CODES.has('WEIRD_CODE')).toBe(false);
  });
});
