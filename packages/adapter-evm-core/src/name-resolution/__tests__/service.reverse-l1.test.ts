/**
 * 002 SF-1 · `service.ts` — Option B miss-fallback reverse ladder (mainnet L1) test suite.
 *
 * Extends the `001` SF-3 baseline in `service.reverse.test.ts` with the Specify Revision 1 ladder:
 * bound-first on UR-carrying chains (Sepolia first-class), empty-only miss-fallback to gated L1,
 * non-UR + L1 direct, never-silent-fallback on bound transport/gateway failure (KEY INV-9), and
 * D-R7 / Principle II provenance via base `scopedToNetworkId` only (INV-5, INV-28).
 *
 * Organized by invariant category. Every `describe` names the invariant(s) it covers.
 */
import { describe, expect, it, vi } from 'vitest';

import type { ResolutionProvenance, ResolutionResult, ResolvedName } from '@openzeppelin/ui-types';

import { isEnsProvenance } from '../ens-provenance';
import { createEvmNameResolutionService } from '../service';
import {
  AVATAR_URL,
  EVM_NETWORK_CONFIG,
  L2_NETWORK_CONFIG,
  makeClient,
  makeDecodedRevert,
  makeDualReverseClients,
  makeHttpError,
  makeTimeoutError,
  SEPOLIA_NETWORK_CONFIG,
  VITALIK_ADDRESS,
  VITALIK_NAME,
} from './fixtures';

function expectError(result: ResolutionResult<ResolvedName>) {
  if (result.ok) {
    throw new Error(`expected { ok: false } but got success: ${JSON.stringify(result.value)}`);
  }
  return result.error;
}

