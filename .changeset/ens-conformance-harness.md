---
"@openzeppelin/adapter-runtime-utils": minor
---

Add a parameterized adapter conformance harness under the new `./conformance` subpath. Any `NameResolutionCapability` implementation can run it to prove contract compliance: `forwardVerified` is always a concrete boolean, expected failures return `ok: false` (never throw), deterministic inputs under stable state return structurally-equal results (deep-equal-under-cache-TTL), and `provenance.label` is user-safe. `vitest` is declared as an optional peer dependency.
