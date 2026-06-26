# @openzeppelin/adapters-vite

## 3.0.1

### Patch Changes

- [#48](https://github.com/OpenZeppelin/openzeppelin-adapters/pull/48) [`712a007`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/712a0071ecd72d85d2ff10cb49924593193878ae) Thanks [@pasevin](https://github.com/pasevin)! - chore(deps): resolve remaining Dependabot security alerts for transitive dependencies

  Update the workspace `pnpm` overrides so vulnerable transitive dependencies resolve to patched versions:
  - `protobufjs` &rarr; `^7.6.3` (was pinned to `^7.5.8`, still allowed `7.6.x` advisories)
  - `hono` &rarr; `^4.12.25` (was `^4.12.21`)
  - `ws` &rarr; `^8.21.0` for the v8 line and `^7.5.11` for the v7 line
  - `form-data` &rarr; `^4.0.6` (CRLF injection)
  - `ua-parser-js` &rarr; `^2.0.10` (ReDoS)
  - `js-yaml` (v4) &rarr; `^4.2.0` (quadratic-complexity DoS)
  - `uuid` &rarr; `^11.1.1` (missing buffer bounds check)
  - `@babel/core` &rarr; `^7.29.6` (arbitrary file read via `sourceMappingURL`)

  `elliptic` (`<= 6.6.1`) has no published fix and remains; it is a low-severity advisory with no upstream patch available.

  These overrides only affect dependency resolution within this monorepo's lockfile and do not change the published packages' declared dependency ranges.

- Updated dependencies [[`712a007`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/712a0071ecd72d85d2ff10cb49924593193878ae)]:
  - @openzeppelin/adapter-evm@2.1.1
  - @openzeppelin/adapter-midnight@2.1.1
  - @openzeppelin/adapter-polkadot@2.1.1
  - @openzeppelin/adapter-solana@2.1.1
  - @openzeppelin/adapter-stellar@2.1.1

## 3.0.0

### Patch Changes

- Updated dependencies [[`2863f20`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/2863f20933c1c361815f987a9456f5a0bc04724a), [`9d6de1a`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/9d6de1aa9eb962c40d6d9af263afe711a527c429)]:
  - @openzeppelin/adapter-polkadot@2.1.0
  - @openzeppelin/adapter-evm@2.1.0

## 2.0.0

### Patch Changes

- Updated dependencies [[`481f206`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/481f206b948a4099a8fee55c44128cca279dc2ba), [`c620934`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/c62093448eef452344dc26f320bca1e731c40cde), [`15ba208`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/15ba208b3207771139f1f340ed943a04624efcc0), [`fc1bf41`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/fc1bf41b4ad6ebb34e7271e643a29917ca514a51)]:
  - @openzeppelin/adapter-evm@2.0.0
  - @openzeppelin/adapter-polkadot@2.0.0
  - @openzeppelin/adapter-stellar@2.0.0
  - @openzeppelin/adapter-solana@2.0.0
  - @openzeppelin/adapter-midnight@2.0.0

## 1.3.2

### Patch Changes

- [#21](https://github.com/OpenZeppelin/openzeppelin-adapters/pull/21) [`b39b9c0`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/b39b9c0103b5c4e41b54a9c4c09ac9dbc90cceb1) Thanks [@pasevin](https://github.com/pasevin)! - Fix Vite compatibility for relayer-backed adapters by aliasing `@openzeppelin/relayer-sdk`
  to its ESM build and preserving app-level alias overrides when configs are merged.

## 1.3.1

### Patch Changes

- [#19](https://github.com/OpenZeppelin/openzeppelin-adapters/pull/19) [`cc80c2f`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/cc80c2ffdb3943a9d2eaaa1af1c9577e0c3d0196) Thanks [@pasevin](https://github.com/pasevin)! - Fix the default Vitest adapter export alias order so `metadata` and `networks`
  subpath imports resolve before the broader package root alias.

## 1.3.0

### Minor Changes

- [#17](https://github.com/OpenZeppelin/openzeppelin-adapters/pull/17) [`517c976`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/517c976cd72f54787f0e14f8fce38e3375335ee1) Thanks [@pasevin](https://github.com/pasevin)! - Add higher-level Vite and Vitest integration helpers, including a shared
  builder API that lets consumer apps reuse one adapters integration entry point
  across both tools.

## 1.2.1

### Patch Changes

- [#15](https://github.com/OpenZeppelin/openzeppelin-adapters/pull/15) [`e124e7f`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/e124e7f6ca92758b68f41e39510a315cb6f34e1c) Thanks [@pasevin](https://github.com/pasevin)! - Tighten the public `loadOpenZeppelinAdapterViteConfig` return type so consumers
  can rely on concrete arrays for merged adapter config fields without adding
  defensive defaults in each app.

## 1.2.0

### Minor Changes

- [#13](https://github.com/OpenZeppelin/openzeppelin-adapters/pull/13) [`3c1a283`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/3c1a2832a7616a9f4ef68e170c49a17a2deddc60) Thanks [@pasevin](https://github.com/pasevin)! - Add a shared Vite and Vitest integration package for OpenZeppelin adapters.

  The new `@openzeppelin/adapters-vite` package centralizes loading adapter
  `./vite-config` exports, merging build-time requirements, and resolving adapter
  package entry points for Vitest. Documentation now treats the adapters repo as
  the source of truth for adapter architecture and build-time integration.
