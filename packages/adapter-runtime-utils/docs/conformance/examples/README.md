# Conformance harness — examples

Copy-paste starting points for the two patterns most adapter authors need. Each file is a complete,
type-correct module against the current `./conformance` public API.

| Example | Pattern | What it shows |
|---------|---------|---------------|
| [`adapter-conformance.test.ts`](./adapter-conformance.test.ts) | Pattern 1 | The `makeCapability()` wiring for a concrete adapter, in the adapter's own test suite. Copy this into `adapter-evm-core` and swap in the real factory + mocked client. |
| [`ci-gate.ts`](./ci-gate.ts) | Pattern 2 | A runner-agnostic CI gate over `checkConformance` — no vitest. Self-contained (uses an inline abstract stub) so it runs as-is; swap the stub for your real factory. |

Both import from `@openzeppelin/adapter-runtime-utils/conformance`, already a dependency of every
adapter package. `vitest` is an optional peer (you have it as your test runner).

See the [integration guide](../integration-guide.md) for the full walkthrough, feature-detection,
custom label policies, the optional lifecycle probe, and common mistakes.
