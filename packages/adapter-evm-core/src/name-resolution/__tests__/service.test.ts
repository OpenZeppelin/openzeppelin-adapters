/**
 * SF-2 · `service.ts` — `EvmNameResolutionService` (forward path) test suite.
 *
 * The correctness core of the input path: a wrong forward result sends funds to the wrong address.
 * Verifies the un-guarded service directly (the guard proxy / dispose lifecycle is covered in
 * `name-resolution.factory.test.ts`) so control flow, spies, and classification are asserted with
 * no proxy in the way.
 *
 * Organized by invariant category (the service-test techniques a stateless read primitive exercises):
 *   Req/Res (INV-1, INV-2, INV-3-delegation) · Error Semantics (INV-6, INV-7, INV-8, INV-9, INV-10,
 *   INV-11, INV-12) · Idempotency (INV-13, INV-14) · Side-Effect/Obs (INV-15-service, INV-16) ·
 *   Resource (INV-18) · Sensitive Data (INV-19) · Perf/Reuse (INV-20).
 *
 * Auth / rate / interleaving-ordering / load are `n/a` for a public, stateless read primitive
 * (Invariants § Auth Boundary; INV-14/INV-18) — recorded in the artifact's Out of Scope, not stubbed.
 *
 * Every `describe` names the invariant(s) it covers; every failure-path test asserts the specific
 * mapped `code`, never a bare "returns something".
 */
import { describe, expect, it, vi } from 'vitest';

import { RuntimeDisposedError } from '@openzeppelin/ui-types';
import type {
  NameResolutionError,
  ResolutionResult,
  ResolvedAddress,
} from '@openzeppelin/ui-types';

import { ELAPSED_UNMEASURED } from '../error-mapping';
import { createEvmNameResolutionService } from '../service';
import {
  ALCHEMY_KEY,
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
} from './fixtures';

/** Narrow a result to its failure arm, failing the test loudly if it was unexpectedly `ok`. */
function expectError(result: ResolutionResult<ResolvedAddress>): NameResolutionError {
  if (result.ok) {
    throw new Error(`expected { ok: false } but got a success: ${JSON.stringify(result.value)}`);
  }
  return result.error;
}

// ===========================================================================
// Request/Response Contract
// ===========================================================================

