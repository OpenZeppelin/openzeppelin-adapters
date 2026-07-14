/**
 * SF-3 · `service.ts` — `EvmNameResolutionService.resolveAddress` (reverse path) test suite.
 *
 * The anti-spoofing / display-layer identity-safety core: mis-reporting `forwardVerified` (or
 * surfacing a forward-mismatched name) lets a UI render a spoofed name as trusted. Verifies the
 * un-guarded service directly (the guard-proxy / dispose lifecycle for the reverse method is
 * additionally spot-checked here and covered in full by `name-resolution.factory.test.ts`) so
 * control flow, spies, and classification are asserted with no proxy in the way.
 *
 * Organized by invariant category (the service-test techniques a stateless read primitive exercises):
 *   Req/Res (INV-1, INV-2, INV-3, INV-4, INV-5) · Error Semantics (INV-6, INV-7, INV-8, INV-9,
 *   INV-10, INV-11, INV-12) · Idempotency (INV-13, INV-14) · Side-Effect/Obs (INV-15, INV-16,
 *   INV-17) · Resource (INV-18) · Sensitive Data (INV-19) · Perf/Reuse (INV-20).
 *
 * Auth / rate / interleaving-ordering / load are `n/a` for a public, stateless read primitive
 * (Invariants § Auth Boundary; INV-14/INV-18) — recorded in the artifact's Out of Scope, not stubbed.
 *
 * Every `describe` names the invariant(s) it covers; every failure-path test asserts the specific
 * mapped `code`, never a bare "returns something". Resolves the three Open Qs carried from
 * Invariants/Code: Q1 `UnsupportedResolverProfile` → `ADDRESS_NOT_FOUND`; Q2 `ReverseAddressMismatch`
 * suppress-path fixture; Q3 cross-realm-mismatch *actual* behavior (folds to `ADAPTER_ERROR`).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { RuntimeDisposedError } from '@openzeppelin/ui-types';
import type { NameResolutionError, ResolutionResult, ResolvedName } from '@openzeppelin/ui-types';

import { createNameResolution } from '../../capabilities/name-resolution';
import { ELAPSED_UNMEASURED } from '../error-mapping';
import { createEvmNameResolutionService } from '../service';
import {
  ALCHEMY_KEY,
  AVATAR_URL,
  EVM_NETWORK_CONFIG,
  foreignRealmError,
  KEYED_URL,
  makeChainUnsupportedError,
  makeClient,
  makeDecodedRevert,
  makeHttpError,
  makeTimeoutError,
  SEVEN_CODE_SET,
  VITALIK_ADDRESS,
  VITALIK_NAME,
} from './fixtures';

/** Narrow a result to its failure arm, failing the test loudly if it was unexpectedly `ok`. */
function expectError(result: ResolutionResult<ResolvedName>): NameResolutionError {
  if (result.ok) {
    throw new Error(`expected { ok: false } but got a success: ${JSON.stringify(result.value)}`);
  }
  return result.error;
}

/** Narrow a result to its success arm, failing the test loudly if it was unexpectedly an error. */
function expectValue(result: ResolutionResult<ResolvedName>): ResolvedName {
  if (!result.ok) {
    throw new Error(`expected { ok: true } but got an error: ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

/** Read `service.ts` source for the structural (source-introspection) invariant checks. */
function readServiceSource(): string {
  // vitest runs with cwd = the package root (`packages/adapter-evm-core`); resolve the source under
  // test from there. `import.meta.url` is not a `file://` URL under Vite's module transform, so we
  // avoid it for this structural read (mirrors the SF-1 `error-mapping.test.ts` helper).
  return readFileSync(resolve(process.cwd(), 'src/name-resolution/service.ts'), 'utf8');
}

// ===========================================================================
// Request/Response Contract
// ===========================================================================

describe('resolveAddress — return-shape closure (INV-1)', () => {
  // Sweep every terminal outcome class; each MUST resolve to a discriminated `{ ok }`-shaped value.
  it('every outcome is a well-formed discriminated ResolutionResult', async () => {
    const outcomes: ReadonlyArray<
      readonly [label: string, getEnsName: ReturnType<typeof vi.fn>, address: string, ok: boolean]
    > = [
      ['success', vi.fn().mockResolvedValue(VITALIK_NAME), VITALIK_ADDRESS, true],
      ['null → address-not-found', vi.fn().mockResolvedValue(null), VITALIK_ADDRESS, false],
      [
        'ReverseAddressMismatch → suppressed',
        vi.fn().mockRejectedValue(makeDecodedRevert('ReverseAddressMismatch')),
        VITALIK_ADDRESS,
        false,
      ],
      [
        'ResolverNotFound → classified',
        vi.fn().mockRejectedValue(makeDecodedRevert('ResolverNotFound')),
        VITALIK_ADDRESS,
        false,
      ],
      [
        'UnsupportedResolverProfile → classified',
        vi.fn().mockRejectedValue(makeDecodedRevert('UnsupportedResolverProfile')),
        VITALIK_ADDRESS,
        false,
      ],
      ['timeout → mapper', vi.fn().mockRejectedValue(makeTimeoutError()), VITALIK_ADDRESS, false],
      ['malformed address', vi.fn(), '0xnothex', false],
      ['raw transport throw', vi.fn().mockRejectedValue(new Error('boom')), VITALIK_ADDRESS, false],
    ];

    for (const [label, getEnsName, address, expectOk] of outcomes) {
      const { client } = makeClient({ getEnsName });
      const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
      const result = await service.resolveAddress(address);

      expect(result, label).toHaveProperty('ok');
      expect(typeof result.ok, label).toBe('boolean');
      expect(result.ok, label).toBe(expectOk);
      if (result.ok) {
        expect(result.value, label).toBeDefined();
        expect('error' in result, label).toBe(false);
      } else {
        expect(result.error, label).toBeDefined();
        expect('value' in result, label).toBe(false);
      }
    }
  });

  it('never resolves to undefined/null', async () => {
    const { client } = makeClient();
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    const result = await service.resolveAddress(VITALIK_ADDRESS);
    expect(result).not.toBeUndefined();
    expect(result).not.toBeNull();
  });
});

describe('resolveAddress — success-value fidelity (INV-2)', () => {
  it('returns the name VERBATIM and echoes the caller address untransformed (no re-checksum)', async () => {
    const { client, getEnsName } = makeClient({
      getEnsName: vi.fn().mockResolvedValue(VITALIK_NAME),
    });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);

    const value = expectValue(await service.resolveAddress(VITALIK_ADDRESS));

    expect(value.name).toBe(VITALIK_NAME); // byte-identical, non-null
    expect(value.address).toBe(VITALIK_ADDRESS); // echoed input, no re-checksum/normalization (D-R6)
    expect(getEnsName).toHaveBeenCalledWith({ address: VITALIK_ADDRESS, strict: true });
  });

  it('a null reverse record is ADDRESS_NOT_FOUND — never { ok:true } with a coerced/placeholder name', async () => {
    const { client } = makeClient({ getEnsName: vi.fn().mockResolvedValue(null) });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);

    const error = expectError(await service.resolveAddress(VITALIK_ADDRESS));
    expect(error.code).toBe('ADDRESS_NOT_FOUND');
    if (error.code !== 'ADDRESS_NOT_FOUND') return;
    expect(error.address).toBe(VITALIK_ADDRESS); // caller's own input echoed (INV-19)
  });
});

