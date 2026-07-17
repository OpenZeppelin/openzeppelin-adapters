# Release — 003 Mainnet-L1 Opt-In Fallback (`@openzeppelin/adapter-evm`)

> Ships opt-in mainnet-L1 miss-fallback for ENS forward and reverse resolution (default **OFF**),
> cross-network fallback provenance on definitive bound-empty misses, and the `002` reverse ladder
> reframe — exclusively through a **public `@openzeppelin/adapter-evm` npm bump** that bundles
> private `@openzeppelin/adapter-evm-core`.

## Overview

**Audience:** npm consumers of `@openzeppelin/adapter-evm`, release engineers, and UIKit integrators
pinning adapter + `@openzeppelin/ui-types` together.

**What this release delivers:**

- **SF-1** — `enableMainnetL1MissFallback` opt-in (strict `true` only; default OFF).
- **SF-2** — Cross-network provenance triplet on base `ResolutionProvenance` when L1 miss-fallback
  succeeds after a **UR bound-empty miss** (`resolvedViaNetworkFallback`, `queriedOnNetworkId`,
  `resolvedOnNetworkId`). Non-UR direct L1 omits the triplet.
- **SF-3 / SF-4** — Reverse and forward mainnet-L1 miss-fallback ladders (definitive-miss only;
  never-silent-fallback on gateway/transport failures).

**Prerequisite:** `@openzeppelin/ui-types@^3.3.0` (triplet fields). Publish ui-types **before** or
alongside this adapter release.

**Release-trap guard:** `@openzeppelin/adapter-evm-core` is `private: true` and bundled via `tsdown`
`noExternal`. A core-only version bump does **not** reach npm consumers — the `002` failure mode.
This release uses a **dual-package changeset** bumping **both** `adapter-evm` and `adapter-evm-core`.

## Quick Start (consumer)

```bash
pnpm add @openzeppelin/adapter-evm@^2.3.0 @openzeppelin/ui-types@^3.3.0
```

Opt-in is **explicit** — wiring `ensL1Client` alone does not enable miss-fallback:

```ts
import { createNameResolution } from '@openzeppelin/adapter-evm';

const capability = createNameResolution(networkConfig, {
  publicClient: boundClient,
  ensL1Client: mainnetClient,
  enableMainnetL1MissFallback: true, // default OFF when omitted
});
```

Default posture is unchanged: without `enableMainnetL1MissFallback: true`, bound-empty reverse and
bound `NAME_NOT_FOUND` forward stay terminal (no L1 consult).

## Expected versions (after `changeset version`)

| Package | From | To |
|---------|------|-----|
| `@openzeppelin/adapter-evm` | `2.2.0` | `2.3.0` (minor) |
| `@openzeppelin/adapter-evm-core` | `1.2.0` | `1.3.0` (minor, private) |
| Linked adapters (`midnight`, `polkadot`, `solana`, `stellar`) | `2.2.0` | `2.3.0` (Changesets linked group) |

Exact numbers are produced by Changesets — do not hand-edit `package.json` versions.

## Key Concepts

- **Install `adapter-evm`, not core.** npm consumers receive bundled core in `adapter-evm/dist`.
  Workspace `adapter-evm-core@1.3.0` alone does not satisfy SC-005.
- **Dual changeset is mandatory.** `.changeset/ens-mainnet-l1-opt-in-fallback.md` lists both packages.
- **ui-types floor `^3.3.0`.** Required for triplet field types at compile time and runtime honesty.
- **Emission rule.** Triplet appears only after UR bound-empty → L1 success with opt-in ON; canonical
  non-UR forward L1 (`001` 1b) and non-UR direct reverse omit it.
- **Dist verification.** Post-build grep on `packages/adapter-evm/dist` proves the bundle contains the
  003 delta (see Integration Guide — maintainer checklist).

## Feature documentation

Runtime behavior is documented in the name-resolution package docs:

- [`packages/adapter-evm-core/docs/name-resolution/README.md`](../../packages/adapter-evm-core/docs/name-resolution/README.md)
- [`integration-guide.md`](../../packages/adapter-evm-core/docs/name-resolution/integration-guide.md) —
  Patterns 8–10 (opt-in ladders + triplet)

## Integration Guide

See [integration-guide.md](./integration-guide.md) for consumer adoption, migration, and maintainer
release verification.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for the release notes body (merged into package CHANGELOGs by
Changesets on version PR).

## Safety

- **Default OFF** — no silent cross-network resolution; integrators must opt in explicitly.
- **Never-silent-fallback** — bound gateway/timeout failures do not fall through to L1.
- **Do not infer fallback** from absent `scopedToNetworkId`; use `resolvedViaNetworkFallback === true`.
- **Pin ui-types `^3.3.0`** with the adapter bump — older ui-types lack triplet fields.

## License

Inherits the `@openzeppelin/adapter-evm` package license.
