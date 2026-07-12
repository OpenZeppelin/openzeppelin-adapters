/**
 * SF-5 · `service.ts` — ENS v2 forward-path extension test suite.
 *
 * SF-2 verified the base forward path; this suite verifies what SF-5 ADDS to it: a truthful,
 * OBSERVED `external` + an `EnsProvenance` on EVERY forward success (mainnet-bound CCIP-Read AND the
 * L1 cross-chain path), the additive `ensL1Client` client-selection ladder, and the never-silent
 * v2-gateway failure surface — while regressing none of SF-2's fund-safety contract (that stays green
 * in `service.test.ts`, re-baselined only for the provenance shape).
 *
 * The offchain observation is exercised via a mock `getEnsAddress` that traverses the client-level
 * `ccipRead.request` hook exactly as viem's `offchainLookup` does (see `fixtures.offchainGetEnsAddress`)
 * — deterministic, no network. A LIVE `test.offchaindemo.eth` probe and a full real-viem CCIP-Read
 * round-trip are integration/e2e scope (see the artifact's Out of Scope), because viem@2.44.4 routes
 * CCIP-Read through a nested batch-gateway protocol whose faithful reproduction would couple the unit
 * suite to viem internals.
 *
 * Organized by invariant category:
 *   Req/Res — INV-1, INV-2, INV-3, INV-6, INV-7, INV-8, INV-9, INV-10
 *   Error   — INV-11, INV-12, INV-13, INV-14, INV-15, INV-16, INV-17
 *   Idempotency — INV-18 (race-freedom), INV-19, INV-20
 *   Side-Effect/Obs — INV-21, INV-22 (selection-before-shape), INV-23
 *   Sensitive Data — INV-24
 *   Perf/Reuse — INV-25, INV-26
 *
 * DIRECTIVE (Code drift #1): the DELIVERED precedence is SELECTION-BEFORE-SHAPE — a malformed name on
 * an unsupported network returns `UNSUPPORTED_NETWORK` (SF-2 parity, zero-regression). INV-22's tests
 * assert THIS delivered behavior, not the invariants doc's shape-first wording (a known reword).
 */
import { createPublicClient, custom, HttpRequestError } from 'viem';
import { mainnet } from 'viem/chains';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { RuntimeDisposedError } from '@openzeppelin/ui-types';
import type {
  NameResolutionError,
  ResolutionResult,
  ResolvedAddress,
} from '@openzeppelin/ui-types';

import type { CreateNameResolutionOptions } from '../../capabilities/name-resolution';
import { isEnsProvenance } from '../ens-provenance';
import { ELAPSED_UNMEASURED } from '../error-mapping';
import { createEvmNameResolutionService } from '../service';
import {
  ALCHEMY_KEY,
  BASE_COIN_TYPE,
  BASE_COIN_TYPE_BIGINT,
  EVM_NETWORK_CONFIG,
  foreignRealmError,
  KEYED_L1_RPC_URL,
  L2_NETWORK_CONFIG,
  makeClient,
  makeHttpError,
  makeTimeoutError,
  NON_ENSIP11_NETWORK_CONFIG,
  offchainGetEnsAddress,
  SEVEN_CODE_SET,
  VITALIK_ADDRESS,
} from './fixtures';

/** Narrow a result to its failure arm, failing loudly if it was unexpectedly `ok`. */
function expectError(result: ResolutionResult<ResolvedAddress>): NameResolutionError {
  if (result.ok) {
    throw new Error(`expected { ok: false } but got a success: ${JSON.stringify(result.value)}`);
  }
  return result.error;
}