describe('resolveAddress — forwardVerified is a concrete boolean, constant true (INV-3)', () => {
  it('every returned name carries forwardVerified === true (typeof boolean, never undefined)', async () => {
    const { client } = makeClient();
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);

    const value = expectValue(await service.resolveAddress(VITALIK_ADDRESS));
    expect(typeof value.forwardVerified).toBe('boolean');
    expect(value.forwardVerified).toBe(true);
    // The general contract permits a *different* adapter to report `false`; THIS adapter (Approach A)
    // returns a name only after the UR forward-verified it, so it is the constant literal `true`.
    expect(value.forwardVerified).not.toBe(false);
  });

  it('a name with no avatar still reports forwardVerified === true (avatar-independent — SC-003)', async () => {
    const { client } = makeClient({ getEnsAvatar: vi.fn().mockResolvedValue(null) });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);

    const value = expectValue(await service.resolveAddress(VITALIK_ADDRESS));
    expect(value.forwardVerified).toBe(true);
  });

  it('structural: the service source constructs no forwardVerified:false or forwardVerified:undefined', () => {
    // There is no code path that emits a name with forwardVerified other than the literal `true`
    // (Approach A / INV-11). A grep-level guard against a future "surface the name on mismatch" tweak.
    const src = readServiceSource();
    expect(src).not.toMatch(/forwardVerified\s*:\s*false/);
    expect(src).not.toMatch(/forwardVerified\s*:\s*undefined/);
    expect(src).toMatch(/forwardVerified\s*:\s*true/); // the sole success-site literal exists
  });
});

describe('resolveAddress — avatarUrl optionality (INV-4)', () => {
  it('present (key + value) when the avatar lookup surfaces a URL', async () => {
    const { client } = makeClient({ getEnsAvatar: vi.fn().mockResolvedValue(AVATAR_URL) });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);

    const value = expectValue(await service.resolveAddress(VITALIK_ADDRESS));
    expect('avatarUrl' in value).toBe(true);
    expect(value.avatarUrl).toBe(AVATAR_URL);
  });

  it('key ABSENT (never null, never undefined) when getEnsAvatar returns null', async () => {
    const { client } = makeClient({ getEnsAvatar: vi.fn().mockResolvedValue(null) });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);

    const value = expectValue(await service.resolveAddress(VITALIK_ADDRESS));
    expect('avatarUrl' in value).toBe(false); // conditional spread never emits the key
    expect(value.avatarUrl).toBeUndefined();
    expect(value.avatarUrl).not.toBeNull();
    expect(value).toEqual({
      address: VITALIK_ADDRESS,
      name: VITALIK_NAME,
      forwardVerified: true,
      provenance: { label: 'ENS', external: false },
    });
  });

  it('key ABSENT when the avatar lookup throws — the result is still a full success', async () => {
    const { client } = makeClient({
      getEnsAvatar: vi.fn().mockRejectedValue(new Error('avatar gateway down')),
    });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);

    const value = expectValue(await service.resolveAddress(VITALIK_ADDRESS));
    expect('avatarUrl' in value).toBe(false);
    expect(value.forwardVerified).toBe(true); // absence of avatar never downgrades the result
  });
});

