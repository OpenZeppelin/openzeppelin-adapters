import type {
  NameResolutionCapability,
  NetworkConfig,
  ResolutionResult,
  ResolvedAddress,
  ResolvedName,
} from '@openzeppelin/ui-types';

import { guardRuntimeCapability } from '../../runtime-capability';
import type { AnyResolutionResult, ForwardVector, ReverseVector } from '../types';

/**
 * Shared, ABSTRACT `ResolutionResult`-shaped stubs for the seeded-defect meta-suite and the
 * binding smoke test. No client, no viem, no `.eth`/`0x` semantics baked into the harness —
 * these are the caller-owned pinned substrate the harness grades (RS-TCK "the TCK tests itself").
 */

const NETWORK = {
  id: 'evm-mainnet',
  ecosystem: 'evm',
} as unknown as NetworkConfig;

const VITALIK_NAME = 'vitalik.eth';
const VITALIK_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function provenance(label = 'ENS'): ResolvedAddress['provenance'] {
  return { label, external: false };
}

/** Canonical compliant forward behavior (name → address). Returns a FRESH-but-equal object per call. */
export function compliantForward(input: string): ResolutionResult<ResolvedAddress> {
  if (input === VITALIK_NAME) {
    return { ok: true, value: { name: input, address: VITALIK_ADDRESS, provenance: provenance() } };
  }
  return { ok: false, error: { code: 'NAME_NOT_FOUND', name: input } };
}

/** Canonical compliant reverse behavior (address → name). `forwardVerified` constant-`true`. */
export function compliantReverse(input: string): ResolutionResult<ResolvedName> {
  if (input === VITALIK_ADDRESS) {
    return {
      ok: true,
      value: {
        address: input,
        name: VITALIK_NAME,
        forwardVerified: true,
        provenance: provenance(),
      },
    };
  }
  return { ok: false, error: { code: 'ADDRESS_NOT_FOUND', address: input } };
}

export const FORWARD_VECTORS: readonly ForwardVector[] = [
  { input: VITALIK_NAME, expect: { ok: true } },
  { input: 'no-such-name.eth', expect: { ok: false, code: 'NAME_NOT_FOUND' } },
];

export const REVERSE_VECTORS: readonly ReverseVector[] = [
  { input: VITALIK_ADDRESS, expect: { ok: true } },
  { input: ZERO_ADDRESS, expect: { ok: false, code: 'ADDRESS_NOT_FOUND' } },
];

export interface StubOptions {
  readonly resolveName?: (input: string) => AnyResolutionResult;
  readonly resolveAddress?: (input: string) => AnyResolutionResult;
  /** Omit `dispose` from the produced instance (for the INV-26 no-dispose SKIPPED case). */
  readonly includeDispose?: boolean;
  /** Wrap the instance in the runtime guard Proxy (so post-dispose access throws `RuntimeDisposedError`). */
  readonly guard?: boolean;
}

interface MutableCapability {
  isValidName: (name: string) => boolean;
  networkConfig: NetworkConfig;
  dispose?: () => void;
  resolveName?: (name: string) => Promise<ResolutionResult<ResolvedAddress>>;
  resolveAddress?: (address: string) => Promise<ResolutionResult<ResolvedName>>;
}

/**
 * Build a stub capability. A synchronous throw inside an `impl` becomes a rejected promise
 * (exactly how an adapter's async method would surface an internal failure).
 */
export function makeStub(opts: StubOptions): NameResolutionCapability {
  const base: MutableCapability = {
    isValidName: (name) => name.length > 0,
    networkConfig: NETWORK,
    dispose: () => {},
  };

  if (opts.includeDispose === false) {
    delete base.dispose;
  }
  if (opts.resolveName) {
    const impl = opts.resolveName;
    base.resolveName = async (name) => impl(name) as ResolutionResult<ResolvedAddress>;
  }
  if (opts.resolveAddress) {
    const impl = opts.resolveAddress;
    base.resolveAddress = async (address) => impl(address) as ResolutionResult<ResolvedName>;
  }

  if (opts.guard === true) {
    return guardRuntimeCapability(base, NETWORK, 'name-resolution') as NameResolutionCapability;
  }
  return base as NameResolutionCapability;
}

/** The fully compliant reference capability — every applicable result must PASS/SKIPPED. */
export function makeCompliant(guard = false): NameResolutionCapability {
  return makeStub({ resolveName: compliantForward, resolveAddress: compliantReverse, guard });
}
