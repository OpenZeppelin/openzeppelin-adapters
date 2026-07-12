# @openzeppelin/adapter-runtime-utils

## 0.1.0

### Minor Changes

- [#50](https://github.com/OpenZeppelin/openzeppelin-adapters/pull/50) [`fd4f177`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/fd4f177c01c1a49ba3092daac1448afa94a26ccc) Thanks [@pasevin](https://github.com/pasevin)! - Add a parameterized adapter conformance harness under the new `./conformance` subpath. Any `NameResolutionCapability` implementation can run it to prove contract compliance: `forwardVerified` is always a concrete boolean, expected failures return `ok: false` (never throw), deterministic inputs under stable state return structurally-equal results (deep-equal-under-cache-TTL), and `provenance.label` is user-safe. `vitest` is declared as an optional peer dependency.

  Hardening: the harness now grades inside `invoke()` containment with runtime shape guards, so a malformed adapter return yields a FAIL verdict instead of throwing (SC-004).

  Hardening: value-grading/normalization run under `safeGrade` so any throw (bigint field, circular ref, throwing getter) becomes a descriptive FAIL (SC-004 totality; deep-equal is bigint-safe with a cycle/depth guard), and the `vitest` binding moved to the `./conformance/vitest` subpath so the pure `checkConformance` core imports no runner.

  Fix: the composed runtime now exposes `nameResolution` when the adapter provides the factory (gated on factory presence), so ENS-capable adapters surface it on every profile.

  Fix: the lazy runtime factory map (`createLazyRuntimeCapabilityFactories`) also exposes `nameResolution` (gated on the creator), so the composer built through the lazy path surfaces it too.

### Patch Changes

- [#50](https://github.com/OpenZeppelin/openzeppelin-adapters/pull/50) [`fd4f177`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/fd4f177c01c1a49ba3092daac1448afa94a26ccc) Thanks [@pasevin](https://github.com/pasevin)! - Fix: include `nameResolution` in `DISPOSABLE_CAPABILITY_KEYS` so `runtime.dispose()` invokes the capability's `dispose()` (previously the optional ENS capability was left undisposed on teardown). Regression: the optional-nameResolution profile-runtime suite asserts the dispose spy is called exactly once and stays idempotent across a second `runtime.dispose()`.

- [#50](https://github.com/OpenZeppelin/openzeppelin-adapters/pull/50) [`fd4f177`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/fd4f177c01c1a49ba3092daac1448afa94a26ccc) Thanks [@pasevin](https://github.com/pasevin)! - Raise the `@openzeppelin/ui-types` range floor from `^3.1.0` to `^3.2.0`. The ENS v2 name-resolution work populates `ResolutionProvenance.external` and `ResolutionProvenance.scopedToNetworkId`, which were introduced in `@openzeppelin/ui-types@3.2.0`; a consumer pinned to `3.1.0` would not have these fields on the shared provenance contract. No runtime change for workspace builds (the lockfile already resolves ui-types 3.2.0, which satisfies both the old and new floors).
