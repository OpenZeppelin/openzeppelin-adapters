---
stage: docs
project: ens-uikit-support
sub_feature: sf-2-forward-resolution
repo: openzeppelin-adapters
mode: extension
extends: packages/adapter-evm-core/src
status: draft
timestamp: 2026-07-04
author: aleksandr.pasevin
previous_stage: artifacts/001-ens-uikit-support/sf-2-forward-resolution/05-tests.md
tags: [ens, name-resolution, forward-resolution, docs, api-reference, integration-guide, viem, isValidName, capability, evm, adapter, service]
---

# SF-2 · Forward resolution + capability scaffold + isValidName — Documentation

## Summary

Integrator-facing documentation for the EVM forward-resolution capability delivered in
`@openzeppelin/adapter-evm-core` (SF-2), documented **as delivered**: the `createNameResolution`
factory with an injected viem `PublicClient` (D-A), the synchronous `isValidName` shape gate, the
async `resolveName` (name → address) driven by `getEnsAddress` with `strict: true`, the synchronous
`UNSUPPORTED_NETWORK` support-gate (D-B), and the closed seven-code error surface (of which the
forward path produces six — `ADDRESS_NOT_FOUND` is reverse-only / SF-3). Audience: a UIKit or dapp
integrator wiring the capability into a runtime, and consumers calling it. Four documents produced —
README, API reference, integration guide, a runnable example — plus two Docs/CI items folded in from
SF-2 Tests: (1) the `instanceof BaseError` gate means a foreign-realm resolver revert degrades
**safely** to `ADAPTER_ERROR` (documented accurately in the API reference's error surface), and
(2) CI does not currently typecheck `*.test.ts` (a known gap carried from SF-1), recorded below.

## Documents

| Document | Purpose | Audience |
|----------|---------|----------|
| `docs/name-resolution/README.md` | Landing page, quick start, key concepts, safety | All integrators |
| `docs/name-resolution/api-reference.md` | Complete typed surface + seven-code error union | TS developers |
| `docs/name-resolution/integration-guide.md` | Registration, consumer loop, mocked-client testing, common mistakes | Adapter / dapp integrators |
| `docs/name-resolution/examples/forward-resolve/` | Runnable end-to-end name → address example | All integrators |

All built docs live under `packages/adapter-evm-core/docs/name-resolution/` (co-located with the
package, keeping the repo-level `docs/` reserved for ops/architecture docs).

### What each document covers

- **README** — one-sentence hook; overview with the single integration point (`createNameResolution`
  / `runtime.nameResolution`); explicit "what it does NOT do" (reverse=SF-3, ENS v2=SF-5, no
  L2→L1 fallback); a copy-paste quick-start of the three-step consumer loop; Key Concepts (Tier-2
  network-scoping, injected/borrowed client, `strict: true`, discriminated result); Safety section.
- **API reference** — exports-at-a-glance table with the ownership boundary (value types come from
  `@openzeppelin/ui-types`); full signatures + semantics for `createNameResolution`,
  `CreateNameResolutionOptions`, `EvmNameResolutionService` (incl. the `resolveName` precedence
  table), `createEvmNameResolutionService`, `isValidName`, `normalizeName`, `baseEnsProvenance`;
  the complete error surface with a per-code payload/trigger table, the `ADDRESS_NOT_FOUND`
  not-producible note, the safe-degradation `instanceof` note, and the viem@2.44.4 version pin.
- **Integration guide** — Pattern 1 (register into `adapter-evm/profiles/shared.ts` with the
  injected `ensClient`), Pattern 2 (consumer resolve loop with full error switch), Pattern 3
  (mocked-client unit testing); a Common Mistakes list.
- **Example** — `forward-resolve/resolve.ts` + README: a real viem-mainnet forward resolution,
  runnable via `pnpm tsx resolve.ts <name>`, mirroring the canonical consumer loop.

## Source of truth

The API reference was generated from the delivered source, not the design sketch:

- `packages/adapter-evm-core/src/capabilities/name-resolution.ts` — `createNameResolution`, `CreateNameResolutionOptions`.
- `packages/adapter-evm-core/src/name-resolution/service.ts` — `EvmNameResolutionService.resolveName` / `isValidName` / `dispose`, precedence, classification.
- `packages/adapter-evm-core/src/name-resolution/name-validation.ts` — `isValidName`, `normalizeName`.
- `packages/adapter-evm-core/src/name-resolution/provenance.ts` — `baseEnsProvenance`.
- `packages/adapter-evm-core/src/name-resolution/error-mapping.ts` (SF-1) — the closed `NameResolutionError` union and mapper behavior for the `default`-arm codes.

Behavioral details reflected in the docs, verbatim from code: `strict: true` on the one
`getEnsAddress` call; the success `value.name` echoes the caller's **original** input (not the
normalized form); the resolved `address` is passed through byte-identical (no re-checksum);
`networkId` on `UNSUPPORTED_NETWORK` is `networkConfig.id` (code drift D1, not the design's
`networkId`); `provenance` is `{ label: 'ENS', external: false }`, freshly allocated per call.