function expectValue(result: ResolutionResult<ResolvedName>): ResolvedName {
  if (!result.ok) {
    throw new Error(`expected { ok: true } but got error: ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

/**
 * Chain-agnostic display-safety gate (INV-28): consumers MUST discriminate scope using base
 * `scopedToNetworkId` only — never `isEnsProvenance` / `coinType`.
 */
function chainAgnosticScope(provenance: ResolutionProvenance): 'global' | { local: string } {
  if ('scopedToNetworkId' in provenance && provenance.scopedToNetworkId !== undefined) {
    return { local: provenance.scopedToNetworkId };
  }
  return 'global';
}

// ===========================================================================
// Request/Response Contract — provenance three-row (INV-5, INV-28)
// ===========================================================================

describe('resolveAddress — D-R7 provenance three-row (INV-5, INV-28)', () => {
  it('Sepolia miss-fallback success: global scope (absent scopedToNetworkId) — chain-agnostic gate', async () => {
    const { bound, l1 } = makeDualReverseClients({
      boundGetEnsName: vi.fn().mockResolvedValue(null),
      l1GetEnsName: vi.fn().mockResolvedValue(VITALIK_NAME),
    });
    const service = createEvmNameResolutionService(SEPOLIA_NETWORK_CONFIG, bound.client, l1.client);

    const value = expectValue(await service.resolveAddress(VITALIK_ADDRESS));

    expect(value.name).toBe(VITALIK_NAME);
    expect(chainAgnosticScope(value.provenance)).toBe('global');
    expect('scopedToNetworkId' in value.provenance).toBe(false);
    // Adapter-internal enrichment (must NOT be used for display-safety gating):
    expect(isEnsProvenance(value.provenance)).toBe(true);
    if (isEnsProvenance(value.provenance)) expect(value.provenance.coinType).toBe(60);
  });

  it('Sepolia bound-local hit: scopedToNetworkId === bound network id; L1 never consulted', async () => {
    const localName = 'alice.sepolia.eth';
    const { bound, l1 } = makeDualReverseClients({
      boundGetEnsName: vi.fn().mockResolvedValue(localName),
    });
    const service = createEvmNameResolutionService(SEPOLIA_NETWORK_CONFIG, bound.client, l1.client);

    const value = expectValue(await service.resolveAddress(VITALIK_ADDRESS));

    expect(value.name).toBe(localName);
    expect(chainAgnosticScope(value.provenance)).toEqual({ local: SEPOLIA_NETWORK_CONFIG.id });
    expect(isEnsProvenance(value.provenance)).toBe(false);
    expect(l1.getEnsName).not.toHaveBeenCalled();
  });

  it('mainnet-bound hit: byte-stable baseEnsProvenance (absent scope); redundant L1 untouched', async () => {
    const { bound, l1 } = makeDualReverseClients({
      boundGetEnsName: vi.fn().mockResolvedValue(VITALIK_NAME),
      boundChainId: 1,
    });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, bound.client, l1.client);

    const value = expectValue(await service.resolveAddress(VITALIK_ADDRESS));

    expect(value.provenance).toEqual({ label: 'ENS', external: false });
    expect(chainAgnosticScope(value.provenance)).toBe('global');
    expect(l1.getEnsName).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Request/Response Contract — Option B ladder totality (INV-6)
// ===========================================================================

describe('resolveAddress — Option B ladder selection (INV-6)', () => {
  it('acceptance 1: Sepolia UR + L1 — bound empty then L1 primary', async () => {
    const boundGetEnsName = vi.fn().mockResolvedValue(null);
    const l1GetEnsName = vi.fn().mockResolvedValue(VITALIK_NAME);
    const { bound, l1 } = makeDualReverseClients({ boundGetEnsName, l1GetEnsName });
    const service = createEvmNameResolutionService(SEPOLIA_NETWORK_CONFIG, bound.client, l1.client);

    const value = expectValue(await service.resolveAddress(VITALIK_ADDRESS));

    expect(boundGetEnsName).toHaveBeenCalledTimes(1);
    expect(l1GetEnsName).toHaveBeenCalledTimes(1);
    expect(value.forwardVerified).toBe(true);
    expect(value.name).toBe(VITALIK_NAME);
  });

  it('acceptance 2: bound hit short-circuits — zero L1 I/O', async () => {
    const { bound, l1 } = makeDualReverseClients({
      boundGetEnsName: vi.fn().mockResolvedValue('local.eth'),
    });
    const service = createEvmNameResolutionService(SEPOLIA_NETWORK_CONFIG, bound.client, l1.client);

    expectValue(await service.resolveAddress(VITALIK_ADDRESS));
    expect(l1.getEnsName).not.toHaveBeenCalled();
    expect(l1.getEnsAvatar).not.toHaveBeenCalled();
  });

  it('acceptance 3: non-UR L2 + L1 — L1 direct (no bound getEnsName)', async () => {
    const { client: boundClient, getEnsName: boundGetEnsName } = makeClient({ supported: false });
    const l1GetEnsName = vi.fn().mockResolvedValue(VITALIK_NAME);
    const { client: l1Client } = makeClient({ getEnsName: l1GetEnsName, boundChainId: 1 });
    const service = createEvmNameResolutionService(L2_NETWORK_CONFIG, boundClient, l1Client);

    const value = expectValue(await service.resolveAddress(VITALIK_ADDRESS));

    expect(boundGetEnsName).not.toHaveBeenCalled();
    expect(l1GetEnsName).toHaveBeenCalledTimes(1);
    expect(chainAgnosticScope(value.provenance)).toBe('global');
    expect(isEnsProvenance(value.provenance)).toBe(true);
  });

  it('acceptance 5: mainnet-bound empty + injected L1 → ADDRESS_NOT_FOUND; L1 spy count 0 (INV-22)', async () => {
    const { bound, l1 } = makeDualReverseClients({
      boundGetEnsName: vi.fn().mockResolvedValue(null),
      boundChainId: 1,
    });
    const service = createEvmNameResolutionService(EVM_NETWORK_CONFIG, bound.client, l1.client);

    expect(expectError(await service.resolveAddress(VITALIK_ADDRESS)).code).toBe(
      'ADDRESS_NOT_FOUND'
    );
    expect(l1.getEnsName).not.toHaveBeenCalled();
  });

  it('acceptance 6: non-UR + no L1 → UNSUPPORTED_NETWORK before I/O', async () => {
    const { client, getEnsName } = makeClient({ supported: false });
    const service = createEvmNameResolutionService(L2_NETWORK_CONFIG, client);

    const error = expectError(await service.resolveAddress(VITALIK_ADDRESS));
    expect(error.code).toBe('UNSUPPORTED_NETWORK');
    if (error.code !== 'UNSUPPORTED_NETWORK') return;
    expect(error.networkId).toBe(L2_NETWORK_CONFIG.id);
    expect(getEnsName).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Error Semantics — definitive empty set + miss-fallback eligibility (INV-8)
// ===========================================================================

describe('resolveAddress — definitive-empty triggers exactly one L1 consult (INV-8)', () => {
  const EMPTY_SIGNALS = [
    ['null', vi.fn().mockResolvedValue(null)],
    [
      'ReverseAddressMismatch',
      vi.fn().mockRejectedValue(makeDecodedRevert('ReverseAddressMismatch')),
    ],
    ['ResolverNotFound', vi.fn().mockRejectedValue(makeDecodedRevert('ResolverNotFound'))],
    [
      'UnsupportedResolverProfile',
      vi.fn().mockRejectedValue(makeDecodedRevert('UnsupportedResolverProfile')),
    ],
  ] as const;

  it.each(EMPTY_SIGNALS)(
    'bound %s on Sepolia + L1 wired → one L1 getEnsName then L1 success',
    async (_label, boundGetEnsName) => {
      const l1GetEnsName = vi.fn().mockResolvedValue(VITALIK_NAME);
      const { bound, l1 } = makeDualReverseClients({ boundGetEnsName, l1GetEnsName });
      const service = createEvmNameResolutionService(
        SEPOLIA_NETWORK_CONFIG,
        bound.client,
        l1.client
      );

      expectValue(await service.resolveAddress(VITALIK_ADDRESS));
      expect(boundGetEnsName).toHaveBeenCalledTimes(1);
      expect(l1GetEnsName).toHaveBeenCalledTimes(1);
    }
  );
});

// ===========================================================================
// Error Semantics — KEY miss-fallback empty-only (INV-9)
// ===========================================================================

describe('resolveAddress — KEY: bound failure NEVER falls through to L1 (INV-9)', () => {
  it.each([
    ['RESOLUTION_TIMEOUT', makeTimeoutError()],
    ['EXTERNAL_GATEWAY_ERROR path via HttpRequestError', makeHttpError()],
  ])(
    'acceptance 7: bound %s → typed error; L1 getEnsName receives ZERO calls',
    async (_label, thrown) => {
      const { bound, l1 } = makeDualReverseClients({
        boundGetEnsName: vi.fn().mockRejectedValue(thrown),
        l1GetEnsName: vi.fn().mockResolvedValue(VITALIK_NAME),
      });
      const service = createEvmNameResolutionService(
        SEPOLIA_NETWORK_CONFIG,
        bound.client,
        l1.client
      );

      const error = expectError(await service.resolveAddress(VITALIK_ADDRESS));
      expect(error.code).not.toBe('ADDRESS_NOT_FOUND');
      expect(l1.getEnsName).not.toHaveBeenCalled();
      expect(l1.getEnsAvatar).not.toHaveBeenCalled();
    }
  );
});

// ===========================================================================
// Error Semantics — L1 terminal discipline (INV-10, INV-11)
// ===========================================================================

describe('resolveAddress — L1 terminal outcomes (INV-10, INV-11)', () => {
  it('acceptance 4: bound empty + L1 empty → ADDRESS_NOT_FOUND', async () => {
    const { bound, l1 } = makeDualReverseClients({
      boundGetEnsName: vi.fn().mockResolvedValue(null),
      l1GetEnsName: vi.fn().mockResolvedValue(null),
    });
    const service = createEvmNameResolutionService(SEPOLIA_NETWORK_CONFIG, bound.client, l1.client);

    expect(expectError(await service.resolveAddress(VITALIK_ADDRESS)).code).toBe(
      'ADDRESS_NOT_FOUND'
    );
  });

  it('bound mismatch (empty) + L1 usable primary → L1 success (Approach A + miss-fallback)', async () => {
    const { bound, l1 } = makeDualReverseClients({
      boundGetEnsName: vi.fn().mockRejectedValue(makeDecodedRevert('ReverseAddressMismatch')),
      l1GetEnsName: vi.fn().mockResolvedValue(VITALIK_NAME),
    });
    const service = createEvmNameResolutionService(SEPOLIA_NETWORK_CONFIG, bound.client, l1.client);

    const value = expectValue(await service.resolveAddress(VITALIK_ADDRESS));
    expect(value.name).toBe(VITALIK_NAME);
    expect(l1.getEnsName).toHaveBeenCalledTimes(1);
  });

  it('L1 ReverseAddressMismatch after miss-fallback → ADDRESS_NOT_FOUND (no third client)', async () => {
    const { bound, l1 } = makeDualReverseClients({
      boundGetEnsName: vi.fn().mockResolvedValue(null),
      l1GetEnsName: vi.fn().mockRejectedValue(makeDecodedRevert('ReverseAddressMismatch')),
    });
    const service = createEvmNameResolutionService(SEPOLIA_NETWORK_CONFIG, bound.client, l1.client);

    expect(expectError(await service.resolveAddress(VITALIK_ADDRESS)).code).toBe(
      'ADDRESS_NOT_FOUND'
    );
    expect(l1.getEnsName).toHaveBeenCalledTimes(1);
  });

  it('acceptance 8: L1 gateway/timeout failure → typed error, never silent hex', async () => {
    const { bound, l1 } = makeDualReverseClients({
      boundGetEnsName: vi.fn().mockResolvedValue(null),
      l1GetEnsName: vi.fn().mockRejectedValue(makeTimeoutError()),
    });
    const service = createEvmNameResolutionService(SEPOLIA_NETWORK_CONFIG, bound.client, l1.client);

    const error = expectError(await service.resolveAddress(VITALIK_ADDRESS));
    expect(error.code).toBe('RESOLUTION_TIMEOUT');
    expect(error.code).not.toBe('ADDRESS_NOT_FOUND');
  });
});

// ===========================================================================
// Error Semantics — strict:true on both clients (INV-13)
// ===========================================================================

describe('resolveAddress — strict:true on bound and L1 getEnsName (INV-13)', () => {
  it('both attempts pass strict:true', async () => {
    const boundGetEnsName = vi.fn().mockResolvedValue(null);
    const l1GetEnsName = vi.fn().mockResolvedValue(VITALIK_NAME);
    const { bound, l1 } = makeDualReverseClients({ boundGetEnsName, l1GetEnsName });
    const service = createEvmNameResolutionService(SEPOLIA_NETWORK_CONFIG, bound.client, l1.client);

    await service.resolveAddress(VITALIK_ADDRESS);

    expect(boundGetEnsName.mock.calls[0][0]).toMatchObject({ strict: true });
    expect(l1GetEnsName.mock.calls[0][0]).toMatchObject({ strict: true });
  });
});

// ===========================================================================
// Side-Effect Ordering — ladder I/O order + selected-client avatar (INV-18, INV-19)
// ===========================================================================

describe('resolveAddress — I/O ordering and avatar client affinity (INV-18, INV-19)', () => {
  it('call order: bound getEnsName → L1 getEnsName → L1 getEnsAvatar on miss-fallback success', async () => {
    const order: string[] = [];
    const boundGetEnsName = vi.fn(async () => {
      order.push('bound-name');
      return null;
    });
    const l1GetEnsName = vi.fn(async () => {
      order.push('l1-name');
      return VITALIK_NAME;
    });
    const l1GetEnsAvatar = vi.fn(async () => {
      order.push('l1-avatar');
      return AVATAR_URL;
    });
    const { bound, l1 } = makeDualReverseClients({
      boundGetEnsName,
      l1GetEnsName,
      l1GetEnsAvatar,
      boundGetEnsAvatar: vi.fn(async () => {
        order.push('bound-avatar');
        return AVATAR_URL;
      }),
    });
    const service = createEvmNameResolutionService(SEPOLIA_NETWORK_CONFIG, bound.client, l1.client);

    const value = expectValue(await service.resolveAddress(VITALIK_ADDRESS));

    expect(order).toEqual(['bound-name', 'l1-name', 'l1-avatar']);
    expect(value.avatarUrl).toBe(AVATAR_URL);
    expect(bound.getEnsAvatar).not.toHaveBeenCalled();
  });

  it('bound transport failure short-circuits before any L1 I/O (INV-19 + INV-9)', async () => {
    const order: string[] = [];
    const { bound, l1 } = makeDualReverseClients({
      boundGetEnsName: vi.fn(async () => {
        order.push('bound-name');
        throw makeTimeoutError();
      }),
      l1GetEnsName: vi.fn(async () => {
        order.push('l1-name');
        return VITALIK_NAME;
      }),
    });
    const service = createEvmNameResolutionService(SEPOLIA_NETWORK_CONFIG, bound.client, l1.client);

    await service.resolveAddress(VITALIK_ADDRESS);
    expect(order).toEqual(['bound-name']);
  });
});

// ===========================================================================
// Resource Limits — bounded work + mainnet fence (INV-20, INV-21, INV-22)
// ===========================================================================

describe('resolveAddress — bounded work per call (INV-20)', () => {
  it('miss-fallback performs at most one bound + one L1 getEnsName', async () => {
    const boundGetEnsName = vi.fn().mockResolvedValue(null);
    const l1GetEnsName = vi.fn().mockResolvedValue(VITALIK_NAME);
    const { bound, l1 } = makeDualReverseClients({ boundGetEnsName, l1GetEnsName });
    const service = createEvmNameResolutionService(SEPOLIA_NETWORK_CONFIG, bound.client, l1.client);

    await service.resolveAddress(VITALIK_ADDRESS);
    expect(boundGetEnsName).toHaveBeenCalledTimes(1);
    expect(l1GetEnsName).toHaveBeenCalledTimes(1);
  });
});

describe('resolveAddress — L1 default primary only, no bound coinType (INV-27)', () => {
  it('L1 getEnsName omits coinType override (viem default 60)', async () => {
    const l1GetEnsName = vi.fn().mockResolvedValue(VITALIK_NAME);
    const { bound, l1 } = makeDualReverseClients({
      boundGetEnsName: vi.fn().mockResolvedValue(null),
      l1GetEnsName,
    });
    const service = createEvmNameResolutionService(SEPOLIA_NETWORK_CONFIG, bound.client, l1.client);

    await service.resolveAddress(VITALIK_ADDRESS);

    const args = l1GetEnsName.mock.calls[0][0] as { coinType?: bigint };
    expect(args.coinType).toBeUndefined();
  });
});

// ===========================================================================
// Performance, Scalability & Re-usability — forward asymmetry spot-check (INV-26)
// ===========================================================================

describe('resolveName — forward asymmetry: no reverse miss-fallback on forward (INV-26)', () => {
  it('Sepolia-bound forward with L1 wired does NOT miss-fall back on NAME_NOT_FOUND', async () => {
    const boundGetEnsAddress = vi.fn().mockResolvedValue(null);
    const l1GetEnsAddress = vi.fn().mockResolvedValue(VITALIK_ADDRESS);
    const { bound, l1 } = makeDualReverseClients({
      boundGetEnsName: vi.fn(),
      l1GetEnsName: vi.fn(),
    });
    bound.client.getEnsAddress = boundGetEnsAddress;
    l1.client.getEnsAddress = l1GetEnsAddress;

    const service = createEvmNameResolutionService(SEPOLIA_NETWORK_CONFIG, bound.client, l1.client);

    const result = await service.resolveName('vitalik.eth');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NAME_NOT_FOUND');
    expect(l1GetEnsAddress).not.toHaveBeenCalled();
  });
});
