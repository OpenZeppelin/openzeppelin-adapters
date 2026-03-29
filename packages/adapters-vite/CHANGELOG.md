# @openzeppelin/adapters-vite

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
