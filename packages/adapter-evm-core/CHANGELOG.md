# @openzeppelin/adapter-evm-core

## 1.1.0

### Minor Changes

- [#50](https://github.com/OpenZeppelin/openzeppelin-adapters/pull/50) [`fd4f177`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/fd4f177c01c1a49ba3092daac1448afa94a26ccc) Thanks [@pasevin](https://github.com/pasevin)! - Add the ENS name-resolution capability for EVM: forward resolution (`resolveName`), reverse resolution (`resolveAddress` with a concrete `forwardVerified` boolean and optional avatar), the synchronous `isValidName` shape check, and the native-error → closed 7-code `NameResolutionError` mapping (expected failures return `{ ok: false }` and never throw). Includes ENS v2 (L1-only: CCIP-Read + cross-chain via `coinType`) with the EVM-specific `EnsProvenance` extension type and the `isEnsProvenance` type guard.

  Hardening: the SF-5 forward path builds its observing client with `retryCount: 0` so the borrowed transport is the sole retry owner (no `elapsedMs` inflation into `RESOLUTION_TIMEOUT`), and error-mapping credential redaction is widened to base64url and hyphenated bare-trailing keys plus more keyed query params (the opaque `cause` stays unredacted).

### Patch Changes

- [#50](https://github.com/OpenZeppelin/openzeppelin-adapters/pull/50) [`fd4f177`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/fd4f177c01c1a49ba3092daac1448afa94a26ccc) Thanks [@pasevin](https://github.com/pasevin)! - Raise the `@openzeppelin/ui-types` range floor from `^3.1.0` to `^3.2.0`. The ENS v2 name-resolution work populates `ResolutionProvenance.external` and `ResolutionProvenance.scopedToNetworkId`, which were introduced in `@openzeppelin/ui-types@3.2.0`; a consumer pinned to `3.1.0` would not have these fields on the shared provenance contract. No runtime change for workspace builds (the lockfile already resolves ui-types 3.2.0, which satisfies both the old and new floors).

- [#50](https://github.com/OpenZeppelin/openzeppelin-adapters/pull/50) [`fd4f177`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/fd4f177c01c1a49ba3092daac1448afa94a26ccc) Thanks [@pasevin](https://github.com/pasevin)! - Raise every declared `viem` range floor to `^2.35.0` — the minimum version the official ENS v2 readiness guide requires. viem 2.35.0 is where the new DAO-owned Universal Resolver proxy (`0xeeee…eeee`) landed in the chain definitions; the old floors (`^2.28.0` peer, `^2.33.3` dependency) let a consumer-pinned viem resolve ENS names through the pre-v2 Universal Resolver, which breaks as ENS v2 rolls out. No runtime change for workspace builds (the lockfile already resolves viem 2.44.4, which satisfies the new floor).

- Updated dependencies [[`fd4f177`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/fd4f177c01c1a49ba3092daac1448afa94a26ccc), [`fd4f177`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/fd4f177c01c1a49ba3092daac1448afa94a26ccc), [`fd4f177`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/fd4f177c01c1a49ba3092daac1448afa94a26ccc)]:
  - @openzeppelin/adapter-runtime-utils@0.1.0

## 1.0.0

### Major Changes

- [#24](https://github.com/OpenZeppelin/openzeppelin-adapters/pull/24) [`8abc939`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/8abc939c45e3afd952c42f32be17a9680c6967b8) Thanks [@pasevin](https://github.com/pasevin)! - Add capability factories, runtime lifecycle helpers, and shared disposal infrastructure for the adapter-evm-core package.

## 1.1.2

### Patch Changes

- [#351](https://github.com/OpenZeppelin/ui-builder/pull/351) [`2e23c29`](https://github.com/OpenZeppelin/ui-builder/commit/2e23c29126942dc84be34d606fbdb03111e41dea) Thanks [@pasevin](https://github.com/pasevin)! - Update `@openzeppelin/ui-types` and `@openzeppelin/ui-components` dependency versions.

## 1.1.1

### Patch Changes

- [#349](https://github.com/OpenZeppelin/ui-builder/pull/349) [`8b423c7`](https://github.com/OpenZeppelin/ui-builder/commit/8b423c799314f3abf8677fd13906c2296c178255) Thanks [@pasevin](https://github.com/pasevin)! - Update `@openzeppelin/ui-types` and `@openzeppelin/ui-components` dependency versions.

## 1.1.0

### Minor Changes

- [#338](https://github.com/OpenZeppelin/ui-builder/pull/338) [`da33121`](https://github.com/OpenZeppelin/ui-builder/commit/da33121ba20f17d414e121b3cb28ad1b2988b28b) Thanks [@pasevin](https://github.com/pasevin)! - Add access control module for EVM-compatible contracts
  - Capability detection for Ownable, Ownable2Step, AccessControl, AccessControlEnumerable, and AccessControlDefaultAdminRules patterns via ABI analysis
  - On-chain reads for ownership state, admin state, role assignments, and role enumeration via viem public client
  - Transaction assembly for ownership transfer/accept/renounce, admin transfer/accept/cancel, admin delay change/rollback, and role grant/revoke/renounce as WriteContractParameters
  - GraphQL indexer client for historical event queries with filtering and pagination, role discovery, pending transfer queries, and grant timestamp enrichment
  - Input validation for EVM addresses and bytes32 role IDs
  - Full API parity with the Stellar adapter's AccessControlService (13 unified methods + EVM-specific extensions)
  - Graceful degradation when indexer is unavailable

- [#338](https://github.com/OpenZeppelin/ui-builder/pull/338) [`da33121`](https://github.com/OpenZeppelin/ui-builder/commit/da33121ba20f17d414e121b3cb28ad1b2988b28b) Thanks [@pasevin](https://github.com/pasevin)! - Add human-readable role labels for EVM access control
  - Well-known role dictionary (DEFAULT_ADMIN_ROLE, MINTER_ROLE, PAUSER_ROLE, BURNER_ROLE, UPGRADER_ROLE) with resolveRoleLabel()
  - ABI-based role constant extraction via findRoleConstantCandidates() and discoverRoleLabelsFromAbi()
  - addKnownRoleIds() accepts { id, label } pairs for externally-provided labels
  - roleLabelMap threaded through readCurrentRoles(), queryHistory(), and resolveRoleFromEvent()
  - Label resolution precedence: external > ABI-extracted > well-known > undefined

- [#338](https://github.com/OpenZeppelin/ui-builder/pull/338) [`da33121`](https://github.com/OpenZeppelin/ui-builder/commit/da33121ba20f17d414e121b3cb28ad1b2988b28b) Thanks [@pasevin](https://github.com/pasevin)! - Add chain-agnostic capability flags, expiration metadata, and admin delay info
  - Detect `hasRenounceOwnership`, `hasRenounceRole`, `hasCancelAdminTransfer`, `hasAdminDelayManagement` from ABI in feature-detection
  - Implement `getExpirationMetadata()` returning `mode: 'none'` for ownership and `mode: 'contract-managed'` for admin transfers
  - Populate `delayInfo` (current delay from `defaultAdminDelay()`) in `getAdminInfo()` response