describe('resolveName — return-shape closure (INV-1)', () => {
  // Sweep every terminal outcome class; each MUST resolve to a discriminated `{ ok }`-shaped value.
  it('every outcome is a well-formed discriminated ResolutionResult', async () => {
    const outcomes: ReadonlyArray<readonly [string, ReturnType<typeof vi.fn>, string, boolean]> = [
      ['success', vi.fn().mockResolvedValue(VITALIK_ADDRESS), 'vitalik.eth', true],
      ['null → not-found', vi.fn().mockResolvedValue(null), 'vitalik.eth', false],
      [
        'revert → classified',
        vi.fn().mockRejectedValue(makeDecodedRevert('ResolverNotFound')),
        'vitalik.eth',
        false,
      ],
      ['timeout → mapper', vi.fn().mockRejectedValue(makeTimeoutError()), 'vitalik.eth', false],
      ['invalid name', vi.fn(), '0xnotaname', false],
      ['raw transport throw', vi.fn().mockRejectedValue(new Error('boom')), 'vitalik.eth', false],
    ];

    for (const [label, getEnsAddress, name, expectOk] of outcomes) {
      const { client } = makeClient({ getEnsAddress });
      const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
      const result = await service.resolveName(name);

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
    const result = await service.resolveName('vitalik.eth');
    expect(result).not.toBeUndefined();
    expect(result).not.toBeNull();
  });
});

describe('resolveName — success-value fidelity (INV-2)', () => {
  it('EIP-55-checksums the resolved address via getAddress (never surfaces raw lowercase multicoin bytes)', async () => {
    // Multicoin / non-default paths can return lowercase hex; the success arm always rewrites to EIP-55.
    const lowercase = VITALIK_ADDRESS.toLowerCase();
    const { client, getEnsAddress } = makeClient({
      getEnsAddress: vi.fn().mockResolvedValue(lowercase),
    });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);

    const result = await service.resolveName('vitalik.eth');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.address).toBe(VITALIK_ADDRESS); // EIP-55 checksummed
    expect(result.value.address).not.toBe(lowercase);
    // SF-5 re-baseline (DEV-APPROVED, revised D-V9): the mainnet-bound forward-success provenance is
    // now an EnsProvenance — a strict superset of the SF-2 base `{ label, external }`. On this
    // on-chain (no CCIP-Read) mock, `external` stays observed-false and `coinType` is 60 (unscoped, so
    // no `scopedToNetworkId`). Resolution behavior (address, codes) is unchanged.
    expect(result.value.provenance).toEqual({
      system: 'ens',
      label: 'ENS',
      external: false,
      coinType: 60,
    });
    expect(getEnsAddress).toHaveBeenCalledTimes(1);
  });

  it('a malformed / non-EVM resolved value folds to NAME_NOT_FOUND (never ok:true)', async () => {
    // ENSIP-9 multicoin records are arbitrary user-set bytes — fund-safety requires validation.
    const { client } = makeClient({
      getEnsAddress: vi.fn().mockResolvedValue('0xdead'), // too short to be an EVM address
    });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    expect(expectError(await service.resolveName('evil.eth')).code).toBe('NAME_NOT_FOUND');
  });

  it('echoes the caller ORIGINAL input as value.name, not the normalized form', async () => {
    const { client, getEnsAddress } = makeClient({
      getEnsAddress: vi.fn().mockResolvedValue(VITALIK_ADDRESS),
    });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);

    const result = await service.resolveName('Vitalik.ETH'); // mixed-case input

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('Vitalik.ETH'); // original echoed
    // Mainnet-bound (coinType 60) omits explicit `coinType` so viem uses its default (legacy-
    // compatible, checksummed) path — only `name` + `strict: true` are passed.
    expect(getEnsAddress).toHaveBeenCalledWith({
      name: 'vitalik.eth',
      strict: true,
    });
  });

  it('a null return is NAME_NOT_FOUND — never { ok:true } with a zero/placeholder address', async () => {
    const { client } = makeClient({ getEnsAddress: vi.fn().mockResolvedValue(null) });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);

    const error = expectError(await service.resolveName('vitalik.eth'));
    expect(error.code).toBe('NAME_NOT_FOUND');
  });
});

describe('isValidName — service delegates to the shared client-free gate (INV-3)', () => {
  it('returns booleans without touching the client', () => {
    const { client, getEnsAddress } = makeClient();
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);

    expect(service.isValidName('vitalik.eth')).toBe(true);
    expect(service.isValidName(VITALIK_ADDRESS)).toBe(false);
    expect(service.isValidName('')).toBe(false);
    expect(getEnsAddress).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Error Semantics
// ===========================================================================

describe('resolveName — never-throw for expected failures (INV-6)', () => {
  const EXPECTED_FAILURES: ReadonlyArray<readonly [string, unknown]> = [
    ['viem TimeoutError', makeTimeoutError()],
    ['viem HttpRequestError', makeHttpError()],
    ['decoded ResolverNotFound revert', makeDecodedRevert('ResolverNotFound')],
    ['decoded ResolverError revert', makeDecodedRevert('ResolverError')],
    ['decoded UnsupportedResolverProfile revert', makeDecodedRevert('UnsupportedResolverProfile')],
    ['ChainDoesNotSupportContract', makeChainUnsupportedError()],
    ['a non-Error primitive throw (string)', 'boom'],
    ['a non-Error primitive throw (number)', 42],
    ['null thrown', null],
    ['foreign-realm offchain error', foreignRealmError('OffchainLookupError')],
  ];

  it.each(EXPECTED_FAILURES)('resolves (never rejects) on %s', async (_label, thrown) => {
    const { client } = makeClient({ getEnsAddress: vi.fn().mockRejectedValue(thrown) });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);

    // The assertion is that this does NOT reject — `.resolves` fails loudly on a rejection.
    const result = await service.resolveName('vitalik.eth');
    expect(result.ok).toBe(false);
  });

  it('RuntimeDisposedError is the ONE sanctioned throw — the mapper re-throws it, never masks it', async () => {
    // SF-1's mapper re-throws the programmer-error allowlist. If a disposed-client teardown surfaced
    // as a RuntimeDisposedError from the network call, resolveName must NOT swallow it into an
    // ADAPTER_ERROR — it propagates (the guard proxy is the normal raiser; see the factory suite).
    const { client } = makeClient({
      getEnsAddress: vi.fn().mockRejectedValue(new RuntimeDisposedError('nameResolution')),
    });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);

    await expect(service.resolveName('vitalik.eth')).rejects.toBeInstanceOf(RuntimeDisposedError);
  });
});

describe('resolveName — strict:true is mandatory on getEnsAddress (INV-7)', () => {
  it('invokes getEnsAddress with strict:true (fund-safety: distinct failures never collapse to null)', async () => {
    const { client, getEnsAddress } = makeClient();
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);

    await service.resolveName('vitalik.eth');

    expect(getEnsAddress).toHaveBeenCalledTimes(1);
    expect(getEnsAddress.mock.calls[0][0]).toMatchObject({ strict: true });
  });
});

