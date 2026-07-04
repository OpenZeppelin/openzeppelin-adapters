/**
 * SF-1 · Native-error → `NameResolutionError` mapping — test suite.
 *
 * Verifies `mapNameResolutionError` and the four typed constructors against INV-1..INV-18
 * (`artifacts/001-ens-uikit-support/sf-1-native-error-mapping/03-invariants.md`).
 *
 * The module under test is a **pure, stateless, synchronous** classification layer — no chain, no
 * KV, no async, no auth boundary, no rate surface, no load surface. The eight service-test
 * techniques therefore collapse to the ones a pure codomain-closure function actually exercises:
 * entry-point invocation (Req/Res), fault injection (Error Semantics), replay/determinism
 * (Idempotency), mutation & bounded-traversal probing (Side-Effect/Obs), credential-leak probing
 * (Sensitive Data), and purity/portability (Perf/Reuse). Auth / rate / interleaving / load are
 * `n/a` for a leaf pure function (INV Auth Boundary section; INV-18).
 *
 * Every `describe` block names the invariant(s) it covers. Failure-path tests assert the specific
 * mapped `code` (never a bare "returns something").
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BaseError,
  ChainDoesNotSupportContract,
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  HttpRequestError,
  TimeoutError,
} from 'viem';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { RuntimeDisposedError } from '@openzeppelin/ui-types';
import type { NameResolutionError } from '@openzeppelin/ui-types';

import {
  addressNotFound,
  ELAPSED_UNMEASURED,
  mapNameResolutionError,
  nameNotFound,
  unsupportedName,
  unsupportedNetwork,
  type NameResolutionErrorContext,
} from '../error-mapping';

// ---------------------------------------------------------------------------
// Shared fixtures & helpers
// ---------------------------------------------------------------------------

/** The closed seven-code taxonomy this module maps INTO (INV-1). Local reproduction for asserting. */
const SEVEN_CODES = [
  'NAME_NOT_FOUND',
  'ADDRESS_NOT_FOUND',
  'UNSUPPORTED_NETWORK',
  'UNSUPPORTED_NAME',
  'RESOLUTION_TIMEOUT',
  'EXTERNAL_GATEWAY_ERROR',
  'ADAPTER_ERROR',
] as const;

const SEVEN_CODE_SET: ReadonlySet<string> = new Set(SEVEN_CODES);

/** A realistic viem HTTP transport error embedding a provider API key in the URL. */
const ALCHEMY_KEY = 'SECRETKEY0123456789abcdefABCDEF1'; // 32 chars — exceeds the /vN/ 16-char redaction floor
const keyedUrl = `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`;

function makeHttpError(url = keyedUrl): HttpRequestError {
  return new HttpRequestError({ url, status: 500, details: 'gateway down' });
}

function makeTimeoutError(): TimeoutError {
  return new TimeoutError({ body: {}, url: 'https://rpc.example.com' });
}

function makeChainUnsupportedError(): ChainDoesNotSupportContract {
  return new ChainDoesNotSupportContract({
    chain: { id: 999, name: 'NoEns' } as never,
    contract: { name: 'ensUniversalResolver' },
  });
}

/**
 * A viem error whose thrown class is `ContractFunctionExecutionError` but whose *decoded* revert
 * carries `data.errorName === <errorName>` (D3, from SF-2 Code). The mapper reaches this name via
 * `extractRevertInfo` (the shared revert-info walk), NOT the `.name` needle — the thrown error's own
 * `.name` is `ContractFunctionRevertedError`, never the decoded name. Mirrors the construction in the
 * sibling `erc3643/__tests__/erc3643.error-mapping.test.ts`.
 */
function makeDecodedRevert(errorName: string): ContractFunctionExecutionError {
  const revert = new ContractFunctionRevertedError({ abi: [], functionName: 'resolve' });
  (revert as { data?: { errorName: string; args: unknown[] } }).data = { errorName, args: [] };
  return new ContractFunctionExecutionError(revert, { abi: [], functionName: 'resolve' });
}

/**
 * A "foreign-realm" / duplicate-copy error: matches by `.name` but is NOT an `instanceof` of the
 * viem / ui-types class. Exercises the `.name`-needle fallback (INV-9, classification defense-in-depth).
 */