describe('resolveAddress — reverse success provenance (INV-5)', () => {
  it('attaches a fresh, user-safe baseEnsProvenance with no v1 network-scoping', async () => {
    const { client } = makeClient();
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);

    const value = expectValue(await service.resolveAddress(VITALIK_ADDRESS));
    expect(value.provenance).toEqual({ label: 'ENS', external: false });
    expect('scopedToNetworkId' in value.provenance).toBe(false); // scoping is SF-5
    expect(value.provenance.label).toBe('ENS');
    // label is user-safe: no URL scheme, no key-shaped substring (SF-4 allowlist / UIKit INV-16).
    expect(value.provenance.label).not.toMatch(/:\/\//);
    expect(value.provenance.label).not.toMatch(/[A-Za-z0-9_-]{16,}/);
  });

  it('two reverse successes carry distinct provenance objects (fresh per call)', async () => {
    const { client } = makeClient();
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);

    const a = expectValue(await service.resolveAddress(VITALIK_ADDRESS));
    const b = expectValue(await service.resolveAddress(VITALIK_ADDRESS));
    expect(a.provenance).toEqual(b.provenance);
    expect(a.provenance).not.toBe(b.provenance); // no shared/frozen singleton aliased into results
  });
});

// ===========================================================================
// Error Semantics
// ===========================================================================

describe('resolveAddress — never-throw for expected failures (INV-6)', () => {
  const EXPECTED_FAILURES: ReadonlyArray<readonly [string, unknown]> = [
    ['viem TimeoutError', makeTimeoutError()],
    ['viem HttpRequestError', makeHttpError()],
    ['decoded ReverseAddressMismatch revert', makeDecodedRevert('ReverseAddressMismatch')],
    ['decoded ResolverNotFound revert', makeDecodedRevert('ResolverNotFound')],
    ['decoded ResolverNotContract revert', makeDecodedRevert('ResolverNotContract')],
    ['decoded ResolverError revert', makeDecodedRevert('ResolverError')],
    ['decoded UnsupportedResolverProfile revert', makeDecodedRevert('UnsupportedResolverProfile')],
    ['ChainDoesNotSupportContract', makeChainUnsupportedError()],
    ['a non-Error primitive throw (string)', 'boom'],
    ['a non-Error primitive throw (number)', 42],
    ['null thrown', null],
    ['foreign-realm offchain error', foreignRealmError('OffchainLookupError')],
  ];

  it.each(EXPECTED_FAILURES)('resolves (never rejects) on %s', async (_label, thrown) => {
    const { client } = makeClient({ getEnsName: vi.fn().mockRejectedValue(thrown) });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);

    // The assertion is that this does NOT reject — `expectError` would throw on an unexpected success.
    const result = await service.resolveAddress(VITALIK_ADDRESS);
    expect(result.ok).toBe(false);
  });

  it('an avatar throw NEVER propagates — the reverse still resolves { ok:true }', async () => {
    const { client } = makeClient({
      getEnsAvatar: vi.fn().mockRejectedValue(new Error('avatar host unreachable')),
    });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);

    const result = await service.resolveAddress(VITALIK_ADDRESS);
    expect(result.ok).toBe(true);
  });

  it('RuntimeDisposedError is the ONE sanctioned throw — the mapper re-throws it, never masks it', async () => {
    // If a disposed-client teardown surfaced as a RuntimeDisposedError from the reverse call,
    // resolveAddress must NOT swallow it into an ADAPTER_ERROR — it propagates (SF-1 allowlist).
    const { client } = makeClient({
      getEnsName: vi.fn().mockRejectedValue(new RuntimeDisposedError('nameResolution')),
    });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);

    await expect(service.resolveAddress(VITALIK_ADDRESS)).rejects.toBeInstanceOf(
      RuntimeDisposedError
    );
  });

  it('use-after-dispose through the guarded capability throws RuntimeDisposedError (guard proxy)', () => {
    const { client } = makeClient();
    const capability = createNameResolution(EVM_NETWORK_CONFIG, { publicClient: client });
    capability.dispose();
    // The guard proxy raises BEFORE the body runs, so the reverse method is guarded automatically.
    expect(() => capability.resolveAddress!(VITALIK_ADDRESS)).toThrow(RuntimeDisposedError);
  });
});

describe('resolveAddress — strict:true is mandatory on getEnsName (INV-7)', () => {
  it('invokes getEnsName with strict:true (fund-safety: distinct failures never collapse to null)', async () => {
    const { client, getEnsName } = makeClient();
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);

    await service.resolveAddress(VITALIK_ADDRESS);

    expect(getEnsName).toHaveBeenCalledTimes(1);
    expect(getEnsName.mock.calls[0][0]).toMatchObject({ strict: true });
  });
});

