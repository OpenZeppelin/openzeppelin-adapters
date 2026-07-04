---
stage: docs
project: ens-uikit-support
sub_feature: sf-3-reverse-resolution
repo: openzeppelin-adapters
mode: extension
extends: packages/adapter-evm-core/src
status: draft
timestamp: 2026-07-04
author: aleksandr.pasevin
previous_stage: artifacts/001-ens-uikit-support/sf-3-reverse-resolution/05-tests.md
tags: [ens, name-resolution, reverse-resolution, forward-verification, avatar, docs, api-reference, integration-guide, viem, getEnsName, getEnsAvatar, resolveAddress, capability, evm, adapter, service]
---

# SF-3 · Reverse resolution + forward-verification + avatar — Documentation

## Summary

Integrator-facing documentation for the EVM **reverse-resolution** path delivered in
`@openzeppelin/adapter-evm-core` (SF-3), documented **as delivered** and folded into the existing
`docs/name-resolution/` doc set alongside SF-2's forward path — one coherent capability reference,
not a fragmented per-sub-feature split. Documented: `EvmNameResolutionService.resolveAddress`
(address → name) as an **Approach A (suppress-on-mismatch)** thin wrapper over viem
`getEnsName({ strict: true })` whose Universal Resolver forward-verifies internally, so
`forwardVerified` is a concrete boolean **constant `true`** on every returned name; the fold of
forward-mismatch (`ReverseAddressMismatch`) / empty record (`null`) / the three address-scoped
resolver reverts / malformed-address input **all onto the single `ADDRESS_NOT_FOUND` code** (the
adapter never surfaces a mismatched name; anti-spoofing is preserved at the UIKit SF-4 display
layer); and the avatar via `getEnsAvatar` as a **post-success, failure/latency-isolated best-effort**
field (`avatarUrl?`, key-absent when undefined, untrusted name-owner content passed verbatim).
Audience: a UIKit or dapp integrator wiring the display path, and consumers calling it. `coinType`
stays 60n — chain-scoped / cross-chain (`EnsProvenance`, `isEnsProvenance`, `scopedToNetworkId`) is
SF-5 and is pointed forward, not documented here.

## Documents

| Document | Purpose | Audience |
|----------|---------|----------|
| `docs/name-resolution/README.md` | Landing page — extended to cover both directions, reverse quick-start, anti-spoofing + avatar safety | All integrators |
| `docs/name-resolution/api-reference.md` | Complete typed surface — added the `resolveAddress` section, `ResolvedName`, reverse precedence table, reverse error-code table | TS developers |
| `docs/name-resolution/integration-guide.md` | Added Pattern 3 (reverse for display) + reverse mocked-client testing + reverse Common Mistakes | Adapter / dapp integrators |
| `docs/name-resolution/examples/reverse-resolve/` | New runnable end-to-end address → verified name (+ avatar) example | All integrators |

All built docs live under `packages/adapter-evm-core/docs/name-resolution/` (co-located with the
package). This pass **extended the four SF-2 documents in place** rather than creating parallel
reverse-only files: the capability is one service with two methods, and a single reference/guide is
the better reader experience. SF-2's forward content is preserved intact; every addition is clearly
attributed to the reverse path (SF-3).

### What each document gained

- **README** — retitled from "forward-resolution capability" to the full name-resolution
  capability (both directions); overview now lists four things the integrator gets (added
  `resolveAddress`); a reverse quick-start block mirrors the forward one; two new Key Concepts
  (verify-or-nothing Approach A; avatar best-effort/isolated); three new Safety bullets
  (anti-spoofing crux with the `forwardVerified`-constant-`true` explanation, untrusted-avatar
  handling, broadened mainnet-bound note); the "what it does not do" list corrected (reverse is no
  longer a not-yet item; avatar image fetching/SSRF hardening added as out-of-scope-for-adapter).
- **API reference** — retitled to cover forward SF-2 + reverse SF-3; `ResolvedName` added to the
  ui-types types row and shown in full; a complete `service.resolveAddress(address)` section with
  the `ResolvedName` shape, the boxed **`forwardVerified` constant-`true`** note (Approach A / viem
  UR-internal verification), the avatar-isolation paragraph, the reverse fixed-precedence table, and
  the symmetric `instanceof BaseError` safe-degradation note; a new **"Codes the reverse path can
  produce"** table (the single `ADDRESS_NOT_FOUND` covering all no-verified-record outcomes, plus
  `UNSUPPORTED_NETWORK` / `RESOLUTION_TIMEOUT` / `EXTERNAL_GATEWAY_ERROR` / `ADAPTER_ERROR`); the
  handling-pattern snippet now shows both directions; `baseEnsProvenance` noted as shared by both
  paths; the version-pin section extended with `ReverseAddressMismatch` + `isNullUniversalResolverError`.