describe('resolveName — NAME_NOT_FOUND from BOTH the null path and classified reverts (INV-8)', () => {
  it('null return → NAME_NOT_FOUND (case 1: structural success, empty record)', async () => {
    const { client } = makeClient({ getEnsAddress: vi.fn().mockResolvedValue(null) });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    expect(expectError(await service.resolveName('vitalik.eth')).code).toBe('NAME_NOT_FOUND');
  });

  it('ResolverNotFound revert → NAME_NOT_FOUND (case 2)', async () => {
    const { client } = makeClient({
      getEnsAddress: vi.fn().mockRejectedValue(makeDecodedRevert('ResolverNotFound')),
    });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    expect(expectError(await service.resolveName('unregistered.eth')).code).toBe('NAME_NOT_FOUND');
  });

  it('ResolverNotContract revert → NAME_NOT_FOUND (case 2)', async () => {
    const { client } = makeClient({
      getEnsAddress: vi.fn().mockRejectedValue(makeDecodedRevert('ResolverNotContract')),
    });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    expect(expectError(await service.resolveName('unregistered.eth')).code).toBe('NAME_NOT_FOUND');
  });

  it('ResolverError revert → NAME_NOT_FOUND (viem null-equivalent UR error)', async () => {
    const { client } = makeClient({
      getEnsAddress: vi.fn().mockRejectedValue(makeDecodedRevert('ResolverError')),
    });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    expect(expectError(await service.resolveName('unregistered.eth')).code).toBe('NAME_NOT_FOUND');
  });

  it('an unregistered name on an ENS-SUPPORTED network is NAME_NOT_FOUND, NOT UNSUPPORTED_NETWORK', async () => {
    // The D-B support-gate already passed (fixture chain has a Universal Resolver), so a resolver-level
    // revert reaching the catch is necessarily about the NAME — the fork-verify note (Invariants Q1).
    const { client } = makeClient({
      supported: true,
      getEnsAddress: vi.fn().mockRejectedValue(makeDecodedRevert('ResolverNotFound')),
    });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    const error = expectError(await service.resolveName('unregistered.eth'));
    expect(error.code).toBe('NAME_NOT_FOUND');
    expect(error.code).not.toBe('UNSUPPORTED_NETWORK');
  });
});