describe('resolveAddress — ADDRESS_NOT_FOUND from null, the reverts, AND malformed input (INV-8)', () => {
  it('null return → ADDRESS_NOT_FOUND (empty reverse record — a non-throw path)', async () => {
    const { client } = makeClient({ getEnsName: vi.fn().mockResolvedValue(null) });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    expect(expectError(await service.resolveAddress(VITALIK_ADDRESS)).code).toBe(
      'ADDRESS_NOT_FOUND'
    );
  });

  it.each([
    'ReverseAddressMismatch',
    'ResolverNotFound',
    'ResolverNotContract',
    'ResolverError',
    'UnsupportedResolverProfile',
  ])('%s revert → ADDRESS_NOT_FOUND', async (errorName) => {
    const { client } = makeClient({
      getEnsName: vi.fn().mockRejectedValue(makeDecodedRevert(errorName)),
    });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    expect(expectError(await service.resolveAddress(VITALIK_ADDRESS)).code).toBe(
      'ADDRESS_NOT_FOUND'
    );
  });

  it.each(['0xnothex', '', '0x1234', 'vitalik.eth', VITALIK_ADDRESS.slice(0, -1)])(
    'malformed address %j → ADDRESS_NOT_FOUND with the input echoed and ZERO getEnsName calls',
    async (bad) => {
      const { client, getEnsName } = makeClient();
      const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
      const error = expectError(await service.resolveAddress(bad));
      expect(error.code).toBe('ADDRESS_NOT_FOUND');
      if (error.code !== 'ADDRESS_NOT_FOUND') return;
      expect(error.address).toBe(bad); // caller's own input echoed (INV-19)
      expect(getEnsName).not.toHaveBeenCalled(); // sync pre-I/O gate (INV-16)
    }
  );

  // Open Q1 (Design/Invariants → Tests): UnsupportedResolverProfile on the reverse path is a
  // "no usable reverse record" outcome, resolved as ADDRESS_NOT_FOUND (D-R4) — NOT UNSUPPORTED_NAME
  // (that is a forward-path code) and NOT ADAPTER_ERROR. Pinned here.
  it('Q1 — UnsupportedResolverProfile is ADDRESS_NOT_FOUND, never UNSUPPORTED_NAME/ADAPTER_ERROR', async () => {
    const { client } = makeClient({
      getEnsName: vi.fn().mockRejectedValue(makeDecodedRevert('UnsupportedResolverProfile')),
    });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    const error = expectError(await service.resolveAddress(VITALIK_ADDRESS));
    expect(error.code).toBe('ADDRESS_NOT_FOUND');
    expect(error.code).not.toBe('UNSUPPORTED_NAME');
    expect(error.code).not.toBe('ADAPTER_ERROR');
  });
});

describe('resolveAddress — ADDRESS_NOT_FOUND is produced ONLY on the control path (INV-9)', () => {
  it('the default (mapper) arm never yields a not-found — an unclassified error is ADAPTER_ERROR', async () => {
    const { client } = makeClient({ getEnsName: vi.fn().mockRejectedValue(new Error('weird')) });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    const error = expectError(await service.resolveAddress(VITALIK_ADDRESS));
    expect(error.code).toBe('ADAPTER_ERROR');
    expect(error.code).not.toBe('ADDRESS_NOT_FOUND');
    expect(error.code).not.toBe('NAME_NOT_FOUND');
  });

  it('a gateway-shaped error delegated to the mapper is EXTERNAL_GATEWAY_ERROR, never ADDRESS_NOT_FOUND', async () => {
    const { client } = makeClient({
      getEnsName: vi.fn().mockRejectedValue(foreignRealmError('OffchainLookupError')),
    });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    const error = expectError(await service.resolveAddress(VITALIK_ADDRESS));
    expect(error.code).toBe('EXTERNAL_GATEWAY_ERROR');
    expect(error.code).not.toBe('ADDRESS_NOT_FOUND');
  });

  it('structural: resolveAddress produces ADDRESS_NOT_FOUND only via addressNotFound(...), never via the mapper', () => {
    // SF-1 INV-11 (mapper never fabricates a not-found) is preserved by keeping ALL ADDRESS_NOT_FOUND
    // production on SF-3's control path. The mapper delegation must not be asked to build one.
    const src = readServiceSource();
    expect(src).toMatch(/case 'ReverseAddressMismatch':/);
    expect(src).not.toMatch(/mapNameResolutionError[^)]*ADDRESS_NOT_FOUND/s);
  });
});

