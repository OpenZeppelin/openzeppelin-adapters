/**
 * Example — Pattern 1: wire a name-resolution adapter through the conformance harness.
 *
 * A runnable, self-contained reference. In a REAL adapter package (e.g. `adapter-evm-core`)
 * you would import your actual factory — `createNameResolution` from
 * `../src/capabilities/name-resolution` — plus a pinned/mocked viem client, and hand the same
 * `makeCapability` + vectors to `describeConformance`.
 *
 * It lives here stubbed inline because `adapter-runtime-utils` carries ZERO concrete-adapter
 * dependencies: `adapter-evm-core` already depends on this package for the harness, so importing
 * it back would be a dependency cycle. The `createNameResolution` + `mockEnsClient` below are a
 * minimal deterministic stand-in that plays the same role — the compliant run over the real EVM
 * adapter lives next to that adapter, in `adapter-evm-core`'s own tests.
 *
 * To adapt: delete the "reference substrate" block and point `makeCapability` at your real
 * factory over your pinned mock.
 */
import { describeConformance } from '@openzeppelin/adapter-runtime-utils/conformance/vitest';
import type {
  NameResolutionCapability,
  NetworkConfig,
  ResolutionResult,
  ResolvedAddress,
  ResolvedName,
} from '@openzeppelin/ui-types';

// ── Reference substrate (stands in for your real adapter + pinned client) ────────────────────
// The one name/address pair the vectors below are pinned to. A real mock would carry the full
// fixture set its vectors assert.
const VITALIK_NAME = 'vitalik.eth';
const VITALIK_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

/** A minimal read-only ENS substrate — the role a mocked viem `PublicClient` plays here. */
interface MockEnsClient {
  readonly lookupAddress: (name: string) => string | undefined;
  readonly lookupName: (address: string) => string | undefined;
}

/** A pinned mock client: resolves exactly one pair, deterministically, in both directions. */
function mockEnsClient(): MockEnsClient {
  return {
    lookupAddress: (name) => (name === VITALIK_NAME ? VITALIK_ADDRESS : undefined),
    lookupName: (address) => (address === VITALIK_ADDRESS ? VITALIK_NAME : undefined),
  };
}

// The bound network is incidental here — the harness never reads `networkConfig`; a real factory
// receives a full config from its runtime. Cast per the harness's own test fixtures.
const MAINNET = { id: 'ethereum-mainnet', ecosystem: 'evm' } as unknown as NetworkConfig;

/**
 * A faithful miniature of a real name-resolution factory: it BORROWS the injected client (never
 * disposing it — INV-15) and returns typed {@link ResolutionResult}s with ENS provenance and a
 * concrete `forwardVerified` — the exact surface the conformance harness grades.
 */
function createNameResolution(
  networkConfig: NetworkConfig,
  options: { readonly publicClient: MockEnsClient }
): NameResolutionCapability {
  const { publicClient } = options;
  return {
    networkConfig,
    isValidName: (name) => name.endsWith('.eth'),
    resolveName: (name): Promise<ResolutionResult<ResolvedAddress>> => {
      const address = publicClient.lookupAddress(name);
      if (address === undefined) {
        return Promise.resolve({ ok: false, error: { code: 'NAME_NOT_FOUND', name } });
      }
      return Promise.resolve({
        ok: true,
        value: { name, address, provenance: { label: 'ENS', external: false } },
      });
    },
    resolveAddress: (address): Promise<ResolutionResult<ResolvedName>> => {
      const name = publicClient.lookupName(address);
      if (name === undefined) {
        return Promise.resolve({ ok: false, error: { code: 'ADDRESS_NOT_FOUND', address } });
      }
      return Promise.resolve({
        ok: true,
        value: {
          address,
          name,
          // Forward-verify the reverse record (INV-6 wants a concrete boolean, either value).
          forwardVerified: publicClient.lookupAddress(name) === address,
          provenance: { label: 'ENS', external: false },
        },
      });
    },
    dispose: () => {
      // Borrowed client — nothing to release (INV-15). Present to satisfy RuntimeCapability.
    },
  };
}
// ─────────────────────────────────────────────────────────────────────────────────────────────

// The single DI seam: a FRESH capability per case over a pinned (deterministic) substrate.
// The harness calls this once per case and never disposes required-family instances.
const makeCapability = () => createNameResolution(MAINNET, { publicClient: mockEnsClient() });

// Top-level await: the capability calls run at collection time, before the it()s are emitted.
await describeConformance({
  suiteName: 'adapter-evm-core NameResolutionCapability',
  makeCapability,
  forwardVectors: [
    { input: 'vitalik.eth', expect: { ok: true } },
    { input: 'nope.eth', expect: { ok: false, code: 'NAME_NOT_FOUND' } },
  ],
  reverseVectors: [
    { input: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', expect: { ok: true } },
    {
      input: '0x0000000000000000000000000000000000000000',
      expect: { ok: false, code: 'ADDRESS_NOT_FOUND' },
    },
  ],
  // Avatar is excluded from the determinism compare by default; set true only if your mock
  // pins a stable avatar surface.
  stableAvatarSurface: false,
});
