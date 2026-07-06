---
"@openzeppelin/adapter-runtime-utils": minor
---

Add a parameterized adapter conformance harness under the new `./conformance` subpath. Any `NameResolutionCapability` implementation can run it to prove contract compliance: `forwardVerified` is always a concrete boolean, expected failures return `ok: false` (never throw), deterministic inputs under stable state return structurally-equal results (deep-equal-under-cache-TTL), and `provenance.label` is user-safe. `vitest` is declared as an optional peer dependency.

Hardening: the harness now grades inside `invoke()` containment with runtime shape guards, so a malformed adapter return yields a FAIL verdict instead of throwing (SC-004).

Hardening: value-grading/normalization run under `safeGrade` so any throw (bigint field, circular ref, throwing getter) becomes a descriptive FAIL (SC-004 totality; deep-equal is bigint-safe with a cycle/depth guard), and the `vitest` binding moved to the `./conformance/vitest` subpath so the pure `checkConformance` core imports no runner.

Fix: the composed runtime now exposes `nameResolution` when the adapter provides the factory (gated on factory presence), so ENS-capable adapters surface it on every profile.

Fix: the lazy runtime factory map (`createLazyRuntimeCapabilityFactories`) also exposes `nameResolution` (gated on the creator), so the composer built through the lazy path surfaces it too.