describe('resolveName — not-found is produced ONLY on SF-2 control path (INV-9)', () => {
  it('the default (mapper) arm never yields a not-found — an unclassified error is ADAPTER_ERROR', async () => {
    const { client } = makeClient({ getEnsAddress: vi.fn().mockRejectedValue(new Error('weird')) });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    const error = expectError(await service.resolveName('vitalik.eth'));
    expect(error.code).toBe('ADAPTER_ERROR');
    expect(error.code).not.toBe('NAME_NOT_FOUND');
    expect(error.code).not.toBe('ADDRESS_NOT_FOUND');
  });

  it('a gateway-shaped error delegated to the mapper is EXTERNAL_GATEWAY_ERROR, never NAME_NOT_FOUND', async () => {
    const { client } = makeClient({
      getEnsAddress: vi.fn().mockRejectedValue(foreignRealmError('OffchainLookupError')),
    });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    expect(expectError(await service.resolveName('offchain.eth')).code).toBe(
      'EXTERNAL_GATEWAY_ERROR'
    );
  });
});

describe('resolveName — total & closed classification over the seven-code union (INV-10)', () => {
  // The forward-path class→code table (Design D-E), exercised end-to-end through resolveName.
  const TABLE: ReadonlyArray<readonly [string, unknown, NameResolutionError['code']]> = [
    ['decoded ResolverNotFound', makeDecodedRevert('ResolverNotFound'), 'NAME_NOT_FOUND'],
    ['decoded ResolverNotContract', makeDecodedRevert('ResolverNotContract'), 'NAME_NOT_FOUND'],
    ['decoded ResolverError', makeDecodedRevert('ResolverError'), 'NAME_NOT_FOUND'],
    [
      'decoded UnsupportedResolverProfile',
      makeDecodedRevert('UnsupportedResolverProfile'),
      'UNSUPPORTED_NAME',
    ],
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
    const { client } = makeClient({ getEnsAddress: vi.fn().mockRejectedValue(thrown) });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    const error = expectError(await service.resolveName('vitalik.eth'));
    expect(error.code).toBe(expectedCode);
    expect(SEVEN_CODE_SET.has(error.code)).toBe(true); // never an invented code
  });

  it('an unclassifiable throw maps to ADAPTER_ERROR carrying the original as opaque cause', async () => {
    const original = new Error('mystery');
    const { client } = makeClient({ getEnsAddress: vi.fn().mockRejectedValue(original) });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    const error = expectError(await service.resolveName('vitalik.eth'));
    expect(error.code).toBe('ADAPTER_ERROR');
    if (error.code !== 'ADAPTER_ERROR') return;
    expect(error.cause).toBe(original); // preserved by reference
  });

  it('every success also stays within the union contract (ok:true → ResolvedAddress)', async () => {
    const { client } = makeClient();
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    const result = await service.resolveName('vitalik.eth');
    expect(result.ok).toBe(true);
  });
});

describe('resolveName — UNSUPPORTED_NAME classification (INV-11, sites 1 & 3)', () => {
  it('site 1 — the shape gate fails → UNSUPPORTED_NAME "not a well-formed ENS name"', async () => {
    const { client, getEnsAddress } = makeClient();
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    const error = expectError(await service.resolveName(VITALIK_ADDRESS)); // a hex address is not a name
    expect(error.code).toBe('UNSUPPORTED_NAME');
    if (error.code !== 'UNSUPPORTED_NAME') return;
    expect(error.reason).toBe('not a well-formed ENS name');
    expect(getEnsAddress).not.toHaveBeenCalled(); // rejected before any I/O
  });

  it('site 3 — UnsupportedResolverProfile revert → UNSUPPORTED_NAME (not NAME_NOT_FOUND, not ADAPTER_ERROR)', async () => {
    const { client } = makeClient({
      getEnsAddress: vi.fn().mockRejectedValue(makeDecodedRevert('UnsupportedResolverProfile')),
    });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    const error = expectError(await service.resolveName('noaddr.eth'));
    expect(error.code).toBe('UNSUPPORTED_NAME');
    if (error.code !== 'UNSUPPORTED_NAME') return;
    expect(error.reason).toMatch(/does not implement address/i);
  });

  it('UNSUPPORTED_NAME is never used for a missing record (that is NAME_NOT_FOUND)', async () => {
    const { client } = makeClient({ getEnsAddress: vi.fn().mockResolvedValue(null) });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    expect(expectError(await service.resolveName('vitalik.eth')).code).toBe('NAME_NOT_FOUND');
  });
});