function foreignRealmError(name: string, message = 'foreign'): { name: string; message: string } {
  return { name, message };
}

/** Run `fn`, returning the thrown value (or a unique sentinel if it did not throw). */
const DID_NOT_THROW = Symbol('did-not-throw');
function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
    return DID_NOT_THROW;
  } catch (e) {
    return e;
  }
}

/**
 * A representative corpus spanning every input shape INV-4 promises the mapper accepts. Excludes
 * the allowlisted programmer error (covered separately in INV-9) so this corpus is "must-return".
 */
const NON_THROWING_CORPUS: ReadonlyArray<readonly [string, unknown]> = [
  ['null', null],
  ['undefined', undefined],
  ['number', 42],
  ['string', 'boom'],
  ['bigint', 10n],
  ['symbol', Symbol('x')],
  ['empty object', {}],
  ['bare Error', new Error('generic')],
  ['viem BaseError', new BaseError('base')],
  ['TypeError', new TypeError('bad type')],
  ['RangeError', new RangeError('out of range')],
  ['ReferenceError', new ReferenceError('undeclared')],
  ['viem TimeoutError', makeTimeoutError()],
  ['viem HttpRequestError', makeHttpError()],
  ['viem ChainDoesNotSupportContract', makeChainUnsupportedError()],
  ['offchain-lookup (by name)', foreignRealmError('OffchainLookupError')],
  ['object with numeric name', { name: 42 }],
  ['object with null prototype', Object.assign(Object.create(null), { message: 'np' })],
];

// ---------------------------------------------------------------------------
// Request/Response Contract — INV-1..INV-5
// ---------------------------------------------------------------------------

describe('INV-1 · codomain closure — output is always a member of the closed seven-code union', () => {
  it.each(NON_THROWING_CORPUS)('maps %s to a valid union member', (_label, input) => {
    const result = mapNameResolutionError(input);
    expect(result).not.toBeNull();
    expect(result).not.toBeUndefined();
    expect(typeof result.code).toBe('string');
    expect(SEVEN_CODE_SET.has(result.code)).toBe(true);
  });

  it('never returns an invented code even when biased by every context flag', () => {
    for (const [, input] of NON_THROWING_CORPUS) {
      const result = mapNameResolutionError(input, {
        viaGateway: true,
        networkId: 'evm:1',
        elapsedMs: 5,
      });
      expect(SEVEN_CODE_SET.has(result.code)).toBe(true);
    }
  });

  it('type-level: the return type is exactly the closed NameResolutionError union', () => {
    expectTypeOf(mapNameResolutionError).returns.toEqualTypeOf<NameResolutionError>();
  });
});

describe('INV-2 · constructor payload exactness — exact variant, exact keys, values verbatim', () => {
  it('nameNotFound → { code, name } with no extras', () => {
    const r = nameNotFound('alice.eth');
    expect(r).toEqual({ code: 'NAME_NOT_FOUND', name: 'alice.eth' });
    expect(Object.keys(r).sort()).toEqual(['code', 'name']);
  });

  it('addressNotFound → { code, address } with no extras', () => {
    const r = addressNotFound('0xabc');
    expect(r).toEqual({ code: 'ADDRESS_NOT_FOUND', address: '0xabc' });
    expect(Object.keys(r).sort()).toEqual(['address', 'code']);
  });

  it('unsupportedName → { code, name, reason } with no extras (reason verbatim for secret-free text)', () => {
    const r = unsupportedName('BAD!', 'not a valid label');
    expect(r).toEqual({ code: 'UNSUPPORTED_NAME', name: 'BAD!', reason: 'not a valid label' });
    expect(Object.keys(r).sort()).toEqual(['code', 'name', 'reason']);
  });

  it('unsupportedNetwork → { code, networkId } with no extras', () => {
    const r = unsupportedNetwork('evm:8453');
    expect(r).toEqual({ code: 'UNSUPPORTED_NETWORK', networkId: 'evm:8453' });
    expect(Object.keys(r).sort()).toEqual(['code', 'networkId']);
  });

  it('type-level: each constructor returns its exact variant, not the whole union', () => {
    expectTypeOf(nameNotFound).returns.toEqualTypeOf<
      Extract<NameResolutionError, { code: 'NAME_NOT_FOUND' }>
    >();
    expectTypeOf(addressNotFound).returns.toEqualTypeOf<
      Extract<NameResolutionError, { code: 'ADDRESS_NOT_FOUND' }>
    >();
    expectTypeOf(unsupportedName).returns.toEqualTypeOf<
      Extract<NameResolutionError, { code: 'UNSUPPORTED_NAME' }>
    >();
    expectTypeOf(unsupportedNetwork).returns.toEqualTypeOf<
      Extract<NameResolutionError, { code: 'UNSUPPORTED_NETWORK' }>
    >();
  });
});

