# @openzeppelin/adapter-evm-core

## 2.0.0

### Major Changes

- [#74](https://github.com/OpenZeppelin/openzeppelin-adapters/pull/74) [`368ebfb`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/368ebfbb10e69c4dd223c6f2c576ac83cbbffd2a) Thanks [@pasevin](https://github.com/pasevin)! - Remove WalletConnect support entirely.

  `@wagmi/connectors` hard-depends on `@walletconnect/ethereum-provider`, which pulls
  in `@reown/appkit`. Reown moved AppKit to the Reown Community License at 1.8.3 —
  commercial fees above 500 monthly active users, a clause making it a material
  condition that all use connect to Reown's gateway, and a confidentiality clause.

  Pinning was the alternative and it is a dead end: every non-deprecated
  `@walletconnect/ethereum-provider` release pins a community-licensed AppKit, and
  every release still pinning Apache-2.0 AppKit 1.7.8 is deprecated on npm. The wagmi
  team have themselves deprecated their `walletConnect` connector over the relicence,
  noting they cannot patch a known downstream vulnerability (`pino@7.11.0`) because
  of it.

  ## Breaking changes

  The WalletConnect configuration surface is removed outright, not deprecated:
  - `WagmiWalletConfig.walletConnectProjectId` — removed. Passing it is now a type
    error.
  - `createEvmWalletImplementation(walletConnectProjectId?, initialUiKitConfig?)` —
    the first parameter is gone. The signature is now
    `createEvmWalletImplementation(initialUiKitConfig?)`. **Positional callers must
    drop the first argument.**
  - `new PolkadotWalletImplementation(walletConnectProjectId?)` — the parameter is
    gone; the constructor now takes no arguments.
  - The Stellar wallets-kit config generator no longer reads or emits
    `walletConnectProjectId`.
  - `globalServiceConfigs.walletconnect.projectId` is no longer read from app config.
    The key is inert; remove it from your `app.config.json`.

  Default wagmi configs now register `injected`, `metaMask` and `safe`. Users who
  relied on WalletConnect must use one of those instead.

  ## Other changes
  - `@walletconnect/modal` dropped from the EVM and Polkadot exported-app dependency
    lists, and WalletConnect dropped from the EVM Vite `optimizeDeps` list.
  - The Stellar generator's wallet-list docblock now reflects the eight modules
    `allowAllModules()` actually registers, which also removes a stale Trezor mention
    that was propagating into consumer bundles.
  - `.pnpmfile.cjs` strips `@walletconnect/ethereum-provider` from
    `@wagmi/connectors` and `@walletconnect/modal` plus `sign-client` from the
    Stellar kit, so the packages leave the install tree entirely: `@reown/*` and
    `@walletconnect/*` both go to zero lockfile entries.

  ## RainbowKit wallet list

  Removing our own connector was not sufficient. RainbowKit's default wallet list is
  largely WalletConnect-backed, so its modal still offered entries that would open a
  WalletConnect session — and with the provider stripped from the install tree those
  entries would throw when clicked.

  RainbowKit cannot be made WalletConnect-free by omission: `getDefaultConfig` types
  `projectId` as required, and its main entry statically ships
  `getWalletConnectConnector` and `walletConnectWallet`. So the wallet list is pinned:
  - **`wallets` now defaults to `injectedWallet` + `safeWallet`.** `injectedWallet`
    covers every EIP-1193 browser extension (MetaMask, Rabby, Coinbase extension,
    Brave); `safeWallet` covers the Safe app context. A caller-supplied
    `kitConfig.wagmiParams.wallets` still wins.
  - **`projectId` is no longer requested.** `createRainbowKitWagmiConfig` previously
    returned `null` when it was missing; it now passes a fixed placeholder to satisfy
    RainbowKit's required field. The generated exported-app config emits the same and
    no longer points users at cloud.walletconnect.com.

  Users lose the WalletConnect-backed entries in the RainbowKit modal — Rainbow,
  Coinbase mobile, Trust, and the WalletConnect QR option itself.

## 1.5.0

### Minor Changes

- [#70](https://github.com/OpenZeppelin/openzeppelin-adapters/pull/70) [`0c55a07`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/0c55a071e8ab4c326b01697ed7ac727d2c8b695f) Thanks [@pasevin](https://github.com/pasevin)! - Report already-onboarded IRS identity writes faithfully, before submitting.

  `grantHolderManagementKey` and `deployOnchainId` now probe on-chain state **before** assembling
  or executing anything, and when that probe proves the work is already complete they throw
  `IdentityAlreadyRegistered` (`code: 'ALREADY_ONBOARDED'`) without submitting a transaction:
  - `grantHolderManagementKey` reads the ERC-734 MANAGEMENT key purpose. `has` → throw; the holder
    already has the key, so submitting `addKey` again would spend gas to no effect.
  - `deployOnchainId` reads the identity factory. `found` → throw, carrying the existing
    `onchainId`; deploying again would strand a second identity.

  Previously these surfaced as a generic post-submit failure — or worse, appeared to succeed —
  after a redundant write. A saga can now branch on `ALREADY_ONBOARDED` and resume instead of
  treating an idempotent no-op as a hard failure.

  **Ambiguity stays ambiguous.** When the probe itself fails (RPC/transport `read_failed`), the
  write is refused with the generic `IdentityOperationFailed` (`code: 'IRS_OPERATION_FAILED'`) and
  still does not submit. A failed read is not evidence of _any_ state, so it is never reported as
  already-onboarded, and never assumed to be `lacks` / `not_found` either. Likewise a confirmed
  write that times out remains `IdentityOperationFailed` and INDETERMINATE — it may still land, so
  it is never re-labelled already-onboarded.

  **No new error codes.** Both codes already exist in `@openzeppelin/ui-types`; this only changes
  which one you get, and when. Handlers matching on `err.code` keep working.

  **Success semantics are unchanged.** Every previously-successful call still succeeds with the
  same resolved shape, on both the confirmed and submit-only paths — including submit-only, where
  the pre-submit probe runs but the post-submit assert stays skipped. The other IRS writes are
  deliberately untouched: `registerIdentity` keeps its existing already-registered throw,
  `registerTrustedIssuer` keeps returning its idempotent no-op sentinel rather than throwing, and
  `attachClaim` gains no invented claim-exists path.

  **Migration.** If you previously caught a generic failure to detect an already-onboarded holder,
  match `err.code === 'ALREADY_ONBOARDED'` instead, and treat `IRS_OPERATION_FAILED` from these two
  methods as "state unknown, do not retry blind". Callers that never hit the already-complete case
  need no changes.

  Each arm is locked by `src/irs/__tests__/irs.error-fidelity.test.ts`, whose already-onboarded and
  read-failed cases are non-vacuous: each first proves the pre-fix behaviour RED (generic error
  and/or a submitted transaction) before asserting the typed error with no submission.

## 1.4.0

### Minor Changes

- [#68](https://github.com/OpenZeppelin/openzeppelin-adapters/pull/68) [`cac12a1`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/cac12a1751e336ba3fb096f97f9e935079f0f397) Thanks [@pasevin](https://github.com/pasevin)! - Add submit-only write completion for IRS / ONCHAINID writes, so a relayer-backed onboarding saga
  can resolve at submission time and resume later instead of blocking on confirmation.

  Requires `@openzeppelin/ui-types` >= 3.5.0 (the `WriteCompletion` vocabulary and the
  `DeployOnchainIdOutcome` union are owned there); the peer range is bumped accordingly.

  **Opting in.** Set `completion` on the relayer execution config — absent ≡ `'confirmed'`, so
  existing callers are unaffected at runtime:

  ```ts
  const outcome = await irs.deployOnchainId(
    { holder },
    {
      method: 'relayer',
      serviceUrl,
      relayer,
      transactionOptions: { completion: 'submitted' },
    }
  );
  ```

  On a submit-only write the resolved `id` prefers the relayer submission id (`relayerTxId`) over
  the not-yet-meaningful tx hash; the confirmed path still resolves the mined tx hash.

  **New exports** from `@openzeppelin/adapter-evm-core` (and its `capabilities` / `irs` sub-paths):
  `DeployOnchainIdOutcome`, `DeployOnchainIdConfirmedResult` and `DeployOnchainIdSubmittedResult`,
  re-exported from `@openzeppelin/ui-types`.

  That is the whole of the added public surface. The completion machinery itself —
  `resolveWriteCompletion`, `readOptionsCompletion`, `parseSignAndBroadcastResult`,
  `preferSubmissionId`, `WriteCompletionDisagreementError`, `WriteExecutionResult`,
  `SignAndBroadcastResultMeta` — stays **internal** and is deliberately not re-exported from the
  package root or any sub-path. It is wired for you inside `createIRS` / `adaptSignAndBroadcast`,
  so opting in needs only `transactionOptions.completion` and, for deploys, narrowing on the
  returned discriminant. Consumers observe the disagreement failure through the thrown error's
  `code === 'WRITE_COMPLETION_DISAGREEMENT'` rather than by importing the error class.

  ### Migration: `deployOnchainId` returns a union

  `IRSCapability.deployOnchainId` / `EvmIRSCapability.deployOnchainId` now resolve to
  `DeployOnchainIdOutcome`. The submit-only arm has **no `onchainId` property at all** — not an
  optional one — because the address does not exist until the deployment is mined. Narrow on
  `completion` before reading it:

  ```ts
  const outcome = await irs.deployOnchainId({ holder }, executionConfig);
  if (outcome.completion === 'confirmed') {
    use(outcome.onchainId);
  } else {
    // persist outcome.id; resolve the address on resume via getFactoryIdentity / getOnchainId
  }
  ```

  Code that destructured `onchainId` directly keeps working at runtime on the confirmed path but
  will not compile until the narrowing is added. That is deliberate: it is what stops a submit-only
  deploy from silently yielding an undefined address.

  ### Migration: executor return-type widening

  `EvmIRSExecutor` (exported) is now an alias of the shared `CapabilityExecutor` (also exported),
  widening its resolved value from `{ id }` to `{ id, completion }`. The result interface itself is
  internal and not importable, so declare the shape inline or rely on `EvmIRSExecutor` /
  `CapabilityExecutor` to supply it. This only affects callers that **implement** an executor and
  pass it to `createEvmIRSService` directly — the supported `createIRS({ signAndBroadcast })` entry
  point is unchanged, and adapting `signAndBroadcast` is handled internally.

  If you supply your own executor, add the discriminant:

  ```ts
  // Before
  const executor: EvmIRSExecutor = async (txData, config) => ({ id: await submit(txData, config) });

  // After — 'confirmed' preserves the previous semantics
  const executor: EvmIRSExecutor = async (txData, config) => ({
    id: await submit(txData, config),
    completion: 'confirmed',
  });
  ```

  Consumers only reading `.id` off a write result are unaffected: the widened result structurally
  extends `OperationResult`, so `{ id }` access keeps compiling.

  ### Unchanged on purpose

  ERC-3643 and ERC-4626 writes keep their existing result contracts (`{ id }` /
  `VaultDepositResult` / `VaultWithdrawResult`). They share the executor, so they inherit the same
  id-preference rule internally, but they deliberately do **not** re-export the `completion`
  discriminant — submit-only resume semantics were specified for the IRS saga only, and widening
  those results would add product surface no consumer requested.

  When `transactionOptions.completion` and the strategy's `result.completion` disagree, the write
  fails closed rather than guessing. It rejects with an error whose `code` is
  `WRITE_COMPLETION_DISAGREEMENT` and whose `name` is `WriteCompletionDisagreementError`; match on
  `code` rather than importing the class, which stays internal. The error carries `txHash` /
  `relayerTxId` so the already-submitted transaction remains identifiable, and it is never wrapped
  as an IRS-domain `IdentityOperationFailed`.

## 1.3.0

### Minor Changes

- [#55](https://github.com/OpenZeppelin/openzeppelin-adapters/pull/55) [`83941c1`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/83941c11544dcafa1f67cf2a8d22b4397388e90b) Thanks [@pasevin](https://github.com/pasevin)! - Opt-in mainnet-L1 miss-fallback for forward+reverse ENS resolution (definitive-miss only, never-silent) with cross-network provenance triplet; requires @openzeppelin/ui-types ^3.3.0.

## 1.2.0

### Minor Changes

- [#53](https://github.com/OpenZeppelin/openzeppelin-adapters/pull/53) [`d75eb46`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/d75eb4674f2f4bfa6e6425db258c3df1f63e6c36) Thanks [@pasevin](https://github.com/pasevin)! - Add Option B miss-fallback reverse resolution on non-mainnet-bound EVM adapters: bound reverse first when ENS is supported; on definitive empty only, consult the gated mainnet L1 client for the default primary name (+ avatar). L1 hits carry `EnsProvenance` with absent `scopedToNetworkId` (global/mainnet identity); non-mainnet bound-local hits now set `scopedToNetworkId` to the bound network id so chain-agnostic consumers can distinguish network-local from global scope. Bound gateway/transport failures never fall through to L1.

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