describe('resolveName — instanceof-brittleness of the resolver-revert switch (INV-6 safety / INV-10)', () => {
  // A REAL viem decoded ResolverNotFound is `instanceof BaseError`, so the switch classifies it
  // precisely to NAME_NOT_FOUND (the happy classification).
  it('a REAL (in-realm) ResolverNotFound revert classifies precisely → NAME_NOT_FOUND', async () => {
    const { client } = makeClient({
      getEnsAddress: vi.fn().mockRejectedValue(makeDecodedRevert('ResolverNotFound')),
    });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    expect(expectError(await service.resolveName('unregistered.eth')).code).toBe('NAME_NOT_FOUND');
  });

  // DIVERGENCE (see artifact Open Questions): the Invariants Dev Notes hoped the `errorName` needle
  // would backstop the switch cross-realm. It does NOT — `service.ts` gates `extractRevertInfo` on
  // `error instanceof BaseError`, so a foreign-realm/bundled-viem ResolverNotFound (matching by
  // `.name` but failing `instanceof`) falls to the mapper's ADAPTER_ERROR fallback. This is the
  // IMPLEMENTED behavior (Code Draft acknowledged it) and it is SAFE — INV-6 (never throws), INV-10
  // (closed union, cause preserved), never a coerced address — just LESS PRECISE than not-found.
  it('a FOREIGN-REALM ResolverNotFound (fails instanceof) degrades safely → ADAPTER_ERROR (not a throw, not a wrong address)', async () => {
    const { client } = makeClient({
      getEnsAddress: vi.fn().mockRejectedValue(foreignRealmError('ResolverNotFound')),
    });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    const error = expectError(await service.resolveName('unregistered.eth'));
    expect(error.code).toBe('ADAPTER_ERROR'); // safe fallback — documents the actual behavior
    expect(SEVEN_CODE_SET.has(error.code)).toBe(true);
  });

  it('a FOREIGN-REALM UnsupportedResolverProfile likewise degrades safely → ADAPTER_ERROR', async () => {
    const { client } = makeClient({
      getEnsAddress: vi.fn().mockRejectedValue(foreignRealmError('UnsupportedResolverProfile')),
    });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    expect(expectError(await service.resolveName('noaddr.eth')).code).toBe('ADAPTER_ERROR');
  });
});

describe('resolveName — deterministic classification precedence (INV-12)', () => {
  it('support-gate wins over the shape gate: invalid name on an unsupported network → UNSUPPORTED_NETWORK', async () => {
    const { client, getEnsAddress } = makeClient({ supported: false });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    // `0xnotaname` would also fail the shape gate, but the support-gate (level 1) runs first.
    const error = expectError(await service.resolveName(VITALIK_ADDRESS));
    expect(error.code).toBe('UNSUPPORTED_NETWORK');
    if (error.code !== 'UNSUPPORTED_NETWORK') return;
    expect(error.networkId).toBe('ethereum-mainnet');
    expect(getEnsAddress).not.toHaveBeenCalled();
  });

  it('UNSUPPORTED_NETWORK carries the config id (drift D1: NetworkConfig.id, not networkId)', async () => {
    const { client } = makeClient({ supported: false });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    const error = expectError(await service.resolveName('vitalik.eth'));
    expect(error.code).toBe('UNSUPPORTED_NETWORK');
    if (error.code !== 'UNSUPPORTED_NETWORK') return;
    expect(error.networkId).toBe(EVM_NETWORK_CONFIG.id);
  });
});

// ===========================================================================
// Idempotency & Retry
// ===========================================================================