## Fold-ins from SF-2 Tests (the two Docs/CI items)

1. **`instanceof BaseError` gate → foreign-realm revert degrades SAFELY to `ADAPTER_ERROR`.**
   The Tests stage raised a doc-vs-code divergence: the Invariants Dev Note implied the
   resolver-revert `switch` would classify a foreign-realm revert (matching `errorName`, failing
   `instanceof`) to `NAME_NOT_FOUND`/`UNSUPPORTED_NAME`. The delivered `service.ts` gates the
   `errorName` read on `error instanceof BaseError`, so a foreign-realm / duplicate-viem-copy revert
   is **not** read for its `errorName` and falls through to the mapper's `ADAPTER_ERROR` fallback.
   This is **accurate to actual behavior** and is now documented that way in the API reference's
   error surface (the boxed "safe degradation" note): never a wrong/coerced address, never a throw,
   `cause` preserved — only classification *precision* degrades in the rare duplicate-copy case, and
   in the normal single-copy case the precise code is produced. See Open Questions for the proposed
   upstream reword of the **Invariants** Dev Note (Docs does not modify the invariants artifact —
   flagged for the Orchestrator to route).
2. **CI does not typecheck `*.test.ts` (carried from SF-1).** `tsconfig.json` excludes
   `src/**/*.test.ts` and `vitest` transpiles without full type-checking, so test-file type errors
   are not caught by the default `tsc`/`test` scripts. SF-1 and SF-2 Tests both verified their test
   files typecheck clean out-of-band via a scratch tsconfig, but this is not durable in CI. Recorded
   here as a known, package-wide gap (not SF-2-specific); a `typecheck:tests` CI project would close
   it. Noted so downstream consumers of these docs know the test-level type guarantees are
   maintainer-verified, not CI-enforced.

## Out of Scope

- **Reverse resolution (`resolveAddress`, `forwardVerified`, avatar)** — SF-3. The delivered
  `service.ts` already contains `resolveAddress`, but documenting it belongs to SF-3 Docs; this pass
  covers the forward surface only. The docs explicitly tell readers not to assume `resolveAddress`
  is present.
- **ENS v2 (`EnsProvenance`, `isEnsProvenance`, CCIP-Read as a configured path, cross-chain /
  `coinType`-scoped addresses, `scopedToNetworkId`)** — SF-5. Docs note `provenance.external` is
  always `false` on the v1 path and `scopedToNetworkId` is absent, pointing to SF-5 for accurate
  offchain/scoping detection.
- **L2-bound resolution with L1 fallback** — an additive SF-5 feature, not yet implemented. Per the
  scope note, SF-2 is documented as mainnet-bound (`coinType` 60) with `UNSUPPORTED_NETWORK` on a
  network lacking an ENS Universal Resolver; the docs state there is no fallback in this release.
