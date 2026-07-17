/**
 * 003 SF-1 · Consumer opt-in configuration seam — test suite.
 *
 * Verifies `enableMainnetL1MissFallback` (default OFF) gates mainnet-L1 miss-fallback on both
 * directions through `mayConsultL1ForMissFallback()`. Organized by invariant category; every
 * `describe` names the invariant(s) it covers. SC-001 (KEY INV-6) is pinned with hard L1 spies.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import type { ResolutionResult, ResolvedName } from '@openzeppelin/ui-types';

import { createNameResolution } from '../../capabilities/name-resolution';
import { createEvmNameResolutionService } from '../service';
import {
  ENABLE_MAINNET_L1_MISS_FALLBACK,
  EVM_NETWORK_CONFIG,
  L2_NETWORK_CONFIG,
  makeClient,
  makeDecodedRevert,
  makeDualReverseClients,
  makeHttpError,
  makeTimeoutError,
  SEPOLIA_NETWORK_CONFIG,
  SEVEN_CODE_SET,
  VITALIK_ADDRESS,
  VITALIK_NAME,
} from './fixtures';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVICE_SOURCE = readFileSync(join(__dirname, '../service.ts'), 'utf8');
const SHARED_PROFILE_SOURCE = readFileSync(
  join(__dirname, '../../../../adapter-evm/src/profiles/shared.ts'),
  'utf8'
);

function expectError(result: ResolutionResult<ResolvedName>) {
  if (result.ok) {
    throw new Error(`expected { ok: false } but got success: ${JSON.stringify(result.value)}`);
  }
  return result.error;
}

// ===========================================================================
// Request/Response Contract — options shape + factory threading (INV-1, INV-20, INV-21)
// ===========================================================================

describe('CreateNameResolutionOptions — additive opt-in field (INV-1, INV-20, INV-21)', () => {
  it('createNameResolution accepts enableMainnetL1MissFallback without changing capability methods', () => {
    const { client } = makeClient();
    const capability = createNameResolution(SEPOLIA_NETWORK_CONFIG, {
      publicClient: client,
      enableMainnetL1MissFallback: true,
    });

    expect(typeof capability.isValidName).toBe('function');
    expect(typeof capability.resolveName).toBe('function');
    expect(typeof capability.resolveAddress).toBe('function');
  });

  it('createEvmNameResolutionService three-arg call sites compile unchanged (options bag optional)', () => {
    const { client } = makeClient();
    expect(() => createEvmNameResolutionService(SEPOLIA_NETWORK_CONFIG, client)).not.toThrow();
    expect(() =>
      createEvmNameResolutionService(SEPOLIA_NETWORK_CONFIG, client, makeClient().client)
    ).not.toThrow();
  });

  it('createNameResolution threads opt-in to reverse L1 when explicitly true', async () => {
    const { bound, l1 } = makeDualReverseClients({
      boundGetEnsName: vi.fn().mockResolvedValue(null),
      l1GetEnsName: vi.fn().mockResolvedValue(VITALIK_NAME),
    });
    const capability = createNameResolution(SEPOLIA_NETWORK_CONFIG, {
      publicClient: bound.client,
      ensL1Client: l1.client,
      enableMainnetL1MissFallback: true,
    });

    const result = await capability.resolveAddress!(VITALIK_ADDRESS);
    expect(result.ok).toBe(true);
    expect(l1.getEnsName).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// Request/Response Contract — strict enablement (INV-2, INV-9)
// ===========================================================================

describe('enableMainnetL1MissFallback — strict === true enablement (INV-2, INV-9)', () => {
  const TRUTHY_NON_BOOLEANS = [
    ['undefined (omitted)', undefined],
    ['false', false],
    ['null (JS boundary)', null],
    ['numeric 1', 1],
    ['string "true"', 'true'],
  ] as const;

  it.each(TRUTHY_NON_BOOLEANS)(
    'opt-in %s → zero L1 getEnsName on bound empty (fail-safe OFF)',
    async (_label, optInValue) => {
      const l1GetEnsName = vi.fn().mockResolvedValue(VITALIK_NAME);
      const { bound, l1 } = makeDualReverseClients({
        boundGetEnsName: vi.fn().mockResolvedValue(null),
        l1GetEnsName,
      });
      const service = createEvmNameResolutionService(
        SEPOLIA_NETWORK_CONFIG,
        bound.client,
        l1.client,
        { enableMainnetL1MissFallback: optInValue as boolean | undefined }
      );

      const error = expectError(await service.resolveAddress(VITALIK_ADDRESS));
      expect(error.code).toBe('ADDRESS_NOT_FOUND');
      expect(l1GetEnsName).not.toHaveBeenCalled();
    }
  );

  it('only explicit true permits L1 miss-fallback after bound empty', async () => {
    const l1GetEnsName = vi.fn().mockResolvedValue(VITALIK_NAME);
    const { bound, l1 } = makeDualReverseClients({
      boundGetEnsName: vi.fn().mockResolvedValue(null),
      l1GetEnsName,
    });
    const service = createEvmNameResolutionService(
      SEPOLIA_NETWORK_CONFIG,
      bound.client,
      l1.client,
      ENABLE_MAINNET_L1_MISS_FALLBACK
    );

    const result = await service.resolveAddress(VITALIK_ADDRESS);
    expect(result.ok).toBe(true);
    expect(l1GetEnsName).toHaveBeenCalledTimes(1);
  });

  it('construct never throws for junk opt-in at the JS boundary', () => {
    const { bound, l1 } = makeDualReverseClients();
    expect(() =>
      createEvmNameResolutionService(SEPOLIA_NETWORK_CONFIG, bound.client, l1.client, {
        enableMainnetL1MissFallback: null as unknown as boolean,
      })
    ).not.toThrow();
  });
});

// ===========================================================================
// Request/Response Contract — wiring ≠ opt-in (INV-3)
// ===========================================================================

describe('ensL1Client wiring does NOT imply opt-in (INV-3)', () => {
  it('SC-001 reverse: wired L1 + default OFF → ADDRESS_NOT_FOUND, L1 getEnsName count 0', async () => {
    const boundGetEnsName = vi.fn().mockResolvedValue(null);
    const l1GetEnsName = vi.fn().mockResolvedValue(VITALIK_NAME);
    const { bound, l1 } = makeDualReverseClients({ boundGetEnsName, l1GetEnsName });
    const service = createEvmNameResolutionService(SEPOLIA_NETWORK_CONFIG, bound.client, l1.client);

    const error = expectError(await service.resolveAddress(VITALIK_ADDRESS));
    expect(error.code).toBe('ADDRESS_NOT_FOUND');
    expect(boundGetEnsName).toHaveBeenCalledTimes(1);
    expect(l1GetEnsName).not.toHaveBeenCalled();
  });

  it('SC-001 forward: wired L1 + default OFF → NAME_NOT_FOUND, L1 getEnsAddress count 0', async () => {
    const boundGetEnsAddress = vi.fn().mockResolvedValue(null);
    const l1GetEnsAddress = vi.fn().mockResolvedValue(VITALIK_ADDRESS);
    const { bound, l1 } = makeDualReverseClients();
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

// ===========================================================================
// Request/Response Contract — immutability (INV-4, INV-11)
// ===========================================================================

describe('opt-in frozen at construct time (INV-4, INV-11)', () => {
  it('repeated resolveAddress calls under stable stubs are deterministic with opt-in OFF', async () => {
    const boundGetEnsName = vi.fn().mockResolvedValue(null);
    const l1GetEnsName = vi.fn().mockResolvedValue(VITALIK_NAME);
    const { bound, l1 } = makeDualReverseClients({ boundGetEnsName, l1GetEnsName });
    const service = createEvmNameResolutionService(SEPOLIA_NETWORK_CONFIG, bound.client, l1.client);

    const first = await service.resolveAddress(VITALIK_ADDRESS);
    const second = await service.resolveAddress(VITALIK_ADDRESS);

    expect(first).toEqual(second);
    expect(boundGetEnsName).toHaveBeenCalledTimes(2);
    expect(l1GetEnsName).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Error Semantics — central gate predicate (INV-5)
// ===========================================================================

describe('mayConsultL1ForMissFallback — sole miss-fallback gate (INV-5)', () => {
  it('reverse ladder uses mayConsultL1ForMissFallback instead of bare ensL1Client && !isMainnetBound()', () => {
    expect(SERVICE_SOURCE).toContain('mayConsultL1ForMissFallback()');
    expect(SERVICE_SOURCE).not.toMatch(/ensL1Client\s*&&\s*!this\.isMainnetBound\(\)/);
  });
});

// ===========================================================================
// Error Semantics — KEY default-OFF zero L1 I/O (INV-6)
// ===========================================================================

describe('KEY SC-001 — opt-in OFF ⇒ zero L1 miss-fallback I/O (INV-6)', () => {
  it('reverse bound empty: exactly one bound getEnsName, zero L1 calls', async () => {
    const boundGetEnsName = vi.fn().mockResolvedValue(null);
    const l1GetEnsName = vi.fn().mockResolvedValue(VITALIK_NAME);
    const { bound, l1 } = makeDualReverseClients({ boundGetEnsName, l1GetEnsName });
    const service = createEvmNameResolutionService(SEPOLIA_NETWORK_CONFIG, bound.client, l1.client);

    expectError(await service.resolveAddress(VITALIK_ADDRESS));
    expect(boundGetEnsName).toHaveBeenCalledTimes(1);
    expect(l1GetEnsName).not.toHaveBeenCalled();
  });

  it.each([
    ['null', vi.fn().mockResolvedValue(null)],
    [
      'ReverseAddressMismatch',
      vi.fn().mockRejectedValue(makeDecodedRevert('ReverseAddressMismatch')),
    ],
  ])('reverse bound %s signal with opt-in OFF → no L1 consult', async (_label, boundGetEnsName) => {
    const l1GetEnsName = vi.fn().mockResolvedValue(VITALIK_NAME);
    const { bound, l1 } = makeDualReverseClients({ boundGetEnsName, l1GetEnsName });
    const service = createEvmNameResolutionService(SEPOLIA_NETWORK_CONFIG, bound.client, l1.client);

    expectError(await service.resolveAddress(VITALIK_ADDRESS));
    expect(l1GetEnsName).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Error Semantics — non-UR terminal (INV-7)
// ===========================================================================

describe('non-UR reverse with gate false → UNSUPPORTED_NETWORK (INV-7)', () => {
  it('opt-in OFF + ensL1Client wired on non-UR → UNSUPPORTED_NETWORK, zero getEnsName', async () => {
    const { client: boundClient, getEnsName: boundGetEnsName } = makeClient({ supported: false });
    const { client: l1Client, getEnsName: l1GetEnsName } = makeClient({ boundChainId: 1 });
    const service = createEvmNameResolutionService(L2_NETWORK_CONFIG, boundClient, l1Client);

    const error = expectError(await service.resolveAddress(VITALIK_ADDRESS));
    expect(error.code).toBe('UNSUPPORTED_NETWORK');
    expect(boundGetEnsName).not.toHaveBeenCalled();
    expect(l1GetEnsName).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Error Semantics — closed error union (INV-8, INV-19)
// ===========================================================================

describe('no new error codes or opt-in leakage (INV-8, INV-19)', () => {
  it('opt-in OFF terminals use existing seven-code union only', async () => {
    const { bound, l1 } = makeDualReverseClients({
      boundGetEnsName: vi.fn().mockResolvedValue(null),
    });
    const service = createEvmNameResolutionService(SEPOLIA_NETWORK_CONFIG, bound.client, l1.client);

    const error = expectError(await service.resolveAddress(VITALIK_ADDRESS));
    expect(SEVEN_CODE_SET.has(error.code)).toBe(true);
    expect(JSON.stringify(error)).not.toContain('enableMainnetL1MissFallback');
    expect(JSON.stringify(error)).not.toContain('optIn');
  });
});

// ===========================================================================
// Idempotency & Retry — never-silent-fallback (INV-10)
// ===========================================================================

describe('never-silent-fallback preserved regardless of opt-in (INV-10)', () => {
  it.each([
    ['opt-in OFF', undefined],
    ['opt-in ON', ENABLE_MAINNET_L1_MISS_FALLBACK],
  ])(
    'bound gateway failure with %s → typed error; L1 getEnsName count 0',
    async (_label, optIn) => {
      const l1GetEnsName = vi.fn().mockResolvedValue(VITALIK_NAME);
      const { bound, l1 } = makeDualReverseClients({
        boundGetEnsName: vi.fn().mockRejectedValue(makeHttpError()),
        l1GetEnsName,
      });
      const service = createEvmNameResolutionService(
        SEPOLIA_NETWORK_CONFIG,
        bound.client,
        l1.client,
        optIn
      );

      const error = expectError(await service.resolveAddress(VITALIK_ADDRESS));
      expect(error.code).not.toBe('ADDRESS_NOT_FOUND');
      expect(SEVEN_CODE_SET.has(error.code)).toBe(true);
      expect(l1GetEnsName).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['opt-in OFF', undefined],
    ['opt-in ON', ENABLE_MAINNET_L1_MISS_FALLBACK],
  ])('bound timeout with %s → RESOLUTION_TIMEOUT; L1 never consulted', async (_label, optIn) => {
    const l1GetEnsName = vi.fn().mockResolvedValue(VITALIK_NAME);
    const { bound, l1 } = makeDualReverseClients({
      boundGetEnsName: vi.fn().mockRejectedValue(makeTimeoutError()),
      l1GetEnsName,
    });
    const service = createEvmNameResolutionService(
      SEPOLIA_NETWORK_CONFIG,
      bound.client,
      l1.client,
      optIn
    );

    const error = expectError(await service.resolveAddress(VITALIK_ADDRESS));
    expect(error.code).toBe('RESOLUTION_TIMEOUT');
    expect(l1GetEnsName).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Auth Boundary — no implicit runtime enablement (INV-12)
// ===========================================================================

describe('adapter-evm shared profile must not implicit-enable (INV-12)', () => {
  it('shared.ts createNameResolution call sites omit enableMainnetL1MissFallback: true', () => {
    expect(SHARED_PROFILE_SOURCE).not.toMatch(/enableMainnetL1MissFallback\s*:\s*true/);
  });
});

// ===========================================================================
// Side-Effect Ordering — gate before L1 I/O (INV-14, INV-15, INV-18)
// ===========================================================================

describe('resolveAddress I/O ordering with opt-in OFF (INV-14, INV-18)', () => {
  it('bound empty + OFF → exactly one bound getEnsName, zero L1 I/O', async () => {
    const order: string[] = [];
    const boundGetEnsName = vi.fn(async () => {
      order.push('bound-name');
      return null;
    });
    const l1GetEnsName = vi.fn(async () => {
      order.push('l1-name');
      return VITALIK_NAME;
    });
    const { bound, l1 } = makeDualReverseClients({ boundGetEnsName, l1GetEnsName });
    const service = createEvmNameResolutionService(SEPOLIA_NETWORK_CONFIG, bound.client, l1.client);

    expectError(await service.resolveAddress(VITALIK_ADDRESS));
    expect(order).toEqual(['bound-name']);
    expect(l1GetEnsName).not.toHaveBeenCalled();
  });
});

describe('bound-local success never consults L1 regardless of opt-in (INV-15)', () => {
  it('bound hit + opt-in ON → L1 getEnsName count 0', async () => {
    const { bound, l1 } = makeDualReverseClients({
      boundGetEnsName: vi.fn().mockResolvedValue('local.sepolia.eth'),
    });
    const service = createEvmNameResolutionService(
      SEPOLIA_NETWORK_CONFIG,
      bound.client,
      l1.client,
      ENABLE_MAINNET_L1_MISS_FALLBACK
    );

    await service.resolveAddress(VITALIK_ADDRESS);
    expect(l1.getEnsName).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Resource Limits — bounded work when OFF (INV-18)
// ===========================================================================

describe('opt-in OFF removes L1 tier from miss-fallback paths (INV-18)', () => {
  it('UR-carrying bound empty performs at most one getEnsName total', async () => {
    const boundGetEnsName = vi.fn().mockResolvedValue(null);
    const l1GetEnsName = vi.fn().mockResolvedValue(VITALIK_NAME);
    const { bound, l1 } = makeDualReverseClients({ boundGetEnsName, l1GetEnsName });
    const service = createEvmNameResolutionService(SEPOLIA_NETWORK_CONFIG, bound.client, l1.client);

    await service.resolveAddress(VITALIK_ADDRESS);
    expect(boundGetEnsName).toHaveBeenCalledTimes(1);
    expect(l1GetEnsName).toHaveBeenCalledTimes(0);
  });
});

// ===========================================================================
// Performance, Scalability & Re-usability — per-instance DI (INV-20, INV-22, INV-23, INV-24)
// ===========================================================================

describe('per-capability-instance opt-in via DI (INV-20)', () => {
  it('two services in one process — one ON, one OFF — independent gate behavior', async () => {
    const boundGetEnsName = vi.fn().mockResolvedValue(null);
    const l1GetEnsNameOn = vi.fn().mockResolvedValue(VITALIK_NAME);
    const l1GetEnsNameOff = vi.fn().mockResolvedValue(VITALIK_NAME);
    const onClients = makeDualReverseClients({ boundGetEnsName, l1GetEnsName: l1GetEnsNameOn });
    const offClients = makeDualReverseClients({ boundGetEnsName, l1GetEnsName: l1GetEnsNameOff });

    const onService = createEvmNameResolutionService(
      SEPOLIA_NETWORK_CONFIG,
      onClients.bound.client,
      onClients.l1.client,
      ENABLE_MAINNET_L1_MISS_FALLBACK
    );
    const offService = createEvmNameResolutionService(
      SEPOLIA_NETWORK_CONFIG,
      offClients.bound.client,
      offClients.l1.client
    );

    expect((await onService.resolveAddress(VITALIK_ADDRESS)).ok).toBe(true);
    expect((await offService.resolveAddress(VITALIK_ADDRESS)).ok).toBe(false);
    expect(l1GetEnsNameOn).toHaveBeenCalledTimes(1);
    expect(l1GetEnsNameOff).not.toHaveBeenCalled();
  });
});

describe('non-UR forward chain-scoped L1 remains outside opt-in gate (INV-22)', () => {
  it('L2 + ensL1Client + opt-in OFF still resolves forward via L1 when record exists', async () => {
    const boundGetEnsAddress = vi.fn();
    const l1GetEnsAddress = vi.fn().mockResolvedValue(VITALIK_ADDRESS);
    const { client: boundClient } = makeClient({
      supported: false,
      getEnsAddress: boundGetEnsAddress,
    });
    const { client: l1Client } = makeClient({ getEnsAddress: l1GetEnsAddress, boundChainId: 1 });
    const service = createEvmNameResolutionService(L2_NETWORK_CONFIG, boundClient, l1Client);

    const result = await service.resolveName('vitalik.eth');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.address).toBe(VITALIK_ADDRESS);
    expect(boundGetEnsAddress).not.toHaveBeenCalled();
    expect(l1GetEnsAddress).toHaveBeenCalledTimes(1);
  });
});

describe('forward bound-UR miss stays terminal in SF-1 (INV-23)', () => {
  it('Sepolia UR + mainnet-only name + opt-in OFF → NAME_NOT_FOUND without L1 getEnsAddress', async () => {
    const boundGetEnsAddress = vi.fn().mockResolvedValue(null);
    const l1GetEnsAddress = vi.fn().mockResolvedValue(VITALIK_ADDRESS);
    const { bound, l1 } = makeDualReverseClients();
    bound.client.getEnsAddress = boundGetEnsAddress;
    l1.client.getEnsAddress = l1GetEnsAddress;
    const service = createEvmNameResolutionService(SEPOLIA_NETWORK_CONFIG, bound.client, l1.client);

    const result = await service.resolveName('vitalik.eth');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NAME_NOT_FOUND');
    expect(boundGetEnsAddress).toHaveBeenCalledTimes(1);
    expect(l1GetEnsAddress).not.toHaveBeenCalled();
  });
});

describe('mainnet-bound fence — opt-in inert on mainnet (INV-24)', () => {
  it('mainnet-bound + opt-in true + injected L1 → gate false; L1 getEnsName count 0 on empty', async () => {
    const { bound, l1 } = makeDualReverseClients({
      boundGetEnsName: vi.fn().mockResolvedValue(null),
      boundChainId: 1,
    });
    const service = createEvmNameResolutionService(
      EVM_NETWORK_CONFIG,
      bound.client,
      l1.client,
      ENABLE_MAINNET_L1_MISS_FALLBACK
    );

    expect(expectError(await service.resolveAddress(VITALIK_ADDRESS)).code).toBe(
      'ADDRESS_NOT_FOUND'
    );
    expect(l1.getEnsName).not.toHaveBeenCalled();
  });
});
