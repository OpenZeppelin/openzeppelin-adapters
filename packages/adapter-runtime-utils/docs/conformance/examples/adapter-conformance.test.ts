/**
 * Example — Pattern 1: wire a concrete adapter through the conformance harness.
 *
 * This file belongs in the ADAPTER's own test suite (e.g. adapter-evm-core), NOT in
 * adapter-runtime-utils — the harness carries zero concrete-adapter dependencies, so the
 * compliant run lives next to the adapter to avoid a dependency cycle.
 *
 * To use: copy into your adapter package, replace `createNameResolution` + `mockEnsClient`
 * with your real factory and pinned/mocked substrate, and adjust the vectors to inputs your
 * mock is pinned to answer.
 */
import { describeConformance } from '@openzeppelin/adapter-runtime-utils/conformance';

// --- Replace these two imports with your real adapter + pinned substrate ---------------------
// import { createNameResolution } from '../src/create-name-resolution';
// import { mockEnsClient } from './__fixtures__/mock-ens-client';
declare function createNameResolution(
  config: { chainId: number },
  deps: { publicClient: unknown }
): import('@openzeppelin/ui-types').NameResolutionCapability;
declare function mockEnsClient(): unknown;
// ---------------------------------------------------------------------------------------------

// The single DI seam: a FRESH capability per case over a pinned (deterministic) substrate.
// The harness calls this once per case and never disposes required-family instances.
const makeCapability = () =>
  createNameResolution({ chainId: 1 }, { publicClient: mockEnsClient() });

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