describe('INV-3 · fresh immutable results — no shared mutable state across calls', () => {
  it('two constructor calls with equal input return distinct-identity, structurally-equal objects', () => {
    const a = nameNotFound('x.eth');
    const b = nameNotFound('x.eth');
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it('mutating a returned constructor result never affects a later call', () => {
    const a = nameNotFound('x.eth') as { code: string; name: string };
    a.name = 'CORRUPTED';
    const b = nameNotFound('x.eth');
    expect(b.name).toBe('x.eth');
  });

  it('two mapper calls with equal input return distinct-identity objects (cause aside)', () => {
    const err = new Error('same');
    const a = mapNameResolutionError(err);
    const b = mapNameResolutionError(err);
    expect(a).not.toBe(b);
    expect(a.code).toBe('ADAPTER_ERROR');
    expect(b.code).toBe('ADAPTER_ERROR');
  });
});

describe('INV-4 · input domain is genuinely `unknown` — no call-site guard required', () => {
  it.each(NON_THROWING_CORPUS)(
    'accepts %s without throwing and without a context argument',
    (_label, input) => {
      expect(thrownBy(() => mapNameResolutionError(input))).toBe(DID_NOT_THROW);
    }
  );

  it('a bare Error maps to ADAPTER_ERROR (unclassified fallback)', () => {
    expect(mapNameResolutionError(new Error('x')).code).toBe('ADAPTER_ERROR');
  });

  it('type-level: the error parameter is `unknown` and context is optional', () => {
    expectTypeOf(mapNameResolutionError).parameter(0).toEqualTypeOf<unknown>();
    // Callable with a single argument — context defaulted.
    expectTypeOf<Parameters<typeof mapNameResolutionError>>().toEqualTypeOf<
      [error: unknown, context?: NameResolutionErrorContext]
    >();
  });
});

describe('INV-5 · ADAPTER_ERROR.message is always a non-empty string; extraction never throws', () => {
  it('a throwing `get message` falls back to a stable literal without throwing', () => {
    const hostile = {
      get message(): string {
        throw new Error('message getter exploded');
      },
    };
    const r = mapNameResolutionError(hostile);
    expect(r.code).toBe('ADAPTER_ERROR');
    if (r.code === 'ADAPTER_ERROR') {
      expect(typeof r.message).toBe('string');
      expect(r.message.length).toBeGreaterThan(0);
    }
  });

  it('a throwing `toString` falls back to a stable literal without throwing', () => {
    const hostile = {
      toString(): string {
        throw new Error('toString exploded');
      },
    };
    const r = mapNameResolutionError(hostile);
    expect(r.code).toBe('ADAPTER_ERROR');
    if (r.code === 'ADAPTER_ERROR') {
      expect(r.message).toBe('unknown error');
    }
  });

  it('a null throw yields a non-empty string message', () => {
    const r = mapNameResolutionError(null);
    expect(r.code).toBe('ADAPTER_ERROR');
    if (r.code === 'ADAPTER_ERROR') expect(r.message.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Error Semantics — INV-6..INV-12
// ---------------------------------------------------------------------------

describe('INV-6 · totality with a single closed carve-out', () => {
  it('every non-allowlisted input returns a union member (never a third outcome)', () => {
    for (const [, input] of NON_THROWING_CORPUS) {
      const outcome = thrownBy(() => mapNameResolutionError(input));
      expect(outcome).toBe(DID_NOT_THROW);
    }
  });

  it('the only value the mapper ever throws is an allowlist member', () => {
    // Positive: allowlist member throws.
    expect(thrownBy(() => mapNameResolutionError(new RuntimeDisposedError('cap')))).toBeInstanceOf(
      RuntimeDisposedError
    );
    // Negative: nothing else in the corpus throws.
    for (const [, input] of NON_THROWING_CORPUS) {
      expect(thrownBy(() => mapNameResolutionError(input))).toBe(DID_NOT_THROW);
    }
  });
});

describe('INV-7 · ADAPTER_ERROR is the total fallback and preserves the cause by reference', () => {
  it('preserves the original thrown value by reference identity on `cause`', () => {
    const sentinel = new Error('unclassifiable');
    const r = mapNameResolutionError(sentinel);
    expect(r.code).toBe('ADAPTER_ERROR');
    if (r.code === 'ADAPTER_ERROR') expect(r.cause).toBe(sentinel);
  });

  it('preserves a non-Error thrown value by reference on `cause`', () => {
    const sentinel = { weird: 'object' };
    const r = mapNameResolutionError(sentinel);
    expect(r.code).toBe('ADAPTER_ERROR');
    if (r.code === 'ADAPTER_ERROR') expect(r.cause).toBe(sentinel);
  });
});

describe('INV-8 / INV-10 · deterministic precedence — fixed total order, first match wins', () => {
  // Row-by-row precedence table (rows 1..6). Snapshotting this table pins the classification order.
  const precedenceTable: ReadonlyArray<
    readonly [row: string, error: unknown, ctx: NameResolutionErrorContext, expected: string]
  > = [
    [
      'row1 gateway+timeout → gateway',
      makeTimeoutError(),
      { viaGateway: true },
      'EXTERNAL_GATEWAY_ERROR',
    ],
    [
      'row1 gateway+http → gateway',
      makeHttpError(),
      { viaGateway: true },
      'EXTERNAL_GATEWAY_ERROR',
    ],
    [
      'row1 gateway+offchain → gateway',
      foreignRealmError('OffchainLookupError'),
      { viaGateway: true },
      'EXTERNAL_GATEWAY_ERROR',
    ],
    ['row2 bare timeout → timeout', makeTimeoutError(), {}, 'RESOLUTION_TIMEOUT'],
    [
      'row3 offchain (no gateway ctx) → gateway',
      foreignRealmError('OffchainLookupError'),
      {},
      'EXTERNAL_GATEWAY_ERROR',
    ],
    [
      'row4 chain-unsupported → unsupported network',
      makeChainUnsupportedError(),
      { networkId: 'evm:999' },
      'UNSUPPORTED_NETWORK',
    ],
    ['row6 unclassified → adapter error', new Error('mystery'), {}, 'ADAPTER_ERROR'],
    ['row6 bare HTTP (no gateway ctx) → adapter error', makeHttpError(), {}, 'ADAPTER_ERROR'],
  ];

  it.each(precedenceTable)('%s', (_row, error, ctx, expected) => {
    expect(mapNameResolutionError(error, ctx).code).toBe(expected);
  });

  it('INV-10: the SAME timeout error maps by `viaGateway` alone — gateway dominates', () => {
    const err = makeTimeoutError();
    expect(mapNameResolutionError(err, { viaGateway: true }).code).toBe('EXTERNAL_GATEWAY_ERROR');
    expect(mapNameResolutionError(err, { viaGateway: false }).code).toBe('RESOLUTION_TIMEOUT');
    expect(mapNameResolutionError(err).code).toBe('RESOLUTION_TIMEOUT');
  });
});

describe('INV-9 · programmer-error allowlist is closed & explicit, checked first', () => {
  it('re-throws a RuntimeDisposedError unchanged (same instance)', () => {
    const err = new RuntimeDisposedError('cap-x');
    expect(thrownBy(() => mapNameResolutionError(err))).toBe(err);
  });

  it('re-throws a RuntimeDisposedError nested inside a `cause` chain', () => {
    const wrapper = new Error('outer');
    (wrapper as { cause?: unknown }).cause = new RuntimeDisposedError('cap-y');
    expect(thrownBy(() => mapNameResolutionError(wrapper))).toBe(wrapper);
  });

  it('re-throws a foreign-realm disposed error via the `.name` needle (instanceof fails)', () => {
    const foreign = foreignRealmError('RuntimeDisposedError', 'disposed elsewhere');
    expect(foreign).not.toBeInstanceOf(RuntimeDisposedError);
    expect(thrownBy(() => mapNameResolutionError(foreign))).toBe(foreign);
  });

  it.each([
    ['TypeError', new TypeError('t')],
    ['RangeError', new RangeError('r')],
    ['ReferenceError', new ReferenceError('ref')],
    ['bare Error', new Error('e')],
  ])('maps %s to ADAPTER_ERROR (does NOT re-throw) and preserves cause', (_label, err) => {
    const outcome = thrownBy(() => mapNameResolutionError(err));
    expect(outcome).not.toBe(err); // did not re-throw
    const r = mapNameResolutionError(err);
    expect(r.code).toBe('ADAPTER_ERROR');
    if (r.code === 'ADAPTER_ERROR') expect(r.cause).toBe(err);
  });

  it('checks the allowlist BEFORE classification — a disposed error that also looks like a timeout still throws', () => {
    const err = new RuntimeDisposedError('cap-z');
    // Even with gateway context that would otherwise force EXTERNAL_GATEWAY_ERROR, row 0 wins.
    expect(thrownBy(() => mapNameResolutionError(err, { viaGateway: true }))).toBe(err);
  });
});

describe('INV-11 · gateway/offchain failures are never conflated with not-found', () => {
  it.each([
    ['offchain-lookup, no ctx', foreignRealmError('OffchainLookupError'), {}],
    [
      'offchain-lookup, gateway ctx',
      foreignRealmError('OffchainLookupResponseMalformedError'),
      { viaGateway: true },
    ],
    ['http, gateway ctx', makeHttpError(), { viaGateway: true }],
    ['timeout, gateway ctx', makeTimeoutError(), { viaGateway: true }],
  ] as ReadonlyArray<readonly [string, unknown, NameResolutionErrorContext]>)(
    '%s → EXTERNAL_GATEWAY_ERROR, never NAME_NOT_FOUND / ADDRESS_NOT_FOUND',
    (_label, error, ctx) => {
      const r = mapNameResolutionError(error, ctx);
      expect(r.code).toBe('EXTERNAL_GATEWAY_ERROR');
      expect(r.code).not.toBe('NAME_NOT_FOUND');
      expect(r.code).not.toBe('ADDRESS_NOT_FOUND');
    }
  );

  it('structural: the mapper source constructs no not-found variant (not-found is caller-only)', () => {
    const src = readMapperSource();
    // The mapper body must never fabricate a not-found. `nameNotFound`/`addressNotFound` are
    // exported constructors on the CALLER control path; they are defined in this file but must not
    // be invoked from within mapNameResolutionError, and no literal not-found code is built inline.
    const mapperBody = extractFunctionBody(src, 'export function mapNameResolutionError');
    expect(mapperBody).not.toMatch(/NAME_NOT_FOUND/);
    expect(mapperBody).not.toMatch(/ADDRESS_NOT_FOUND/);
    expect(mapperBody).not.toMatch(/\bnameNotFound\s*\(/);
    expect(mapperBody).not.toMatch(/\baddressNotFound\s*\(/);
  });
});

describe('INV-8 / INV-10 / INV-11 · D3 — decoded UR HttpError gateway revert', () => {
  // SF-2 Code (D3) added a mapper row: the Universal-Resolver offchain-gateway HTTP failure surfaces
  // as a *decoded* revert `errorName === 'HttpError'` (reached via `extractRevertInfo`, not the
  // `.name` needle — the thrown class is `ContractFunctionRevertedError`). It joins the OffchainLookup*
  // bucket: EXTERNAL_GATEWAY_ERROR under a gateway context (Row 1, viaGateway-dominant per INV-10) and
  // also without one (Row 3), never conflated with a not-found (INV-11).

  it('under a gateway context, a decoded HttpError revert → EXTERNAL_GATEWAY_ERROR (Row 1)', () => {
    const r = mapNameResolutionError(makeDecodedRevert('HttpError'), { viaGateway: true });
    expect(r.code).toBe('EXTERNAL_GATEWAY_ERROR');
  });

  it('without a gateway context, a decoded HttpError revert still → EXTERNAL_GATEWAY_ERROR (Row 3)', () => {
    // Same bucket as OffchainLookup* — the gateway-transport revert is a mapper row regardless of ctx.
    const r = mapNameResolutionError(makeDecodedRevert('HttpError'));
    expect(r.code).toBe('EXTERNAL_GATEWAY_ERROR');
    expect(r.code).not.toBe('NAME_NOT_FOUND');
    expect(r.code).not.toBe('ADDRESS_NOT_FOUND');
  });

  it.each([['ResolverNotFound'], ['ResolverNotContract'], ['UnsupportedResolverProfile']])(
    'stays DISTINCT from the resolver-semantic revert %s — NOT a gateway row, falls to ADAPTER_ERROR',
    (errorName) => {
      // These are SF-2 control-path outcomes (pre-classified via the typed constructors), deliberately
      // NOT mapper rows. Reaching the mapper, they are unclassified → ADAPTER_ERROR (never gateway,
      // never a fabricated not-found — INV-11). This is what keeps D3 scoped to the transport revert.
      const withCtx = mapNameResolutionError(makeDecodedRevert(errorName), { viaGateway: true });
      const noCtx = mapNameResolutionError(makeDecodedRevert(errorName));
      expect(withCtx.code).toBe('ADAPTER_ERROR');
      expect(noCtx.code).toBe('ADAPTER_ERROR');
      expect(withCtx.code).not.toBe('EXTERNAL_GATEWAY_ERROR');
      expect(withCtx.code).not.toBe('NAME_NOT_FOUND');
    }
  );
});

describe('INV-12 · RESOLUTION_TIMEOUT.elapsedMs is always finite; -1 sentinel when unmeasured', () => {
  const timeout = () => makeTimeoutError();

  it('uses a supplied finite elapsedMs verbatim', () => {
    const r = mapNameResolutionError(timeout(), { elapsedMs: 1234 });
    expect(r).toEqual({ code: 'RESOLUTION_TIMEOUT', elapsedMs: 1234 });
  });

  it('preserves a genuine 0ms (distinct from the unmeasured sentinel)', () => {
    const r = mapNameResolutionError(timeout(), { elapsedMs: 0 });
    expect(r).toMatchObject({ code: 'RESOLUTION_TIMEOUT', elapsedMs: 0 });
  });

  it.each([
    ['absent', undefined],
    ['NaN', Number.NaN],
    ['negative', -5],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('emits the -1 sentinel when elapsedMs is %s', (_label, elapsedMs) => {
    const r = mapNameResolutionError(timeout(), { elapsedMs: elapsedMs as number | undefined });
    expect(r).toMatchObject({ code: 'RESOLUTION_TIMEOUT', elapsedMs: ELAPSED_UNMEASURED });
    expect(ELAPSED_UNMEASURED).toBe(-1);
    if (r.code === 'RESOLUTION_TIMEOUT') expect(Number.isFinite(r.elapsedMs)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Idempotency & Retry — INV-13
// ---------------------------------------------------------------------------

describe('INV-13 · referential transparency — deterministic, side-effect-free classification', () => {
  it('the mapper returns structurally-equal results for identical inputs (cause by identity)', () => {
    const err = makeHttpError();
    const a = mapNameResolutionError(err, { viaGateway: true });
    const b = mapNameResolutionError(err, { viaGateway: true });
    expect(a).toEqual(b);
  });

  it('constructors are deterministic across repeated calls', () => {
    expect(unsupportedNetwork('evm:1')).toEqual(unsupportedNetwork('evm:1'));
    expect(unsupportedName('x', 'why')).toEqual(unsupportedName('x', 'why'));
  });

  it('structural: the module reads no clock and no RNG and holds no mutable module state', () => {
    const src = readMapperSource();
    expect(src).not.toMatch(/Date\.now\s*\(/);
    expect(src).not.toMatch(/Math\.random\s*\(/);
    expect(src).not.toMatch(/performance\.now\s*\(/);
    expect(src).not.toMatch(/new Date\s*\(/);
    // No mutable module-level binding: top-level declarations (column 0, no indentation) are only
    // `const` / `import` / `export`. Function-local `let` is not shared state and is permitted.
    expect(src).not.toMatch(/^(?:let|var)\s+/m);
  });
});

// ---------------------------------------------------------------------------
// Side-Effect Ordering & Observability — INV-14, INV-15
// ---------------------------------------------------------------------------

describe('INV-14 · zero side effects; the caught error is never mutated', () => {
  it('does not mutate a deeply-frozen error object (no write attempt, no throw)', () => {
    const cause = Object.freeze({ name: 'InnerError', message: 'inner' });
    const err = Object.freeze({ name: 'OuterError', message: 'outer', cause });
    const before = JSON.stringify(err);
    const outcome = thrownBy(() => mapNameResolutionError(err));
    expect(outcome).toBe(DID_NOT_THROW);
    expect(Object.isFrozen(err)).toBe(true);
    expect(JSON.stringify(err)).toBe(before);
  });

  it('invokes no logger / console during classification', () => {
    const spies = [
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
      vi.spyOn(console, 'info').mockImplementation(() => {}),
      vi.spyOn(console, 'debug').mockImplementation(() => {}),
    ];
    try {
      for (const [, input] of NON_THROWING_CORPUS)
        mapNameResolutionError(input, { viaGateway: true });
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});

describe('INV-15 · bounded cause-chain traversal — terminates on cyclic or deep chains', () => {
  it('terminates on a cyclic `cause` chain and returns a union member', () => {
    const a: { name: string; message: string; cause?: unknown } = { name: 'A', message: 'a' };
    const b: { name: string; message: string; cause?: unknown } = {
      name: 'B',
      message: 'b',
      cause: a,
    };
    a.cause = b; // cycle: a → b → a
    const outcome = thrownBy(() => mapNameResolutionError(a));
    expect(outcome).toBe(DID_NOT_THROW);
    expect(SEVEN_CODE_SET.has(mapNameResolutionError(a).code)).toBe(true);
  });

  it('does not blow the stack on a 10,000-deep `cause` chain', () => {
    let head: { name: string; message: string; cause?: unknown } = {
      name: 'leaf',
      message: 'leaf',
    };
    for (let i = 0; i < 10_000; i++) head = { name: `n${i}`, message: 'm', cause: head };
    const outcome = thrownBy(() => mapNameResolutionError(head));
    expect(outcome).toBe(DID_NOT_THROW);
    expect(SEVEN_CODE_SET.has(mapNameResolutionError(head).code)).toBe(true);
  });

  it('finds an allowlisted error nested within the depth cap and re-throws it', () => {
    const disposed = new RuntimeDisposedError('cap');
    const wrapper = {
      name: 'W',
      message: 'w',
      cause: { name: 'X', message: 'x', cause: disposed },
    };
    expect(thrownBy(() => mapNameResolutionError(wrapper))).toBe(wrapper);
  });
});

// ---------------------------------------------------------------------------
// Sensitive Data Handling — INV-16, INV-17
// ---------------------------------------------------------------------------

describe('INV-16 · credential redaction in consumer-renderable free-text fields', () => {
  it('strips a provider API key from EXTERNAL_GATEWAY_ERROR.detail', () => {
    const r = mapNameResolutionError(makeHttpError(), { viaGateway: true });
    expect(r.code).toBe('EXTERNAL_GATEWAY_ERROR');
    if (r.code === 'EXTERNAL_GATEWAY_ERROR') {
      expect(r.detail).not.toContain(ALCHEMY_KEY);
      expect(r.detail).toContain('<redacted>');
    }
  });

  it('strips a provider API key from ADAPTER_ERROR.message but keeps it recoverable on cause', () => {
    const err = makeHttpError(); // unclassified without gateway ctx → ADAPTER_ERROR
    const r = mapNameResolutionError(err);
    expect(r.code).toBe('ADAPTER_ERROR');
    if (r.code === 'ADAPTER_ERROR') {
      expect(r.message).not.toContain(ALCHEMY_KEY);
      // Full, unredacted original recoverable only via the opaque cause (INV-17).
      expect(String((r.cause as Error).message)).toContain(ALCHEMY_KEY);
    }
  });

  it('strips URL userinfo credentials from a rendered message', () => {
    const err = new Error('connect failed wss://user:hunter2pass@node.example.com/ws');
    const r = mapNameResolutionError(err);
    expect(r.code).toBe('ADAPTER_ERROR');
    if (r.code === 'ADAPTER_ERROR') {
      expect(r.message).not.toContain('hunter2pass');
      expect(r.message).toContain('<redacted>');
    }
  });

  it('defensively redacts UNSUPPORTED_NAME.reason', () => {
    const r = unsupportedName('x.eth', `rejected by https://gw.example.com/v2/${ALCHEMY_KEY}`);
    expect(r.reason).not.toContain(ALCHEMY_KEY);
  });
});

describe('INV-17 · cause is opaque — only on ADAPTER_ERROR, typed unknown, never on other variants', () => {
  it('sets `cause` only on the ADAPTER_ERROR variant', () => {
    const adapter = mapNameResolutionError(new Error('x'));
    expect(adapter.code).toBe('ADAPTER_ERROR');
    expect('cause' in adapter).toBe(true);

    const gateway = mapNameResolutionError(makeHttpError(), { viaGateway: true });
    expect('cause' in gateway).toBe(false);

    const timeout = mapNameResolutionError(makeTimeoutError(), { elapsedMs: 5 });
    expect('cause' in timeout).toBe(false);
  });

  it('type-level: ADAPTER_ERROR.cause is `unknown` (no narrower type exported)', () => {
    type AdapterError = Extract<NameResolutionError, { code: 'ADAPTER_ERROR' }>;
    expectTypeOf<AdapterError['cause']>().toEqualTypeOf<unknown>();
  });
});

// ---------------------------------------------------------------------------
// Performance, Scalability & Re-usability — INV-18
// ---------------------------------------------------------------------------

describe('INV-18 · pure, dependency-free leaf — embeddable with zero config', () => {
  it('works with zero host wiring — the import above is the only setup', () => {
    // No fixture, no injected deps, no config object was needed to reach this assertion.
    expect(mapNameResolutionError(new Error('x')).code).toBe('ADAPTER_ERROR');
    expect(nameNotFound('a.eth').code).toBe('NAME_NOT_FOUND');
  });

  it('exposes no injected-dependency parameters (mapper takes error + optional ctx only)', () => {
    // .length counts params before the first default/rest. `context` has a default → length 1.
    expect(mapNameResolutionError.length).toBe(1);
    expect(nameNotFound.length).toBe(1);
    expect(addressNotFound.length).toBe(1);
    expect(unsupportedName.length).toBe(2);
    expect(unsupportedNetwork.length).toBe(1);
  });

  it('structural: the only ui-types imports are `import type` for the union + the RuntimeDisposedError value', () => {
    const src = readMapperSource();
    // The union is type-only (erased at build — zero runtime coupling to the not-yet-stable shape).
    expect(src).toMatch(/import type \{ NameResolutionError \} from '@openzeppelin\/ui-types'/);
    // The sole permitted runtime import from ui-types is the RuntimeDisposedError class (INV-9 needs
    // it as a value for instanceof). No other runtime symbol may be imported from ui-types.
    const runtimeImport = /import \{ RuntimeDisposedError \} from '@openzeppelin\/ui-types'/;
    expect(src).toMatch(runtimeImport);
    // No logger / clock / transport injected at module scope.
    expect(src).not.toMatch(/import .*(logger|winston|pino|axios)/i);
  });
});

// ---------------------------------------------------------------------------
// Source-introspection helpers (structural invariant checks)
// ---------------------------------------------------------------------------

function readMapperSource(): string {
  // vitest runs with cwd = the package root (`packages/adapter-evm-core`); resolve the source under
  // test from there. `import.meta.url` is not a `file://` URL under Vite's module transform, so we
  // avoid it for this structural read.
  const path = resolve(process.cwd(), 'src/name-resolution/error-mapping.ts');
  return readFileSync(path, 'utf8');
}

/**
 * Extract the textual body of a top-level function starting at `signaturePrefix`, by brace-matching
 * from the first `{` after the signature. Used for structural assertions that must scope to the
 * mapper body and not the whole module (e.g. INV-11 "no not-found construction in the mapper").
 */
function extractFunctionBody(src: string, signaturePrefix: string): string {
  const start = src.indexOf(signaturePrefix);
  if (start === -1) throw new Error(`signature not found: ${signaturePrefix}`);
  const open = src.indexOf('{', start);
  if (open === -1) throw new Error(`opening brace not found for: ${signaturePrefix}`);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  throw new Error(`unbalanced braces for: ${signaturePrefix}`);
}
