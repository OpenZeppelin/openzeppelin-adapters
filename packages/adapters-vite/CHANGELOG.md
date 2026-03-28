# @openzeppelin/adapters-vite

## 1.2.0

### Minor Changes

- [#13](https://github.com/OpenZeppelin/openzeppelin-adapters/pull/13) [`3c1a283`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/3c1a2832a7616a9f4ef68e170c49a17a2deddc60) Thanks [@pasevin](https://github.com/pasevin)! - Add a shared Vite and Vitest integration package for OpenZeppelin adapters.

  The new `@openzeppelin/adapters-vite` package centralizes loading adapter
  `./vite-config` exports, merging build-time requirements, and resolving adapter
  package entry points for Vitest. Documentation now treats the adapters repo as
  the source of truth for adapter architecture and build-time integration.