describe('resolveAddress — total & closed classification over the seven-code union (INV-10)', () => {
  // The reverse-path class→code table (Design D-R7), exercised end-to-end through resolveAddress.
  const TABLE: ReadonlyArray<readonly [string, unknown, NameResolutionError['code']]> = [
    // Part A — SF-3 control-path constructors (all fold to ADDRESS_NOT_FOUND):
    [
      'decoded ReverseAddressMismatch',
      makeDecodedRevert('ReverseAddressMismatch'),
      'ADDRESS_NOT_FOUND',
    ],
    ['decoded ResolverNotFound', makeDecodedRevert('ResolverNotFound'), 'ADDRESS_NOT_FOUND'],
    ['decoded ResolverNotContract', makeDecodedRevert('ResolverNotContract'), 'ADDRESS_NOT_FOUND'],
    ['decoded ResolverError', makeDecodedRevert('ResolverError'), 'ADDRESS_NOT_FOUND'],
    [
      'decoded UnsupportedResolverProfile',
      makeDecodedRevert('UnsupportedResolverProfile'),
      'ADDRESS_NOT_FOUND',
    ],
    // Part B — delegated to SF-1's mapper:
    [
      'decoded UR HttpError (gateway revert)',
      makeDecodedRevert('HttpError'),
      'EXTERNAL_GATEWAY_ERROR',
    ],
    [
      'foreign-realm OffchainLookupError',
      foreignRealmError('OffchainLookupError'),
      'EXTERNAL_GATEWAY_ERROR',
    ],
    ['viem TimeoutError', makeTimeoutError(), 'RESOLUTION_TIMEOUT'],
    ['ChainDoesNotSupportContract', makeChainUnsupportedError(), 'UNSUPPORTED_NETWORK'],
    ['bare HttpRequestError (no gateway ctx)', makeHttpError(), 'ADAPTER_ERROR'],
    ['generic Error', new Error('weird'), 'ADAPTER_ERROR'],
    ['non-Error primitive', 'boom', 'ADAPTER_ERROR'],
  ];

  it.each(TABLE)('%s → %s', async (_label, thrown, expectedCode) => {
    const { client } = makeClient({ getEnsName: vi.fn().mockRejectedValue(thrown) });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    const error = expectError(await service.resolveAddress(VITALIK_ADDRESS));
    expect(error.code).toBe(expectedCode);
    expect(SEVEN_CODE_SET.has(error.code)).toBe(true); // never an invented code
  });

  it('an unclassifiable throw maps to ADAPTER_ERROR carrying the original as opaque cause', async () => {
    const original = new Error('mystery');
    const { client } = makeClient({ getEnsName: vi.fn().mockRejectedValue(original) });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    const error = expectError(await service.resolveAddress(VITALIK_ADDRESS));
    expect(error.code).toBe('ADAPTER_ERROR');
    if (error.code !== 'ADAPTER_ERROR') return;
    expect(error.cause).toBe(original); // preserved by reference
  });

  it('no reverse outcome ever carries NAME_NOT_FOUND or UNSUPPORTED_NAME (those are forward-path codes)', async () => {
    // Sweep the whole reverse failure surface and assert the forward-only codes never appear.
    const forwardOnly = new Set(['NAME_NOT_FOUND', 'UNSUPPORTED_NAME']);
    for (const [, thrown] of TABLE) {
      const { client } = makeClient({ getEnsName: vi.fn().mockRejectedValue(thrown) });
      const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
      const error = expectError(await service.resolveAddress(VITALIK_ADDRESS));
      expect(forwardOnly.has(error.code)).toBe(false);
    }
  });
});

describe('resolveAddress — suppress-on-mismatch is the anti-spoofing crux (INV-11)', () => {
  // Open Q2 (Design/Invariants → Tests): the ReverseAddressMismatch suppress path, pinned with a
  // real viem decoded revert fixture. The mismatched name must appear NOWHERE — not surfaced, not
  // thrown — folding cleanly to ADDRESS_NOT_FOUND (Approach A / Revision 2).
  it('Q2 — a ReverseAddressMismatch folds to ADDRESS_NOT_FOUND; the name is never surfaced or thrown', async () => {
    const spoofedName = 'victim.eth';
    // Even if a (hypothetical) mismatched name were carried on the revert, SF-3 must never read it.
    const revert = makeDecodedRevert('ReverseAddressMismatch');
    const { client } = makeClient({ getEnsName: vi.fn().mockRejectedValue(revert) });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);

    const result = await service.resolveAddress(VITALIK_ADDRESS);

    expect(result.ok).toBe(false); // not a success
    if (result.ok) return;
    expect(result.error.code).toBe('ADDRESS_NOT_FOUND');
    // The mismatched name string appears nowhere in the returned value.
    expect(JSON.stringify(result)).not.toContain(spoofedName);
  });

  it('Q3 — a CROSS-REALM ReverseAddressMismatch (fails instanceof) degrades SAFELY → ADAPTER_ERROR', async () => {
    // DIVERGENCE (Code Draft decision, Invariants Q3): `service.ts` gates the `errorName` read on
    // `error instanceof BaseError` (symmetric with the forward path). A foreign-realm/bundled-viem
    // mismatch matches by `.name` but fails `instanceof`, so it falls to the mapper's ADAPTER_ERROR
    // fallback rather than the ADDRESS_NOT_FOUND control-path arm. This is the IMPLEMENTED behavior
    // and it is SAFE — INV-11 still holds (no name is ever surfaced, never a throw) — just less
    // precise than a clean miss. Asserted at actual behavior.
    const { client } = makeClient({
      getEnsName: vi.fn().mockRejectedValue(foreignRealmError('ReverseAddressMismatch')),
    });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    const error = expectError(await service.resolveAddress(VITALIK_ADDRESS));
    expect(error.code).toBe('ADAPTER_ERROR'); // safe fallback — documents the actual behavior
    expect(SEVEN_CODE_SET.has(error.code)).toBe(true);
    expect(error.code).not.toBe('NAME_NOT_FOUND');
  });

  it('structural: ReverseAddressMismatch folds to empty inside attemptReverse — no name extracted', () => {
    // 002 SF-1 moved Approach A into `attemptReverse`: mismatch → `{ kind: 'empty' }`, never a surfaced
    // name and never a raw `name(bytes32)` reader that could recover one.
    const src = readServiceSource();
    expect(src).toMatch(/case 'ReverseAddressMismatch':[\s\S]*?return \{ kind: 'empty' \}/);
    expect(src).not.toMatch(/name\(bytes32\)/);
  });
});

