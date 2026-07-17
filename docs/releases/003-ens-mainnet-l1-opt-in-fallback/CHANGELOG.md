# Changelog — 003 Mainnet-L1 Opt-In Fallback

> Draft release notes. Changesets merges this body into `packages/adapter-evm/CHANGELOG.md` (and core
> changelog if generated) when the version PR runs `changeset version`.

## [@openzeppelin/adapter-evm@2.3.0] — pending publish

### Minor Changes

- **Opt-in mainnet-L1 miss-fallback (default OFF)** for ENS `resolveName` and `resolveAddress` on
  non-mainnet-bound adapters. When `enableMainnetL1MissFallback: true` and `ensL1Client` is wired,
  consult mainnet L1 only after a **definitive bound-chain empty** / `NAME_NOT_FOUND` on UR-carrying
  chains. Gateway, transport, and timeout failures remain terminal (never-silent-fallback).
- **Cross-network fallback provenance triplet** on L1 miss-fallback successes after UR bound-empty
  miss: `resolvedViaNetworkFallback`, `queriedOnNetworkId`, `resolvedOnNetworkId` on base
  `ResolutionProvenance`. Non-UR direct L1 and canonical forward `001` 1b paths omit the triplet.
  `scopedToNetworkId` stays absent on L1 fallback hits (global display preserved).
- **Reframes `002` reverse L1 ladder** behind the same opt-in — always-on reverse miss-fallback is
  no longer the default; integrators opt in explicitly.

### Changed

- Raise `@openzeppelin/ui-types` peer/dev floor from `^3.2.0` to **`^3.3.0`** (triplet fields).
  Consumers must install ui-types `^3.3.0` alongside this adapter version.

### Migration Guide

1. `pnpm add @openzeppelin/adapter-evm@^2.3.0 @openzeppelin/ui-types@^3.3.0`
2. Default behavior unchanged if you omit `enableMainnetL1MissFallback`.
3. To restore cross-network ENS after bound-empty miss, pass `enableMainnetL1MissFallback: true` on
   `createNameResolution` options.
4. Read fallback disclaimer via `resolvedViaNetworkFallback === true` — not from absent
   `scopedToNetworkId`.

## [@openzeppelin/adapter-evm-core@1.3.0] — workspace only (private)

Bundled into `@openzeppelin/adapter-evm` — not published to npm independently. Version advances in
lockstep for workspace truth and changelog attribution.