- **Integration guide** — retitled; scope banner covers both; new **Pattern 3: Reverse-resolve an
  address for display** (feature-detect → one async call, the "returned name is always safe to
  render" property, the `ADDRESS_NOT_FOUND`-is-the-whole-anti-spoofing-story explanation, defensive
  avatar handling); the old test pattern renumbered to **Pattern 4** and extended with a reverse
  mocked-client block (`getEnsName` / `getEnsAvatar` mocks + two reverse-specific assertions: avatar
  throw → still `{ ok: true }` with no key; malformed address → `ADDRESS_NOT_FOUND` with no
  `getEnsName` call); five reverse-specific Common Mistakes; a `reverse-resolve` See-also link.
- **Example** — `reverse-resolve/resolve-address.ts` + README: a real viem-mainnet reverse
  resolution runnable via `pnpm tsx resolve-address.ts <address>`, mirroring the canonical display
  loop and demonstrating the always-verified name, the best-effort avatar, and the truncated-hex
  fallback on every failure code.

## Source of truth

The reverse documentation was generated from the delivered source, not the design sketch:

- `packages/adapter-evm-core/src/name-resolution/service.ts` —
  `EvmNameResolutionService.resolveAddress` (steps 1–6: sync support-gate → sync address-shape gate
  → `getEnsName({ strict: true })` → ordered `catch` switch → `null` fold → success construction)
  and the private `tryGetAvatar` (isolated `getEnsAvatar({ strict: true })` → `?? undefined` →
  conditional spread).
- `@openzeppelin/ui-types@3.1.1` `ResolvedName` — `{ address, name, forwardVerified: boolean,
  avatarUrl?: string, provenance }`, read directly from the materialized dev:local link
  (`dist/index.d.mts` L1056). The docs reflect that the **type permits `forwardVerified: false`**
  but the **EVM adapter never emits it** (Approach A), and that `avatarUrl` is optional.
- `src/name-resolution/error-mapping.ts` (SF-1) — `addressNotFound` (the reverse control-path
  constructor) and `mapNameResolutionError` (the `default`-arm transport/gateway/timeout mapper).

Behavioral details reflected verbatim from code: `strict: true` on both the `getEnsName` and
`getEnsAvatar` calls; `forwardVerified` is the literal `true` at the single success site; the input
`address` is echoed byte-identical (no re-checksum); `avatarUrl` is spread conditionally so the key
is **absent** when undefined (never `avatarUrl: undefined`); `elapsedMs` times **only** the
`getEnsName` call (avatar hops are outside the window); the `error instanceof BaseError` gate on the
reverse `errorName` read is **symmetric with the forward path**, so a cross-realm revert degrades
safely to `ADDRESS_NOT_FOUND`'s absence → `ADAPTER_ERROR` (never surfaces a name, never throws).

## Cross-reference to SF-2 docs

