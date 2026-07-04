---
stage: docs
project: ens-uikit-support
repo: openzeppelin-adapters
sub_feature: SF-4
mode: extension
extends: packages/adapter-runtime-utils
status: draft
timestamp: 2026-07-04
author: aleksandr.pasevin
previous_stage: artifacts/001-ens-uikit-support/sf-4-conformance-harness/05-tests.md
tags: [conformance, tck, name-resolution, adapter, test-infrastructure, docs, deep-equal, allowlist, seeded-defect, cross-repo]
---

# SF-4: Adapter Conformance Test Harness — Documentation

## Summary

Documented the delivered `@openzeppelin/adapter-runtime-utils/conformance` harness as an
**adapter-author integration guide** — how to run `checkConformance(config)` /
`describeConformance(config)` against a `NameResolutionCapability`, the `ConformanceReport` shape and
invariant-numbered keys, required-vs-optional family feature-detection + SKIP semantics, the label
policy (allowlist + denylist + `labelPolicy` override), the deep-equal-under-TTL determinism engine,
and the seeded-defect meta-suite / SC-004 100%-detection story. The headline pattern — wiring a
concrete adapter through the harness via a `makeCapability()` factory, with the compliant run living
in `adapter-evm-core`'s **own** tests (dep-cycle avoidance) — is a copy-paste example. Every code
example is type-correct against the shipped `@openzeppelin/ui-types@3.1.1` types (the two example
modules were compiled with the package's own `tsc` — clean). The two carry-forward Open Questions are
recorded verbatim: the INV-19 fine-grained emission-spy residual + the recommended non-blocking
runner-injection seam, and the `adapter-evm-core` compliant-run wiring as a known downstream follow-up.

## Documents

| Document | Purpose | Audience |
|----------|---------|----------|
| `docs/conformance/README.md` | Landing page: what the harness is, quick start, key concepts, safety | All adapter authors |
| `docs/conformance/api-reference.md` | Every public export with full TS signature; report key shapes; error-code set | TS developers |
| `docs/conformance/integration-guide.md` | 5 integration patterns, INV-8 decision table, common mistakes, known limitations, maintainer SC-004 note | Adapter authors (EVM today, Solana/Midnight later) |
| `docs/conformance/examples/adapter-conformance.test.ts` | Pattern 1: `makeCapability()` wiring for a concrete adapter (copy into `adapter-evm-core`) | Adapter authors |
| `docs/conformance/examples/ci-gate.ts` | Pattern 2: runner-agnostic gate over `checkConformance` (self-contained, runnable) | Adapter authors / CI |
| `docs/conformance/examples/README.md` | Index of the examples | All developers |

All built docs live under `packages/adapter-runtime-utils/docs/conformance/` — scoped to the
`./conformance` subpath so they never collide with a future runtime-`.`-entry README. No CHANGELOG
entry: this is a net-new subpath (purely additive), and the package had no prior README/docs tree to
extend.

## What the docs cover (traceability to the delivered surface)

- **Public API** (`index.ts`): `checkConformance`, `describeConformance`, `isUserSafeLabel`,
  `DEFAULT_LABEL_POLICY`, `normalizeResolutionResult`, `structuralEqual`, `NAME_RESOLUTION_ERROR_CODES`,
  `ConformanceConfigError`, and all re-exported types. Each is in `api-reference.md` with its full
  signature drawn from source.
- **`ConformanceReport` shape + keys** (INV-1/INV-3): the `{ results, passed }` value, `passed` as a
  *computed* `results.every(status ≠ FAIL)`, and the six report-key shapes (`inv6_…`, `inv8_…`,
  `inv12_…`, `inv16_…`, `inv_expect_…`, `inv26_…`), including `<direction>` and the `_2` dedup suffix.
- **Per-invariant SC-004 messages**: the guide explains that a red key traces to exactly one
  invariant × case and the `message` states expected-vs-observed.
- **Required-vs-optional feature-detection + SKIP** (INV-2): absent `resolveName` → forward family
  SKIPPED; absent `resolveAddress` → reverse family **and** INV-6 SKIPPED; the emphatic "SKIPPED is
  not PASS" framing in both README Safety and the guide's common-mistakes.
- **Label policy** (INV-5/INV-16/INV-24): `DEFAULT_LABEL_POLICY` (allowlist regex, `maxLength: 64`,
  the five denylist rules), the locked corpus, and the verbatim (non-merged) `labelPolicy` override —
  with a custom-policy example.
- **Deep-equal-under-TTL** (INV-12/13/14/15/21): the normalize pre-pass (recursive undefined-drop,
  avatar excluded unless `stableAvatarSurface`, `error.cause` never inspected) and `structuralEqual`
  semantics (order-insensitive key-set equality, identity fallback), framed as "a memoizer and a
  re-querier both pass".
- **Seeded-defect meta-suite / SC-004** (INV-25): a maintainer section explaining the four defect
  classes, "the TCK tests itself", and what 100% detection means.
- **INV-8 never-throw decision table**: reproduced in the guide, including the in-union-but-wrong-code
  PASS-with-note (SC-002 is the adapter's own suite's job) and the `RuntimeDisposedError` → SKIPPED row.
- **Optional lifecycle probe** (INV-26): documented as opt-in (`lifecycleProbe: true`), isolated to a
  dedicated instance, SKIPPED when no `dispose`.

## The concrete-adapter wiring pattern (headline)

`integration-guide.md` Pattern 1 and `examples/adapter-conformance.test.ts` show the exact
`makeCapability()` factory wiring so `adapter-evm-core`'s follow-up is copy-paste:

```ts
const makeCapability = () =>
  createNameResolution({ chainId: 1 }, { publicClient: mockEnsClient() });

await describeConformance({ suiteName: '…', makeCapability, forwardVectors, reverseVectors });
```

The docs state plainly, in three places (README Overview + Safety, guide Pattern 1), that **the
compliant conformance run lives in the adapter's own test suite, not in `adapter-runtime-utils`** —
because the harness carries zero concrete-adapter dependencies and this avoids the
`adapter-runtime-utils → adapter-evm-core → adapter-runtime-utils` cycle. The mocked client is the
caller-owned pinned substrate the harness never constructs.

## Out of Scope

- **A CHANGELOG entry** — the harness is a net-new subpath with no prior published docs to migrate; a
  package-level changelog is deferred to whenever the package first cuts a versioned release.
- **Runtime-`.`-entry (`adapter-runtime-utils` core) documentation** — untouched by SF-4; these docs
  cover only the `./conformance` subpath. The pre-existing `runtime-*` exports are out of scope.
- **The compliant-EVM run write-up as delivered docs** — it does not exist yet (it is
  `adapter-evm-core`'s follow-up); the docs describe how to write it, not a shipped run. Carried as
  Open Question #2.
- **ENS v2 / `EnsProvenance`-specific conformance guidance** — SF-5 additive; the widened allowlist
  already accommodates SF-5 labels (`'ENS via CCIP-Read'`), but no v2-specific doc section is written
  here.
- **A published examples package with its own `package.json` / install step** — the examples are
  copy-paste modules against the already-present subpath dependency, not a standalone installable
  project; that matches how adapter authors consume them (drop into an existing adapter test suite).

## Dev Notes

- **No code-vs-docs discrepancy found.** The delivered source matches the design/invariants/tests
  artifacts exactly. The API reference was written from `index.ts` / `types.ts` /
  `label-policy.ts` / `deep-equal.ts` / `vitest-binding.ts` / `checks/*` as the source of truth, not
  from the design sketch — notably it documents the two `InvariantId` members the Code stage added
  beyond the design's four (`EXPECT`, `INV-26`) and the `lifecycleProbe` config flag, all of which are
  present in the shipped types.
- **Examples verified type-correct.** Both `examples/*.ts` were compiled with
  `./node_modules/.bin/tsc -p tsconfig.json` (import rewritten to the local source path for the
  check) against the real `@openzeppelin/ui-types@3.1.1` dev:local link — clean, zero errors. Caught
  and fixed two shape bugs while drafting: a forward-success value must be a `ResolvedAddress`
  (`{ name, address, provenance: { label, external } }` — I initially omitted `name` and `external`),
  and the `NAME_NOT_FOUND` error variant is `{ code, name }`, not `{ code, message }`.
- **Operational discipline honored.** All type-checking ran via `./node_modules/.bin/tsc` directly,
  never a bare `pnpm` script, per the overlay-revert hazard flagged in the Code/Tests stages. The
  ui-types dev:local overlay symlink was left intact; no source or test file was modified (temp check
  files were created and deleted inside `src/conformance/`, leaving the tree byte-identical).
- **Docs placement.** Built docs live under `docs/conformance/` rather than a package-root `README.md`
  because SF-4 documents only the test-only `./conformance` subpath, not the package's runtime entry.

## Open Questions

1. **INV-19 fine-grained emission-spy residual + recommended runner-injection seam (carried from
   Tests).** `describeConformance`'s exact vitest emission — call count/order and the
   `FAIL → it(() => expect.fail(message))` branch — cannot be asserted by an in-process spy, because
   the binding reads `it`/`it.skip` from the immutable `vitest` ES-module namespace (neither
   `vi.spyOn` nor reassignment can intercept it). **Documented as a known limitation** in
   `integration-guide.md § Known Limitations` and flagged in `api-reference.md` under
   `describeConformance`. The consumer-visible contract *is* verified end-to-end (PASS/SKIP + the
   `ConformanceConfigError`-at-collection path). **Recommended (non-blocking) future enhancement:** a
   purely-additive runner-injection seam — an optional `{ it }` argument to `describeConformance`
   defaulting to the vitest import — would let a test pass a recording runner and close INV-19 1:1
   without changing any default behavior. This is a Code-stage edit; owner is the Orchestrator → Code
   if desired. *(Not a blocker; INV-19's consumer contract is already verified.)*
2. **`adapter-evm-core` compliant-EVM run wiring (known downstream follow-up, out of this package's
   scope).** The compliant `describeConformance(...)` over a real `createNameResolution` + a mocked
   viem client belongs in `adapter-evm-core`'s own Tests slice to fully discharge SC-004 against a
   real adapter (dep-cycle avoidance keeps it out of `adapter-runtime-utils`). The docs supply the
   exact copy-paste wiring (`integration-guide.md` Pattern 1 + `examples/adapter-conformance.test.ts`);
   the run itself is that package's to add. *(Owner: adapter-evm-core slice.)*