describe('resolveAddress — deterministic classification precedence (INV-12)', () => {
  it('address-shape gate runs before unsupported-network: malformed address on non-ENS network → ADDRESS_NOT_FOUND (Design step 1)', async () => {
    const { client, getEnsName } = makeClient({ supported: false });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    // 002 SF-1 ladder step 1 is malformed → ADDRESS_NOT_FOUND (sync, before supportsEns / I/O).
    const error = expectError(await service.resolveAddress('0xnothex'));
    expect(error.code).toBe('ADDRESS_NOT_FOUND');
    if (error.code !== 'ADDRESS_NOT_FOUND') return;
    expect(error.address).toBe('0xnothex');
    expect(getEnsName).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Idempotency & Retry
// ===========================================================================

describe('resolveAddress — stateless & deterministic-under-stable-state (INV-13)', () => {
  it('two calls with equal input under a stable mock return deep-equal, distinct-identity results', async () => {
    const { client } = makeClient();
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);

    const a = await service.resolveAddress(VITALIK_ADDRESS);
    const b = await service.resolveAddress(VITALIK_ADDRESS);

    expect(a).toEqual(b); // structurally equal (incl. avatarUrl, under a stable avatar surface)
    expect(a).not.toBe(b); // fresh object each call (no memo/cache)
    if (a.ok && b.ok) expect(a.value.provenance).not.toBe(b.value.provenance);
  });

  it('interleaved concurrent calls do not interfere (no shared mutable state)', async () => {
    const getEnsName = vi.fn(async ({ address }: { address: string }) =>
      address === VITALIK_ADDRESS ? VITALIK_NAME : null
    );
    const { client } = makeClient({ getEnsName });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);

    const [hit, miss] = await Promise.all([
      service.resolveAddress(VITALIK_ADDRESS),
      service.resolveAddress('0x0000000000000000000000000000000000000001'),
    ]);

    expect(hit.ok).toBe(true);
    expect(miss.ok).toBe(false);
    if (hit.ok) expect(hit.value.name).toBe(VITALIK_NAME);
  });

  // The INV-13 avatar caveat, pinned: the reverse CORE is deterministic under stable ENS/UR state;
  // `avatarUrl` derives from a broader (possibly-flapping) surface. A flapping avatar changes only
  // `avatarUrl` presence, never the reverse core. This scopes SF-4's deep-equal (Open Q1 → SF-4).
  it('a flapping avatar changes ONLY avatarUrl presence — the reverse core is identical', async () => {
    const getEnsAvatar = vi
      .fn()
      .mockRejectedValueOnce(new Error('flap: avatar host down'))
      .mockResolvedValueOnce(AVATAR_URL);
    const { client } = makeClient({ getEnsAvatar });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);

    const first = expectValue(await service.resolveAddress(VITALIK_ADDRESS));
    const second = expectValue(await service.resolveAddress(VITALIK_ADDRESS));

    // Reverse core identical across the two calls…
    const core = ({ address, name, forwardVerified, provenance }: ResolvedName) => ({
      address,
      name,
      forwardVerified,
      provenance,
    });
    expect(core(first)).toEqual(core(second));
    // …while avatarUrl legitimately differs (absent on the flap, present on recovery).
    expect('avatarUrl' in first).toBe(false);
    expect(second.avatarUrl).toBe(AVATAR_URL);
  });
});

describe('resolveAddress — read-only & retry-safe (INV-14)', () => {
  it('touches only the read methods getEnsName + getEnsAvatar — no write/submit API is invoked', async () => {
    const getEnsName = vi.fn().mockResolvedValue(VITALIK_NAME);
    const getEnsAvatar = vi.fn().mockResolvedValue(AVATAR_URL);
    const sendTransaction = vi.fn();
    const writeContract = vi.fn();
    const client = {
      chain: makeClient().client.chain,
      getEnsName,
      getEnsAvatar,
      sendTransaction,
      writeContract,
    };
    const service = createEvmNameResolutionService(
      EVM_NETWORK_CONFIG,
      client as unknown as Parameters<typeof createEvmNameResolutionService>[1]
    );

    await service.resolveAddress(VITALIK_ADDRESS);
    await service.resolveAddress(VITALIK_ADDRESS); // retry — still a pure re-read

    expect(getEnsName).toHaveBeenCalledTimes(2);
    expect(sendTransaction).not.toHaveBeenCalled();
    expect(writeContract).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Side-Effect Ordering & Observability
// ===========================================================================

describe('resolveAddress — borrowed-client no-dispose ownership (INV-15)', () => {
  it('dispose() touches no client teardown method; the client stays usable for reverse afterward', async () => {
    const getEnsName = vi.fn().mockResolvedValue(VITALIK_NAME);
    const getEnsAvatar = vi.fn().mockResolvedValue(AVATAR_URL);
    const transportClose = vi.fn();
    const destroy = vi.fn();
    const client = {
      chain: makeClient().client.chain,
      getEnsName,
      getEnsAvatar,
      transportClose,
      destroy,
    };
    const service = createEvmNameResolutionService(
      EVM_NETWORK_CONFIG,
      client as unknown as Parameters<typeof createEvmNameResolutionService>[1]
    );

    expect(() => service.dispose()).not.toThrow();

    expect(transportClose).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
    // Borrowed client remains fully usable by the runtime after the capability is disposed.
    const result = await service.resolveAddress(VITALIK_ADDRESS);
    expect(result.ok).toBe(true);
    expect(getEnsName).toHaveBeenCalled();
  });
});

describe('resolveAddress — pre-I/O gating (INV-16)', () => {
  it('unsupported network → UNSUPPORTED_NETWORK with ZERO getEnsName/getEnsAvatar calls', async () => {
    const { client, getEnsName, getEnsAvatar } = makeClient({ supported: false });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    expect(expectError(await service.resolveAddress(VITALIK_ADDRESS)).code).toBe(
      'UNSUPPORTED_NETWORK'
    );
    expect(getEnsName).not.toHaveBeenCalled();
    expect(getEnsAvatar).not.toHaveBeenCalled();
  });

  it('malformed address → ADDRESS_NOT_FOUND with ZERO getEnsName/getEnsAvatar calls', async () => {
    const { client, getEnsName, getEnsAvatar } = makeClient();
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    expect(expectError(await service.resolveAddress('0xnothex')).code).toBe('ADDRESS_NOT_FOUND');
    expect(getEnsName).not.toHaveBeenCalled();
    expect(getEnsAvatar).not.toHaveBeenCalled();
  });

  it('valid address + supported network → EXACTLY ONE getEnsName call', async () => {
    const { client, getEnsName } = makeClient();
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    await service.resolveAddress(VITALIK_ADDRESS);
    expect(getEnsName).toHaveBeenCalledTimes(1);
  });
});

describe('resolveAddress — avatar is post-success, failure/latency-isolated (INV-17)', () => {
  it('avatar runs ONLY after a successful reverse — never on a failure path', async () => {
    // On a null/empty reverse record the avatar lookup must not be reached.
    const { client, getEnsAvatar } = makeClient({ getEnsName: vi.fn().mockResolvedValue(null) });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    await service.resolveAddress(VITALIK_ADDRESS);
    expect(getEnsAvatar).not.toHaveBeenCalled();
  });

  it('avatar runs after the reverse success is determined (getEnsName before getEnsAvatar)', async () => {
    const order: string[] = [];
    const getEnsName = vi.fn(async () => {
      order.push('name');
      return VITALIK_NAME;
    });
    const getEnsAvatar = vi.fn(async () => {
      order.push('avatar');
      return AVATAR_URL;
    });
    const { client } = makeClient({ getEnsName, getEnsAvatar });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    await service.resolveAddress(VITALIK_ADDRESS);
    expect(order).toEqual(['name', 'avatar']);
  });

  it.each([
    ['throws', vi.fn().mockRejectedValue(new Error('gateway 500'))],
    ['rejects with a non-Error', vi.fn().mockRejectedValue('boom')],
    ['returns null', vi.fn().mockResolvedValue(null)],
  ])(
    'a broken avatar (%s) never fails the reverse: still { ok:true, forwardVerified:true }, avatarUrl absent',
    async (_label, getEnsAvatar) => {
      const { client } = makeClient({ getEnsAvatar });
      const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
      const value = expectValue(await service.resolveAddress(VITALIK_ADDRESS));
      expect(value.name).toBe(VITALIK_NAME);
      expect(value.forwardVerified).toBe(true);
      expect('avatarUrl' in value).toBe(false);
    }
  );

  it('a slow avatar (fake timers) still resolves to a success once it settles — no failure, no throw', async () => {
    vi.useFakeTimers();
    try {
      const getEnsAvatar = vi.fn(
        () => new Promise((res) => setTimeout(() => res(AVATAR_URL), 60_000))
      );
      const { client } = makeClient({ getEnsAvatar });
      const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);

      const pending = service.resolveAddress(VITALIK_ADDRESS);
      await vi.advanceTimersByTimeAsync(60_000);
      const value = expectValue(await pending);

      expect(value.forwardVerified).toBe(true);
      expect(value.avatarUrl).toBe(AVATAR_URL);
    } finally {
      vi.useRealTimers();
    }
  });

  it('no avatar failure is ever mapped into a NameResolutionError code', async () => {
    // Even a viem-shaped avatar throw (gateway/timeout) is swallowed to undefined, never classified.
    const { client } = makeClient({ getEnsAvatar: vi.fn().mockRejectedValue(makeHttpError()) });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    const result = await service.resolveAddress(VITALIK_ADDRESS);
    expect(result.ok).toBe(true); // NOT an EXTERNAL_GATEWAY_ERROR
  });
});

// ===========================================================================
// Resource Limits & Rate
// ===========================================================================

describe('resolveAddress — bounded work + caller-measured elapsedMs (INV-18)', () => {
  it('performs at most one reverse UR round-trip per call (no internal retry loop)', async () => {
    const { client, getEnsName } = makeClient({
      getEnsName: vi.fn().mockRejectedValue(makeTimeoutError()),
    });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    await service.resolveAddress(VITALIK_ADDRESS);
    expect(getEnsName).toHaveBeenCalledTimes(1); // one call even on failure — no retry/backoff
  });

  it('on success the avatar is a single bounded await — getEnsAvatar called exactly once', async () => {
    const { client, getEnsAvatar } = makeClient();
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    await service.resolveAddress(VITALIK_ADDRESS);
    expect(getEnsAvatar).toHaveBeenCalledTimes(1);
  });

  it('normalizes the reverse-claimed name before getEnsAvatar (ENSIP-15)', async () => {
    // A mixed-case reverse claim must be normalized; passing it raw makes getEnsAvatar silently drop.
    const { client, getEnsAvatar } = makeClient({
      getEnsName: vi.fn().mockResolvedValue('Vitalik.ETH'),
    });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    await service.resolveAddress(VITALIK_ADDRESS);
    expect(getEnsAvatar).toHaveBeenCalledWith({ name: 'vitalik.eth', strict: true });
  });

  it('a reverse timeout maps to RESOLUTION_TIMEOUT with a REAL finite elapsedMs (never the -1 sentinel)', async () => {
    const { client } = makeClient({ getEnsName: vi.fn().mockRejectedValue(makeTimeoutError()) });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    const error = expectError(await service.resolveAddress(VITALIK_ADDRESS));
    expect(error.code).toBe('RESOLUTION_TIMEOUT');
    if (error.code !== 'RESOLUTION_TIMEOUT') return;
    expect(error.elapsedMs).not.toBe(ELAPSED_UNMEASURED); // caller obligation (SF-1 INV-12) met
    expect(Number.isFinite(error.elapsedMs)).toBe(true);
    expect(error.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('the reverse elapsedMs window excludes avatar: a failure path never invokes getEnsAvatar', async () => {
    // elapsedMs is only produced on the failure/timeout path; avatar runs only post-success. So the
    // avatar hops can never be inside the reverse timing window — asserted by their disjointness.
    const { client, getEnsAvatar } = makeClient({
      getEnsName: vi.fn().mockRejectedValue(makeTimeoutError()),
    });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    await service.resolveAddress(VITALIK_ADDRESS);
    expect(getEnsAvatar).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Sensitive Data Handling
// ===========================================================================

describe('resolveAddress — no credential-leak channel; avatar content untrusted (INV-19)', () => {
  it('a keyed provider URL in a native reverse error is REDACTED on the returned field, kept only on cause', async () => {
    const keyed = makeHttpError(KEYED_URL); // message embeds …/v2/SECRETKEY…
    const { client } = makeClient({ getEnsName: vi.fn().mockRejectedValue(keyed) });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);

    const error = expectError(await service.resolveAddress(VITALIK_ADDRESS));
    // Bare HttpRequestError with no gateway ctx → ADAPTER_ERROR (message redacted, cause retained).
    expect(error.code).toBe('ADAPTER_ERROR');
    if (error.code !== 'ADAPTER_ERROR') return;
    expect(error.message).not.toContain(ALCHEMY_KEY); // renderable field scrubbed
    expect(error.cause).toBe(keyed); // full original retained by reference (opaque)
    expect(JSON.stringify({ message: error.message })).not.toContain(ALCHEMY_KEY);
  });

  it('ADDRESS_NOT_FOUND carries ONLY the caller-supplied address — no other party data (no enumeration leak)', async () => {
    const { client } = makeClient({ getEnsName: vi.fn().mockResolvedValue(null) });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    const error = expectError(await service.resolveAddress(VITALIK_ADDRESS));
    expect(error.code).toBe('ADDRESS_NOT_FOUND');
    if (error.code !== 'ADDRESS_NOT_FOUND') return;
    expect(error.address).toBe(VITALIK_ADDRESS); // the caller's own input, already known to them
    expect(JSON.stringify(error)).not.toMatch(/:\/\//); // no URL / gateway host on the control-path error
  });

  it('structural: tryGetAvatar logs nothing (its catch swallows to undefined, never interpolating content)', () => {
    // Avatar records/URLs are untrusted, name-owner-controlled (INV-19) and must never be logged.
    const src = readServiceSource();
    const start = src.indexOf('private async tryGetAvatar');
    expect(start).toBeGreaterThan(-1);
    // Scope to the tryGetAvatar body (to the class close) and assert no logger call inside it.
    const body = src.slice(start);
    const catchIdx = body.indexOf('catch');
    expect(catchIdx).toBeGreaterThan(-1);
    expect(body.slice(0, body.indexOf('\n}')).replace(/\s/g, '')).not.toMatch(
      /logger\.(debug|info|warn|error)/
    );
  });
});

// ===========================================================================
// Performance, Scalability & Re-usability
// ===========================================================================

describe('resolveAddress — dependency-injection seam / portability (INV-20)', () => {
  it('runs against a hand-rolled minimal { chain, getEnsName, getEnsAvatar } with NO host wiring', async () => {
    // The strongest portability signal: embed the reverse capability in a bare fixture, injecting a
    // different client, with no source change and no runtime/RI singleton.
    const getEnsName = vi.fn().mockResolvedValue(VITALIK_NAME);
    const getEnsAvatar = vi.fn().mockResolvedValue(AVATAR_URL);
    const bareClient = {
      chain: {
        id: 1,
        name: 'Alt',
        contracts: { ensUniversalResolver: { address: VITALIK_ADDRESS } },
      },
      getEnsName,
      getEnsAvatar,
    };
    const service = createEvmNameResolutionService(
      EVM_NETWORK_CONFIG,
      bareClient as unknown as Parameters<typeof createEvmNameResolutionService>[1]
    );

    const value = expectValue(await service.resolveAddress(VITALIK_ADDRESS));
    expect(value.name).toBe(VITALIK_NAME);
    expect(value.avatarUrl).toBe(AVATAR_URL);
    expect(getEnsName).toHaveBeenCalledTimes(1);
    expect(getEnsAvatar).toHaveBeenCalledTimes(1);
  });
});