/** Narrow a result to its success arm, failing loudly if it was unexpectedly an error. */
function expectOk(result: ResolutionResult<ResolvedAddress>): ResolvedAddress {
  if (!result.ok) {
    throw new Error(`expected { ok: true } but got an error: ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

/**
 * Build a service on the L1 cross-chain branch: the BOUND network is an L2 with no Universal Resolver,
 * so selection falls to the injected `ensL1Client`, on which the one `getEnsAddress` call is made.
 */
function makeL1Service(
  l1Opts: Parameters<typeof makeClient>[0] = {},
  config: typeof L2_NETWORK_CONFIG = L2_NETWORK_CONFIG
) {
  const bound = makeClient({ supported: false }); // L2, no UR
  const l1 = makeClient(l1Opts);
  const service = createEvmNameResolutionService(config, bound.client, l1.client);
  return { service, bound, l1 };
}

// ===========================================================================
// Request/Response Contract
// ===========================================================================

describe('resolveName — return-shape closure over every SF-5 path (INV-1)', () => {
  it('mainnet-bound and L1 paths, plus each new failure branch, all resolve to a discriminated { ok }', async () => {
    // mainnet-bound success
    const mainnet = createEvmNameResolutionService(EVM_NETWORK_CONFIG, makeClient().client);
    expect((await mainnet.resolveName('vitalik.eth')).ok).toBe(true);

    // L1-path success
    const { service: l1 } = makeL1Service();
    expect((await l1.resolveName('vitalik.eth')).ok).toBe(true);

    // L2 with NO ensL1Client → UNSUPPORTED_NETWORK (D-B parity)
    const l2NoClient = createEvmNameResolutionService(
      L2_NETWORK_CONFIG,
      makeClient({ supported: false }).client
    );
    expect((await l2NoClient.resolveName('vitalik.eth')).ok).toBe(false);

    // bad chainId with ensL1Client → deriveCoinType throw contained → UNSUPPORTED_NETWORK
    const { service: bad } = makeL1Service({}, NON_ENSIP11_NETWORK_CONFIG);
    const badResult = await bad.resolveName('vitalik.eth');
    expect(badResult).toHaveProperty('ok');
    expect(badResult.ok).toBe(false);

    // L1-path null → NAME_NOT_FOUND
    const { service: nul } = makeL1Service({ getEnsAddress: vi.fn().mockResolvedValue(null) });
    expect((await nul.resolveName('vitalik.eth')).ok).toBe(false);
  });
});

describe('resolveName — success-value fidelity on BOTH branches; only provenance changes (INV-2)', () => {
  it('L1-path success EIP-55-checksums the resolved address and echoes the original name', async () => {
    const lowercase = VITALIK_ADDRESS.toLowerCase();
    const { service } = makeL1Service({
      getEnsAddress: vi.fn().mockResolvedValue(lowercase),
    });
    const value = expectOk(await service.resolveName('Vitalik.ETH')); // mixed-case input
    expect(value.address).toBe(VITALIK_ADDRESS); // EIP-55 checksummed (multicoin path returns raw bytes)
    expect(value.name).toBe('Vitalik.ETH'); // original echoed, not normalized
  });

  it('L1-path malformed multicoin bytes fold to NAME_NOT_FOUND (never ok:true)', async () => {
    const { service } = makeL1Service({
      getEnsAddress: vi.fn().mockResolvedValue('0xdead'),
    });
    expect(expectError(await service.resolveName('evil.eth')).code).toBe('NAME_NOT_FOUND');
  });

  it('a null return on the L1 branch is NAME_NOT_FOUND — never { ok:true } with a placeholder address', async () => {
    const { service } = makeL1Service({ getEnsAddress: vi.fn().mockResolvedValue(null) });
    expect(expectError(await service.resolveName('vitalik.eth')).code).toBe('NAME_NOT_FOUND');
  });
});

describe('resolveName — an EnsProvenance rides EVERY forward success (INV-3 / INV-10)', () => {
  it('mainnet-bound success carries an EnsProvenance that isEnsProvenance narrows (system: "ens")', async () => {
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, makeClient().client);
    const { provenance } = expectOk(await service.resolveName('vitalik.eth'));
    expect(isEnsProvenance(provenance)).toBe(true);
    if (isEnsProvenance(provenance)) expect(provenance.system).toBe('ens');
  });

  it('L1-path success likewise carries a narrowing EnsProvenance', async () => {
    const { service } = makeL1Service();
    const { provenance } = expectOk(await service.resolveName('vitalik.eth'));
    expect(isEnsProvenance(provenance)).toBe(true);
  });

  it('two successes return distinct-identity provenance objects (fresh per call, no singleton)', async () => {
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, makeClient().client);
    const a = expectOk(await service.resolveName('vitalik.eth'));
    const b = expectOk(await service.resolveName('vitalik.eth'));
    expect(a.provenance).toEqual(b.provenance);
    expect(a.provenance).not.toBe(b.provenance);
  });
});

describe('resolveName — coinType is chosen from the bound network (INV-6)', () => {
  it('mainnet-bound success reports coinType 60 (unscoped)', async () => {
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, makeClient().client);
    const { provenance } = expectOk(await service.resolveName('vitalik.eth'));
    if (!isEnsProvenance(provenance)) throw new Error('expected EnsProvenance');
    expect(provenance.coinType).toBe(60);
  });

  it('a Base-bound L1-path success reports coinType 2147492101 as a safe-integer number', async () => {
    const { service } = makeL1Service();
    const { provenance } = expectOk(await service.resolveName('vitalik.eth'));
    if (!isEnsProvenance(provenance)) throw new Error('expected EnsProvenance');
    expect(provenance.coinType).toBe(BASE_COIN_TYPE);
    expect(Number.isSafeInteger(provenance.coinType)).toBe(true);
  });
});

describe('resolveName — scopedToNetworkId present IFF chain-scoped (INV-7 / spec scenario-1)', () => {
  it('mainnet-bound success OMITS the key entirely (never presented as scoped)', async () => {
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, makeClient().client);
    const { provenance } = expectOk(await service.resolveName('vitalik.eth'));
    expect('scopedToNetworkId' in provenance).toBe(false);
  });

  it('a Base-bound L1-path success carries scopedToNetworkId = the BOUND network id, not mainnet', async () => {
    const { service } = makeL1Service();
    const { provenance } = expectOk(await service.resolveName('vitalik.eth'));
    if (!isEnsProvenance(provenance)) throw new Error('expected EnsProvenance');
    expect(provenance.scopedToNetworkId).toBe('base-mainnet');
    expect(provenance.scopedToNetworkId).not.toBe('ethereum-mainnet');
  });
});

describe('resolveName — label is the curated literal chosen from observed external (INV-8)', () => {
  it('on-chain success → label "ENS"; offchain-traversed success → "ENS via external gateway"', async () => {
    const onchain = createEvmNameResolutionService(EVM_NETWORK_CONFIG, makeClient().client);
    expect(expectOk(await onchain.resolveName('vitalik.eth')).provenance.label).toBe('ENS');

    const offchain = createEvmNameResolutionService(
      EVM_NETWORK_CONFIG,
      makeClient({ offchain: true }).client
    );
    expect(expectOk(await offchain.resolveName('vitalik.eth')).provenance.label).toBe(
      'ENS via external gateway'
    );
  });
});

describe('resolveName — external is OBSERVED, not inferred (INV-9)', () => {
  it('a name resolved through a CCIP-Read traversal → external: true (observed via the ccipRead hook)', async () => {
    const service = createEvmNameResolutionService(
      EVM_NETWORK_CONFIG,
      makeClient({ offchain: true }).client
    );
    expect(expectOk(await service.resolveName('vitalik.eth')).provenance.external).toBe(true);
  });

  it('a name resolved fully on-chain → external: false', async () => {
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, makeClient().client);
    expect(expectOk(await service.resolveName('vitalik.eth')).provenance.external).toBe(false);
  });

  it('external is NEVER inferred from the name — an "offchain"-looking name resolved on-chain is external: false', async () => {
    // The inference hazard G1 forbids: a plain on-chain mock resolving a name whose TLD/label might
    // tempt a suffix heuristic. Only the actual hook traversal is truthful.
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, makeClient().client);
    expect(expectOk(await service.resolveName('test.offchaindemo.eth')).provenance.external).toBe(
      false
    );
  });

  it('the offchain observation delegates to the source ccipRead hook (no new network connection)', async () => {
    const { client, ccipRequest } = makeClient({ offchain: true });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    await service.resolveName('vitalik.eth');
    expect(ccipRequest).toHaveBeenCalledTimes(1); // wrapper delegated to the borrowed hook, not viem's networked default
  });
});

// ===========================================================================
// Error Semantics
// ===========================================================================

describe('resolveName — never-throw across the new branches (INV-11)', () => {
  const L1_FAILURES: ReadonlyArray<readonly [string, unknown]> = [
    ['viem TimeoutError', makeTimeoutError()],
    ['viem HttpRequestError', makeHttpError()],
    ['a non-Error primitive', 'boom'],
    ['foreign-realm offchain error', foreignRealmError('OffchainLookupError')],
  ];

  it.each(L1_FAILURES)('L1 path resolves (never rejects) on %s', async (_label, thrown) => {
    const { service } = makeL1Service({ getEnsAddress: vi.fn().mockRejectedValue(thrown) });
    const result = await service.resolveName('vitalik.eth');
    expect(result.ok).toBe(false);
  });

  it('RuntimeDisposedError from the network call is re-thrown, never masked into ADAPTER_ERROR (L1 path)', async () => {
    const { service } = makeL1Service({
      getEnsAddress: vi.fn().mockRejectedValue(new RuntimeDisposedError('nameResolution')),
    });
    await expect(service.resolveName('vitalik.eth')).rejects.toBeInstanceOf(RuntimeDisposedError);
  });
});

describe('resolveName — strict:true is mandatory on BOTH client-selection branches (INV-12)', () => {
  it('mainnet-bound call omits coinType (viem default path) and carries strict: true', async () => {
    const { client, getEnsAddress } = makeClient();
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    await service.resolveName('vitalik.eth');
    expect(getEnsAddress).toHaveBeenCalledWith({
      name: 'vitalik.eth',
      strict: true,
    });
  });

  it('L1-path call carries { coinType: <Base>, strict: true } on the ensL1Client', async () => {
    const { service, l1 } = makeL1Service();
    await service.resolveName('vitalik.eth');
    expect(l1.getEnsAddress).toHaveBeenCalledWith({
      name: 'vitalik.eth',
      coinType: BASE_COIN_TYPE_BIGINT,
      strict: true,
    });
  });
});

describe('resolveName — viaGateway = observed sawOffchain, on both paths (INV-13)', () => {
  it('mainnet-bound: a timeout AFTER an offchain traversal dominates to EXTERNAL_GATEWAY_ERROR', async () => {
    // getEnsAddress traverses the hook (offchain observed), THEN throws a timeout.
    const getEnsAddress = offchainGetEnsAddress(() => {
      throw makeTimeoutError();
    });
    const service = createEvmNameResolutionService(
      EVM_NETWORK_CONFIG,
      makeClient({ offchain: true, getEnsAddress }).client
    );
    expect(expectError(await service.resolveName('vitalik.eth')).code).toBe(
      'EXTERNAL_GATEWAY_ERROR'
    );
  });

  it('mainnet-bound: the SAME timeout WITHOUT an offchain traversal is RESOLUTION_TIMEOUT', async () => {
    const service = createEvmNameResolutionService(
      EVM_NETWORK_CONFIG,
      makeClient({ getEnsAddress: vi.fn().mockRejectedValue(makeTimeoutError()) }).client
    );
    expect(expectError(await service.resolveName('vitalik.eth')).code).toBe('RESOLUTION_TIMEOUT');
  });

  it('L1 path: a timeout after an offchain traversal likewise dominates to EXTERNAL_GATEWAY_ERROR', async () => {
    const getEnsAddress = offchainGetEnsAddress(() => {
      throw makeTimeoutError();
    });
    const { service } = makeL1Service({ offchain: true, getEnsAddress });
    expect(expectError(await service.resolveName('vitalik.eth')).code).toBe(
      'EXTERNAL_GATEWAY_ERROR'
    );
  });
});

describe('resolveName — never a silent v2→v1 fallback (INV-14)', () => {
  it('a gateway failure after traversal → EXTERNAL_GATEWAY_ERROR, DISTINCT from NAME_NOT_FOUND', async () => {
    const getEnsAddress = offchainGetEnsAddress(() => {
      throw makeHttpError();
    });
    const service = createEvmNameResolutionService(
      EVM_NETWORK_CONFIG,
      makeClient({ offchain: true, getEnsAddress }).client
    );
    const error = expectError(await service.resolveName('vitalik.eth'));
    expect(error.code).toBe('EXTERNAL_GATEWAY_ERROR');
    expect(error.code).not.toBe('NAME_NOT_FOUND');
  });

  it('exactly ONE getEnsAddress call even on gateway failure — no retry, no second/on-chain read', async () => {
    const getEnsAddress = offchainGetEnsAddress(() => {
      throw makeHttpError();
    });
    const { client } = makeClient({ offchain: true, getEnsAddress });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    await service.resolveName('vitalik.eth');
    expect(getEnsAddress).toHaveBeenCalledTimes(1);
  });
});

describe('resolveName — classification stays closed over the seven codes; SF-5 adds none (INV-15)', () => {
  const TABLE: ReadonlyArray<readonly [string, unknown, NameResolutionError['code']]> = [
    ['timeout (no gateway ctx)', makeTimeoutError(), 'RESOLUTION_TIMEOUT'],
    [
      'foreign-realm OffchainLookupError',
      foreignRealmError('OffchainLookupError'),
      'EXTERNAL_GATEWAY_ERROR',
    ],
    ['generic Error', new Error('weird'), 'ADAPTER_ERROR'],
  ];

  it.each(TABLE)('L1 path: %s → %s (within the closed union)', async (_label, thrown, expected) => {
    const { service } = makeL1Service({ getEnsAddress: vi.fn().mockRejectedValue(thrown) });
    const error = expectError(await service.resolveName('vitalik.eth'));
    expect(error.code).toBe(expected);
    expect(SEVEN_CODE_SET.has(error.code)).toBe(true);
  });
});

describe('resolveName — deriveCoinType throw is contained → UNSUPPORTED_NETWORK before any I/O (INV-16)', () => {
  it('a non-ENSIP-11 bound chainId with an ensL1Client wired → UNSUPPORTED_NETWORK, ZERO getEnsAddress calls', async () => {
    const { service, l1 } = makeL1Service({}, NON_ENSIP11_NETWORK_CONFIG);
    const error = expectError(await service.resolveName('vitalik.eth'));
    expect(error.code).toBe('UNSUPPORTED_NETWORK');
    if (error.code === 'UNSUPPORTED_NETWORK') expect(error.networkId).toBe('exotic-chain');
    expect(l1.getEnsAddress).not.toHaveBeenCalled(); // contained synchronously, before I/O
  });

  it('a valid ENSIP-11 bound chainId proceeds to exactly one getEnsAddress call', async () => {
    const { service, l1 } = makeL1Service();
    await service.resolveName('vitalik.eth');
    expect(l1.getEnsAddress).toHaveBeenCalledTimes(1);
  });
});

describe('resolveName — deterministic gated client-selection precedence (INV-17)', () => {
  it('bound-with-UR → mainnet-bound branch (coinType 60, bound client used)', async () => {
    const { client, getEnsAddress } = makeClient();
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    const { provenance } = expectOk(await service.resolveName('vitalik.eth'));
    if (!isEnsProvenance(provenance)) throw new Error('expected EnsProvenance');
    expect(provenance.coinType).toBe(60);
    expect(getEnsAddress).toHaveBeenCalledTimes(1);
  });

  it('L2-bound WITH ensL1Client → L1 branch (derived coinType, ensL1Client used)', async () => {
    const { service, bound, l1 } = makeL1Service();
    await service.resolveName('vitalik.eth');
    expect(l1.getEnsAddress).toHaveBeenCalledTimes(1);
    expect(bound.getEnsAddress).not.toHaveBeenCalled(); // the L2 bound client is NOT used to resolve
  });

  it('L2-bound WITHOUT ensL1Client → UNSUPPORTED_NETWORK (D-B preserved, SF-2 parity)', async () => {
    const bound = makeClient({ supported: false });
    const service = createEvmNameResolutionService(L2_NETWORK_CONFIG, bound.client);
    const error = expectError(await service.resolveName('vitalik.eth'));
    expect(error.code).toBe('UNSUPPORTED_NETWORK');
    expect(bound.getEnsAddress).not.toHaveBeenCalled();
  });

  it('mainnet-bound WITH an ensL1Client ALSO present → still the bound branch (bound wins, no redundant L1 hop)', async () => {
    const bound = makeClient(); // has UR
    const l1 = makeClient();
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, bound.client, l1.client);
    await service.resolveName('vitalik.eth');
    expect(bound.getEnsAddress).toHaveBeenCalledTimes(1);
    expect(l1.getEnsAddress).not.toHaveBeenCalled(); // ensL1Client left untouched
  });
});

// ===========================================================================
// Idempotency & Retry
// ===========================================================================

describe('resolveName — race-free offchain observation across interleaved calls (INV-18)', () => {
  it('N interleaved calls over ONE shared client — each external matches its OWN path, no A→B bleed', async () => {
    // Only names starting with "off" traverse offchain; the rest resolve on-chain. All over one client.
    const shouldGoOffchain = (name: string) => name.startsWith('off');
    const getEnsAddress = offchainGetEnsAddress(() => VITALIK_ADDRESS, shouldGoOffchain);
    const { client, ccipRequest } = makeClient({
      getEnsAddress,
      ccipRequest: vi.fn().mockResolvedValue('0x'),
    });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);

    const names = [
      'off-a.eth',
      'plain-a.eth',
      'off-b.eth',
      'plain-b.eth',
      'off-c.eth',
      'plain-c.eth',
    ];
    const results = await Promise.all(names.map((n) => service.resolveName(n)));

    results.forEach((result, i) => {
      const external = expectOk(result).provenance.external;
      expect(external, names[i]).toBe(names[i].startsWith('off'));
    });
    // The shared source client's own ccipRead reference is never mutated by the observing wrapper.
    expect(client.ccipRead?.request).toBe(ccipRequest);
  });

  it("a shared client's ccipRead is left intact after resolves (per-call observing client, no mutation)", async () => {
    const { client, ccipRequest } = makeClient({ offchain: true });
    const before = client.ccipRead;
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, client);
    await service.resolveName('vitalik.eth');
    await service.resolveName('vitalik.eth');
    expect(client.ccipRead).toBe(before); // borrowed client's hook object unchanged
    expect(client.ccipRead?.request).toBe(ccipRequest);
  });
});

describe('resolveName — stateless & deterministic-under-stable-state (INV-19)', () => {
  it('two L1-path calls with equal input → deep-equal, distinct-identity provenance', async () => {
    const { service } = makeL1Service();
    const a = expectOk(await service.resolveName('vitalik.eth'));
    const b = expectOk(await service.resolveName('vitalik.eth'));
    expect(a).toEqual(b);
    expect(a.provenance).not.toBe(b.provenance);
  });
});

describe('resolveName — read-only on the selected client (INV-20)', () => {
  it('L1 path touches only getEnsAddress — no write/submit API on either injected client', async () => {
    const bound = makeClient({ supported: false });
    const getEnsAddress = vi.fn().mockResolvedValue(VITALIK_ADDRESS);
    const sendTransaction = vi.fn();
    const l1 = {
      chain: makeClient().client.chain,
      getEnsAddress,
      sendTransaction,
    };
    const service = createEvmNameResolutionService(
      L2_NETWORK_CONFIG,
      bound.client,
      l1 as unknown as Parameters<typeof createEvmNameResolutionService>[2]
    );
    await service.resolveName('vitalik.eth');
    expect(getEnsAddress).toHaveBeenCalledTimes(1);
    expect(sendTransaction).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Side-Effect Ordering & Observability
// ===========================================================================

describe('service.dispose — borrowed no-dispose ownership extends to ensL1Client (INV-21)', () => {
  it('dispose() tears down NEITHER injected client; both remain usable afterward', async () => {
    const bound = makeClient({ supported: false });
    const boundClose = vi.fn();
    const l1Close = vi.fn();
    const boundClient = { ...bound.client, transportClose: boundClose } as unknown as Parameters<
      typeof createEvmNameResolutionService
    >[1];
    const getEnsAddress = vi.fn().mockResolvedValue(VITALIK_ADDRESS);
    const l1Client = {
      chain: makeClient().client.chain,
      getEnsAddress,
      transportClose: l1Close,
    } as unknown as Parameters<typeof createEvmNameResolutionService>[2];
    const service = createEvmNameResolutionService(L2_NETWORK_CONFIG, boundClient, l1Client);

    expect(() => service.dispose()).not.toThrow();
    expect(boundClose).not.toHaveBeenCalled();
    expect(l1Close).not.toHaveBeenCalled();
    // Both borrowed clients remain fully usable by the runtime after dispose.
    expect((await service.resolveName('vitalik.eth')).ok).toBe(true);
    expect(getEnsAddress).toHaveBeenCalled();
  });
});

describe('resolveName — pre-I/O gating + SELECTION-BEFORE-SHAPE precedence (INV-22, delivered)', () => {
  // DIRECTIVE: the delivered precedence keeps SF-2's order — client selection wins over the shape gate,
  // so a malformed name on an unsupported network returns UNSUPPORTED_NETWORK (NOT the invariants doc's
  // shape-first UNSUPPORTED_NAME wording, which is a known reword to selection-before-shape).
  it('invalid name on an L2 with NO ensL1Client → UNSUPPORTED_NETWORK (selection wins over shape), ZERO I/O', async () => {
    const bound = makeClient({ supported: false });
    const service = createEvmNameResolutionService(L2_NETWORK_CONFIG, bound.client);
    const error = expectError(await service.resolveName('0xnotaname')); // also fails the shape gate
    expect(error.code).toBe('UNSUPPORTED_NETWORK');
    expect(error.code).not.toBe('UNSUPPORTED_NAME');
    expect(bound.getEnsAddress).not.toHaveBeenCalled();
  });

  it('invalid name on a non-ENSIP-11 chainId WITH ensL1Client → UNSUPPORTED_NETWORK (deriveCoinType containment wins over shape)', async () => {
    const { service, l1 } = makeL1Service({}, NON_ENSIP11_NETWORK_CONFIG);
    const error = expectError(await service.resolveName('0xnotaname'));
    expect(error.code).toBe('UNSUPPORTED_NETWORK');
    expect(l1.getEnsAddress).not.toHaveBeenCalled();
  });

  it('valid name + supported selection → exactly one getEnsAddress call (L1 path)', async () => {
    const { service, l1 } = makeL1Service();
    await service.resolveName('vitalik.eth');
    expect(l1.getEnsAddress).toHaveBeenCalledTimes(1);
  });
});

describe('resolveName — bounded work + caller-measured elapsedMs (INV-23)', () => {
  it('at most one round-trip on the selected client (no retry loop), even on failure', async () => {
    const { service, l1 } = makeL1Service({
      getEnsAddress: vi.fn().mockRejectedValue(makeTimeoutError()),
    });
    await service.resolveName('vitalik.eth');
    expect(l1.getEnsAddress).toHaveBeenCalledTimes(1);
  });

  it('an L1-path timeout maps to RESOLUTION_TIMEOUT with a REAL finite elapsedMs (never the -1 sentinel)', async () => {
    const { service } = makeL1Service({
      getEnsAddress: vi.fn().mockRejectedValue(makeTimeoutError()),
    });
    const error = expectError(await service.resolveName('vitalik.eth'));
    expect(error.code).toBe('RESOLUTION_TIMEOUT');
    if (error.code !== 'RESOLUTION_TIMEOUT') return;
    expect(error.elapsedMs).not.toBe(ELAPSED_UNMEASURED);
    expect(Number.isFinite(error.elapsedMs)).toBe(true);
    expect(error.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  // CODE-REV2: the per-call observing client (`custom(borrowed)`) must NOT add its own retry layer on
  // top of the borrowed transport's — viem's `custom(provider)` defaults to `retryCount: 3`, so an
  // un-tuned wrapper would retry every retryable RPC/gateway error 3× on top of the borrowed client's
  // own retries (up to 3×N hops), inflating the `performance.now` elapsedMs behind RESOLUTION_TIMEOUT
  // and overriding the runtime retry/timeout policy D-A / INV-23 promise to inherit. The wrapper passes
  // `retryCount: 0`, leaving the borrowed transport the SOLE retry owner. Exercised over a REAL viem
  // client (a counting `custom` transport) so the `custom(client)` construction branch is actually hit.
  it('the observing client adds no second retry layer — the borrowed transport stays the sole retry owner', async () => {
    const retryable = () =>
      new HttpRequestError({ url: 'https://rpc.example.com', status: 500, details: 'retry me' });

    // Baseline: raw transport requests the borrowed client issues for ONE getEnsAddress, under its own
    // retry budget only (retryCount: 0 → exactly one attempt per logical request), with no wrapper.
    let baselineCalls = 0;
    const baselineClient = createPublicClient({
      chain: mainnet,
      transport: custom(
        {
          request: async () => {
            baselineCalls++;
            throw retryable();
          },
        },
        { retryCount: 0, retryDelay: 0 }
      ),
    });
    await baselineClient
      .getEnsAddress({ name: 'vitalik.eth', strict: true })
      .catch(() => undefined);

    // Through the service: getEnsAddress runs on the per-call observing client built over
    // `custom(borrowed)`. Same borrowed retry budget (retryCount: 0), so a correctly-tuned wrapper
    // issues exactly as many raw requests as the baseline.
    let observedCalls = 0;
    const borrowed = createPublicClient({
      chain: mainnet,
      transport: custom(
        {
          request: async () => {
            observedCalls++;
            throw retryable();
          },
        },
        { retryCount: 0, retryDelay: 0 }
      ),
    });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, borrowed);
    const result = await service.resolveName('vitalik.eth');

    // A retryable transport failure is a mapped error, never a throw (INV-11).
    expect(result.ok).toBe(false);
    expect(baselineCalls).toBeGreaterThan(0);
    // The observing layer multiplies nothing. A `custom(client)` left at viem's default retryCount
    // (the bug) would retry each logical request 3 extra times → observedCalls === baselineCalls * 4.
    expect(observedCalls).toBe(baselineCalls);
  });
});

// ===========================================================================
// Sensitive Data Handling
// ===========================================================================

describe('resolveName — no new credential-leak channel via the L1 client (INV-24)', () => {
  it('a keyed L1 RPC URL in a native gateway error is REDACTED on the returned field, kept only on cause', async () => {
    // The ensL1Client is conceptually built from a keyed mainnet endpoint; a native error embeds it.
    const keyed = makeHttpError(KEYED_L1_RPC_URL);
    const getEnsAddress = offchainGetEnsAddress(() => {
      throw keyed;
    });
    const { service } = makeL1Service({ offchain: true, getEnsAddress });
    const error = expectError(await service.resolveName('vitalik.eth'));
    // Offchain-traversed → gateway-dominated. detail (EXTERNAL_GATEWAY_ERROR) is redacted; ADAPTER_ERROR keeps cause.
    if (error.code === 'EXTERNAL_GATEWAY_ERROR') {
      expect(error.detail).not.toContain(ALCHEMY_KEY);
    } else if (error.code === 'ADAPTER_ERROR') {
      expect(error.message).not.toContain(ALCHEMY_KEY);
      expect(error.cause).toBe(keyed); // full original retained by reference (opaque)
    } else {
      throw new Error(`unexpected code ${error.code}`);
    }
  });

  it('provenance fields (label / system / scopedToNetworkId) carry no URL scheme or key-shaped substring', async () => {
    const { service } = makeL1Service({ offchain: true });
    const { provenance } = expectOk(await service.resolveName('vitalik.eth'));
    if (!isEnsProvenance(provenance)) throw new Error('expected EnsProvenance');
    for (const field of [provenance.label, provenance.system, provenance.scopedToNetworkId ?? '']) {
      expect(field).not.toMatch(/:\/\//);
      expect(field).not.toContain(ALCHEMY_KEY);
    }
  });
});

// ===========================================================================
// Performance, Scalability & Re-usability
// ===========================================================================

describe('resolveName — dependency-injection seam extends to ensL1Client (INV-25)', () => {
  it('runs the L1 path against a hand-rolled minimal { chain, getEnsAddress } ensL1Client, no host wiring', async () => {
    const bound = makeClient({ supported: false });
    const getEnsAddress = vi.fn().mockResolvedValue(VITALIK_ADDRESS);
    const bareL1 = { chain: makeClient().client.chain, getEnsAddress };
    const service = createEvmNameResolutionService(
      L2_NETWORK_CONFIG,
      bound.client,
      bareL1 as unknown as Parameters<typeof createEvmNameResolutionService>[2]
    );
    expect((await service.resolveName('vitalik.eth')).ok).toBe(true);
    expect(getEnsAddress).toHaveBeenCalledTimes(1);
  });
});

describe('CreateNameResolutionOptions — additive, optional API-compat (INV-26 / SC-006)', () => {
  it('ensL1Client is OPTIONAL at the type level', () => {
    expectTypeOf<CreateNameResolutionOptions>().toMatchTypeOf<{ readonly publicClient: unknown }>();
    // Constructing options WITHOUT ensL1Client type-checks (optionality) — proven by this assignment.
    const withoutL1: CreateNameResolutionOptions = { publicClient: makeClient().client };
    expect(withoutL1.ensL1Client).toBeUndefined();
  });

  it('a service built WITHOUT ensL1Client still resolves mainnet-bound and returns an EnsProvenance SUPERSET', async () => {
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, makeClient().client);
    const { provenance } = expectOk(await service.resolveName('vitalik.eth'));
    // Base fields present (superset), plus the extension is narrowable.
    expect(provenance).toHaveProperty('label');
    expect(provenance).toHaveProperty('external');
    expect(isEnsProvenance(provenance)).toBe(true);
  });
});
