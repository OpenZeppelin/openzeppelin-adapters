# @openzeppelin/adapters-vite

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