- **The `NameResolutionError` union / value types / capability interface internals** — owned by
  `@openzeppelin/ui-types` (UIKit SF-1). Docs reproduce the union shape for reference and direct
  readers to import from there; they do not re-document upstream ownership decisions.
- **The SF-1 mapper internals / classification algorithm** — SF-1's concern. Forward-path docs
  describe only the *observable* `default`-arm outcomes (`EXTERNAL_GATEWAY_ERROR` /
  `RESOLUTION_TIMEOUT` / `ADAPTER_ERROR`), not the mapper's walk.
- **The conformance harness (SF-4)** — not yet built; the label-allowlist and determinism semantics
  it defines are out of scope for this pass.
- **CHANGELOG** — the initiative is uncommitted working-tree across SF-1/SF-2/SF-3; a changelog entry
  is best authored at the joint commit/release point (dev's call), not per-sub-feature here.

## Dev Notes

- **Docs boundary honored.** No source, tests, invariants, design, or specify artifacts were
  modified. The only edit outside `docs/` is the Build Status Matrix cell flip in `00-specify.md`
  (⏸️ → ⏳ on entry; ⏳ → ✅ at stage close), which the Docs stage owns.
- **Built-docs home.** Placed under `packages/adapter-evm-core/docs/name-resolution/` rather than the
  repo-level `docs/` (which holds `ADAPTER_ARCHITECTURE.md` / `DEVOPS_SETUP.md` / `RUNBOOK.md`, all
  ops-oriented). Package-co-located docs keep the capability's reference next to its code and leave a
  clear slot for SF-3/SF-5 to append reverse / v2 sections.
- **Forward path = 6 of 7 codes.** The brief says "7-code error surface"; the docs present the full
  closed seven-code union (it is the shared contract) but clearly mark `ADDRESS_NOT_FOUND` as
  reverse-only (SF-3) and unreachable from `resolveName`. The six forward-producible codes are
  `NAME_NOT_FOUND`, `UNSUPPORTED_NETWORK`, `UNSUPPORTED_NAME`, `RESOLUTION_TIMEOUT`,
  `EXTERNAL_GATEWAY_ERROR`, `ADAPTER_ERROR`.
- **Example runnability.** `forward-resolve/resolve.ts` uses `viem`'s `mainnet` chain and a real
  transport, so it is genuinely runnable (given an RPC URL) rather than pseudo-code. The
  `networkConfig` is hand-built with a comment pointing readers to the runtime-supplied config in a
  real integration; a `NetworkConfig` is intentionally not fully constructed in the example to keep
  it focused on the resolve loop.
- **Version pin surfaced.** The viem@2.44.4 pin on the revert-`errorName` classification is
  documented in the API reference so a consumer who bumps viem knows to re-validate.

## Open Questions

1. **Proposed upstream reword of the Invariants Dev Note (route to Orchestrator → SF-2 Invariants).**
   The Invariants Dev Note should be reworded to state that a foreign-realm resolver revert (matching
   `errorName`, failing `instanceof BaseError`) degrades **safely to `ADAPTER_ERROR`** — the
   `errorName`-needle backstops only the *transport* buckets in the SF-1 mapper, not the SF-2
   resolver-semantic `switch`, which is `instanceof`-gated. The API reference already documents the
   accurate behavior; this is a wording alignment on the *invariants* artifact, which Docs must not
   edit directly. (Same item SF-2 Tests raised as its Open Q1; carried here as a Docs-confirmed
   recommendation, not a code change.)
2. **`typecheck:tests` CI project (package-wide; Docs/CI, carried from SF-1).** CI does not typecheck
   `*.test.ts`. Not SF-2-specific and not a docs deliverable, but recorded so it is not lost — a
   maintainer/infra follow-up.