This pass complements `sf-2-forward-resolution/06-docs.md`. SF-2 Docs explicitly reserved the
reverse surface for SF-3 Docs ("The delivered `service.ts` already contains `resolveAddress`, but
documenting it belongs to SF-3 Docs") and told readers "not to assume `resolveAddress` is present."
Those forward-facing pointers are now satisfied: the docs cover `resolveAddress`, and the
feature-detect guidance (`cap?.resolveAddress`) is retained and reinforced (it remains optional on
the interface). No SF-2 forward content was removed or contradicted — only extended.

## Out of Scope

- **ENS v2 (`EnsProvenance`, `isEnsProvenance`, CCIP-Read as a configured path, cross-chain /
  `coinType`-scoped addresses, `scopedToNetworkId`, `viaGateway: true`)** — SF-5. The reverse path
  emits `baseEnsProvenance()` (`external: false`, no scope) and `coinType` stays 60n; the docs point
  v2 detection and chain-scoping forward to SF-5.
- **Surfacing a forward-mismatched name with `forwardVerified: false`** — deliberately not built
  (Approach A / INV-11); documented as suppressed → `ADDRESS_NOT_FOUND`. The `ResolvedName` type's
  `false` branch is documented as *contract-reserved but never emitted by this adapter*.
- **Avatar image fetching / caching / rendering / SSRF & mixed-content hardening / avatar-URL
  validation / per-avatar deadline** — consumer (UIKit) responsibility, possibly SF-5 hardening. The
  docs state the adapter returns the verbatim URL only and instruct consumers to fetch/render
  defensively; they do not document a fetching implementation.
- **The `NameResolutionError` union / `ResolvedName` value type / capability interface internals** —
  owned by `@openzeppelin/ui-types` (UIKit SF-1). Docs reproduce shapes for reference and direct
  readers to import from there; they do not re-document upstream ownership.
- **The SF-1 mapper internals / classification algorithm** — SF-1's concern. Reverse-path docs
  describe only the *observable* `default`-arm outcomes (`EXTERNAL_GATEWAY_ERROR` /
  `RESOLUTION_TIMEOUT` / `ADAPTER_ERROR`).
- **The conformance harness (SF-4)** — not yet built; the label-allowlist and determinism semantics
  it defines are out of scope for this pass. (Note: SF-4's deep-equal-under-TTL decision treats
  `avatarUrl` as compared only under a stable avatar surface — a determinism nuance owned by SF-4,
  not restated in these integrator docs.)
- **CHANGELOG** — the initiative is uncommitted working-tree across SF-1/SF-2/SF-3; a changelog
  entry is best authored at the joint commit/release point (dev's call), not per-sub-feature here.
  (Same disposition as SF-2 Docs.)

## Dev Notes

- **Docs boundary honored.** No source, tests, invariants, design, or specify artifacts were
  modified. The only edits outside `docs/` are the Build Status Matrix cell flip for (SF-3, Docs)
  in `00-specify.md` (⏸️ → ⏳ on entry, ⏳ → ✅ at close) + its Last-update line, which the Docs
  stage owns.
- **Extend-in-place over parallel files.** SF-2's docs were forward-scoped with "documented
  separately" pointers to SF-3. Rather than create `reverse-*.md` siblings, this pass extended the
  four shared docs so the capability reads as one coherent surface (two methods, one error union,
  one client). This is the better reader experience and matches how the code is organized
  (`resolveAddress` is a method on the same service, not a new module/factory).
- **`forwardVerified` type-vs-adapter nuance made explicit.** The `ResolvedName` contract permits
  `forwardVerified: false` (the shared type reserves it for adapters that surface unverified names),
  but this EVM adapter's Approach A never emits it. The docs call this out in three places (README
  Safety, API-reference boxed note, integration-guide Common Mistakes) and steer consumers away from
  writing a dead "unverified name" branch — because the mismatch case reaches them as
  `ADDRESS_NOT_FOUND`, never as a `false` flag.
- **Anti-spoofing is stated as the reverse path's whole reason for existing**, not a footnote — the
  README hook, a Key Concept, a Safety bullet, the API boxed note, and the integration-guide Pattern
  3 preamble all carry it, because mis-rendering a spoofed name as trusted is the SF-3 fund/identity
  hazard (UIKit INV-6 Critical).
- **Avatar isolation and untrustedness documented at every layer.** Best-effort (absence is
  normal), failure/latency-isolated (never fails the reverse result, outside the `elapsedMs`
  window), and untrusted name-owner content (SSRF/mixed-content are the consumer's to defend). This
  mirrors the code's `tryGetAvatar` contract (INV-17/INV-19) exactly.
- **Examples are genuinely runnable.** `reverse-resolve/resolve-address.ts` uses viem's `mainnet`
  chain + a real transport (like the forward example), so it runs given an RPC URL; `networkConfig`
  is hand-built with a comment pointing to the runtime-supplied config in a real integration.
- **viem@2.44.4 pin surfaced for the reverse table too** — the API reference now flags
  `ReverseAddressMismatch` and its `isNullUniversalResolverError` membership as things to
  re-validate on a viem major bump, alongside the forward revert names.

## Open Questions

1. **`typecheck:tests` CI project (package-wide; Docs/CI, carried from SF-1 → SF-2 → SF-3).** CI
   does not typecheck `*.test.ts`. Not SF-3-specific and not a docs deliverable, but recorded so it
   is not lost — a maintainer/infra follow-up. (SF-3 Tests verified its suite typechecks clean
   out-of-band; the guarantee is maintainer-verified, not CI-enforced.)
2. **Doc examples are not compiled/executed in CI.** The `docs/**/examples/*.ts` files (both
   `forward-resolve` and now `reverse-resolve`) are hand-verified against the current public types
   but are not part of any `tsc`/test project, so a future export/signature change could silently
   drift them. A `typecheck:examples` project (or a doctest harness) would close this — a
   maintainer/infra follow-up, not blocking.

## Dev-facing note for the Orchestrator

No code-vs-docs discrepancy surfaced in this stage. The delivered `resolveAddress` matches the
SF-3 Design/Invariants/Code artifacts exactly (Approach A, constant-`true` `forwardVerified`,
single-`ADDRESS_NOT_FOUND` fold, isolated best-effort avatar), and the docs describe it as built.
The two Open Questions above are pre-existing CI/infra gaps (item 1 carried from SF-1/SF-2), not
SF-3 defects.