describe('resolveName — stateless & deterministic-under-stable-state (INV-13)', () => {
  it('two calls with equal input under a stable mock return deep-equal, distinct-identity results', async () => {
    const { client } = makeClient({ getEnsAddress: vi.fn().mockResolvedValue(VITALIK_ADDRESS) });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);

    const a = await service.resolveName('vitalik.eth');
    const b = await service.resolveName('vitalik.eth');

    expect(a).toEqual(b); // structurally equal
    expect(a).not.toBe(b); // fresh object each call (no memo/cache)
    if (a.ok && b.ok) expect(a.value.provenance).not.toBe(b.value.provenance); // fresh provenance too
  });

  it('interleaved concurrent calls do not interfere (no shared mutable state)', async () => {
    const getEnsAddress = vi.fn(async ({ name }: { name: string }) =>
      name === 'vitalik.eth' ? VITALIK_ADDRESS : null
    );
    const { client } = makeClient({ getEnsAddress });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);

    const [hit, miss] = await Promise.all([
      service.resolveName('vitalik.eth'),
      service.resolveName('nobody.eth'),
    ]);

    expect(hit.ok).toBe(true);
    expect(miss.ok).toBe(false);
    if (hit.ok) expect(hit.value.address).toBe(VITALIK_ADDRESS);
  });
});

describe('resolveName — read-only & retry-safe (INV-14)', () => {
  it('touches only the read method getEnsAddress — no write/submit API is invoked', async () => {
    const getEnsAddress = vi.fn().mockResolvedValue(VITALIK_ADDRESS);
    const sendTransaction = vi.fn();
    const writeContract = vi.fn();
    const client = {
      chain: makeClient().client.chain,
      getEnsAddress,
      sendTransaction,
      writeContract,
    };
    const service = createEvmNameResolutionService(
      EVM_NETWORK_CONFIG,
      client as unknown as Parameters<typeof createEvmNameResolutionService>[1]
    );

    await service.resolveName('vitalik.eth');
    await service.resolveName('vitalik.eth'); // retry — still a pure re-read

    expect(getEnsAddress).toHaveBeenCalledTimes(2);
    expect(sendTransaction).not.toHaveBeenCalled();
    expect(writeContract).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Side-Effect Ordering & Observability
// ===========================================================================

describe('service.dispose — borrowed-client no-dispose ownership (INV-15)', () => {
  it('dispose() touches no client teardown method; the client stays usable afterward', async () => {
    const getEnsAddress = vi.fn().mockResolvedValue(VITALIK_ADDRESS);
    const transportClose = vi.fn();
    const destroy = vi.fn();
    const client = { chain: makeClient().client.chain, getEnsAddress, transportClose, destroy };
    const service = createEvmNameResolutionService(
      EVM_NETWORK_CONFIG,
      client as unknown as Parameters<typeof createEvmNameResolutionService>[1]
    );

    expect(() => service.dispose()).not.toThrow();

    expect(transportClose).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
    // Borrowed client remains fully usable by the runtime after the capability is disposed.
    const result = await service.resolveName('vitalik.eth');
    expect(result.ok).toBe(true);
    expect(getEnsAddress).toHaveBeenCalled();
  });
});

describe('resolveName — pre-I/O gating (INV-16)', () => {
  it('unsupported network → UNSUPPORTED_NETWORK with ZERO getEnsAddress calls', async () => {
    const { client, getEnsAddress } = makeClient({ supported: false });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    expect(expectError(await service.resolveName('vitalik.eth')).code).toBe('UNSUPPORTED_NETWORK');
    expect(getEnsAddress).not.toHaveBeenCalled();
  });

  it('invalid name → UNSUPPORTED_NAME with ZERO getEnsAddress calls', async () => {
    const { client, getEnsAddress } = makeClient();
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    expect(expectError(await service.resolveName('notaname')).code).toBe('UNSUPPORTED_NAME');
    expect(getEnsAddress).not.toHaveBeenCalled();
  });

  it('valid name + supported network → EXACTLY ONE getEnsAddress call', async () => {
    const { client, getEnsAddress } = makeClient();
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    await service.resolveName('vitalik.eth');
    expect(getEnsAddress).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// Resource Limits & Rate
// ===========================================================================

describe('resolveName — bounded work + caller-measured elapsedMs (INV-18)', () => {
  it('performs at most one UR round-trip per call (no internal retry loop)', async () => {
    const { client, getEnsAddress } = makeClient({
      getEnsAddress: vi.fn().mockRejectedValue(makeTimeoutError()),
    });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    await service.resolveName('vitalik.eth');
    expect(getEnsAddress).toHaveBeenCalledTimes(1); // one call even on failure — no retry/backoff
  });

  it('a timeout maps to RESOLUTION_TIMEOUT with a REAL finite elapsedMs (never the -1 sentinel)', async () => {
    const { client } = makeClient({ getEnsAddress: vi.fn().mockRejectedValue(makeTimeoutError()) });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    const error = expectError(await service.resolveName('vitalik.eth'));
    expect(error.code).toBe('RESOLUTION_TIMEOUT');
    if (error.code !== 'RESOLUTION_TIMEOUT') return;
    expect(error.elapsedMs).not.toBe(ELAPSED_UNMEASURED); // caller obligation (SF-1 INV-12) met
    expect(Number.isFinite(error.elapsedMs)).toBe(true);
    expect(error.elapsedMs).toBeGreaterThanOrEqual(0);
  });
});

// ===========================================================================
// Sensitive Data Handling
// ===========================================================================

describe('resolveName — no credential-leak channel (INV-19)', () => {
  it('a keyed provider URL in a native message is REDACTED on the returned field, kept only on cause', async () => {
    const keyed = makeHttpError(KEYED_URL); // message embeds …/v2/SECRETKEY…
    const { client } = makeClient({ getEnsAddress: vi.fn().mockRejectedValue(keyed) });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);

    const error = expectError(await service.resolveName('vitalik.eth'));
    // Bare HttpRequestError with no gateway ctx → ADAPTER_ERROR (message redacted, cause retained).
    expect(error.code).toBe('ADAPTER_ERROR');
    if (error.code !== 'ADAPTER_ERROR') return;
    expect(error.message).not.toContain(ALCHEMY_KEY); // renderable field scrubbed
    expect(error.cause).toBe(keyed); // full original retained by reference (opaque)
    expect(JSON.stringify({ message: error.message })).not.toContain(ALCHEMY_KEY);
  });

  it('control-path reasons and provenance label carry no URL scheme or key-shaped substring', async () => {
    // UNSUPPORTED_NAME reason (control path) is a curated literal.
    const { client } = makeClient();
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    const error = expectError(await service.resolveName('notaname'));
    expect(error.code).toBe('UNSUPPORTED_NAME');
    if (error.code !== 'UNSUPPORTED_NAME') return;
    expect(error.reason).not.toMatch(/:\/\//);
    expect(error.reason).not.toMatch(/[A-Za-z0-9_-]{16,}/);

    const ok = await service.resolveName('vitalik.eth');
    if (ok.ok) expect(ok.value.provenance.label).toBe('ENS');
  });
});

// ===========================================================================
// Performance, Scalability & Re-usability
// ===========================================================================

describe('resolveName — dependency-injection seam / portability (INV-20)', () => {
  it('runs against a hand-rolled minimal { chain, getEnsAddress } with NO host wiring', async () => {
    // The strongest portability signal: embed the service in a bare fixture, injecting a different
    // client, with no source change and no runtime/RI singleton.
    const getEnsAddress = vi.fn().mockResolvedValue(VITALIK_ADDRESS);
    const bareClient = {
      chain: {
        id: 1,
        name: 'Alt',
        contracts: { ensUniversalResolver: { address: VITALIK_ADDRESS } },
      },
      getEnsAddress,
    };
    const service = createEvmNameResolutionService(
      EVM_NETWORK_CONFIG,
      bareClient as unknown as Parameters<typeof createEvmNameResolutionService>[1]
    );

    const result = await service.resolveName('vitalik.eth');
    expect(result.ok).toBe(true);
    expect(getEnsAddress).toHaveBeenCalledTimes(1);
  });
});
