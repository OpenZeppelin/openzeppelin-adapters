# @openzeppelin/adapter-polkadot

## 4.0.2

### Patch Changes

- [#81](https://github.com/OpenZeppelin/openzeppelin-adapters/pull/81) [`4ba10ae`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/4ba10ae6b1f09c1aeca81e52b13427c8455ac9ca) Thanks [@pasevin](https://github.com/pasevin)! - Fix a white screen when switching the wallet UI kit to RainbowKit at runtime.

  `uiKitManager.configure()` clears `kitProviderComponent` and `isKitAssetsLoaded` and
  notifies listeners _before_ RainbowKit's dynamically imported provider and CSS
  resolve. `EvmWalletUiRoot` and `PolkadotWalletUiRoot` treated that state as "not
  RainbowKit" and fell through to rendering children unwrapped, so RainbowKit
  consumers — its `ConnectButton` — mounted outside `RainbowKitProvider` and threw:

  ```
  Uncaught Error: Transaction hooks must be used within RainbowKitProvider
  ```

  Because the manager always passes through that state on a kit change, this was
  deterministic rather than a rare race: any switch to RainbowKit while the app was
  running white-screened.

  Both roots now withhold children until the provider is ready, keeping
  `WagmiProvider` mounted so `reconnectOnMount` still fires exactly once on the real
  config.

## 4.0.1

### Patch Changes

- [#79](https://github.com/OpenZeppelin/openzeppelin-adapters/pull/79) [`d7f645e`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/d7f645e2f5294a434a23448cd6fc7b3d18d23429) Thanks [@pasevin](https://github.com/pasevin)! - Ship the AGPL-3.0 licence text inside each published package.

  The repository has a root `LICENSE`, but npm does not walk up to the repository root
  when packing, and these packages declare `files: ["dist", "src"]`. So every published
  tarball carried an AGPL-3.0 declaration in its `package.json` with no accompanying
  licence text — verified with `npm pack --dry-run`, which listed no `LICENSE` entry.

  Each published package now has its own copy, which npm includes automatically. The
  two private packages (`adapter-evm-core`, `adapter-runtime-utils`) are left alone
  since they are never packed and the repository root covers them.

## 3.0.0

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

## 2.2.0

### Patch Changes

- [#50](https://github.com/OpenZeppelin/openzeppelin-adapters/pull/50) [`fd4f177`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/fd4f177c01c1a49ba3092daac1448afa94a26ccc) Thanks [@pasevin](https://github.com/pasevin)! - Raise the `@openzeppelin/ui-types` range floor from `^3.1.0` to `^3.2.0`. The ENS v2 name-resolution work populates `ResolutionProvenance.external` and `ResolutionProvenance.scopedToNetworkId`, which were introduced in `@openzeppelin/ui-types@3.2.0`; a consumer pinned to `3.1.0` would not have these fields on the shared provenance contract. No runtime change for workspace builds (the lockfile already resolves ui-types 3.2.0, which satisfies both the old and new floors).

- [#50](https://github.com/OpenZeppelin/openzeppelin-adapters/pull/50) [`fd4f177`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/fd4f177c01c1a49ba3092daac1448afa94a26ccc) Thanks [@pasevin](https://github.com/pasevin)! - Raise every declared `viem` range floor to `^2.35.0` — the minimum version the official ENS v2 readiness guide requires. viem 2.35.0 is where the new DAO-owned Universal Resolver proxy (`0xeeee…eeee`) landed in the chain definitions; the old floors (`^2.28.0` peer, `^2.33.3` dependency) let a consumer-pinned viem resolve ENS names through the pre-v2 Universal Resolver, which breaks as ENS v2 rolls out. No runtime change for workspace builds (the lockfile already resolves viem 2.44.4, which satisfies the new floor).

## 2.1.1

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

## 2.1.0

### Patch Changes

- [#36](https://github.com/OpenZeppelin/openzeppelin-adapters/pull/36) [`2863f20`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/2863f20933c1c361815f987a9456f5a0bc04724a) Thanks [@pasevin](https://github.com/pasevin)! - Point Polkadot Hub mainnet access control indexer default to the Pasevin-hosted GraphQL endpoint.

## 2.0.2

### Patch Changes

- [#33](https://github.com/OpenZeppelin/openzeppelin-adapters/pull/33) [`40d0265`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/40d02656eccd57e47ea092f456239cdc1d0f83c9) Thanks [@pasevin](https://github.com/pasevin)! - Point default access control indexer URLs to Pasevin-hosted GraphQL endpoints for 21 synced networks (EVM mainnets/testnets, Polkadot hub/moonbase testnets, Stellar mainnet/testnet).

## 2.0.0

### Major Changes

- [#24](https://github.com/OpenZeppelin/openzeppelin-adapters/pull/24) [`15ba208`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/15ba208b3207771139f1f340ed943a04624efcc0) Thanks [@pasevin](https://github.com/pasevin)! - Migrate polkadot, solana, and midnight to `capabilities` and `createRuntime` on `ecosystemDefinition`.
  Remove monolithic adapter classes and `createAdapter` exports (Phase 10 / US8 follow-on adapters).

### Patch Changes

- [#27](https://github.com/OpenZeppelin/openzeppelin-adapters/pull/27) [`481f206`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/481f206b948a4099a8fee55c44128cca279dc2ba) Thanks [@pasevin](https://github.com/pasevin)! - Move internal workspace packages (`adapter-runtime-utils`, `adapter-evm-core`) from `dependencies`
  to `devDependencies` so they are not listed in the published package metadata. These packages are
  bundled at build time via `tsdown` `noExternal` and are never resolved from npm by consumers.

  Also add `adapter-evm-core` to `adapter-polkadot`'s `noExternal` list so it is correctly bundled
  into the built output rather than left as a bare external import.

- [#24](https://github.com/OpenZeppelin/openzeppelin-adapters/pull/24) [`c620934`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/c62093448eef452344dc26f320bca1e731c40cde) Thanks [@pasevin](https://github.com/pasevin)! - Allow adapter ui-kit configuration to accept partial overrides while preserving default
  initialization behavior. This keeps adapter releases aligned with the relaxed
  `UiKitCapability.configureUiKit` contract and adds regression coverage for empty and partial
  override merges.

## 1.1.0

### Minor Changes

- [#12](https://github.com/OpenZeppelin/openzeppelin-adapters/pull/12) [`fca08be`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/fca08bef5ebbe8f539087a93d9ccc7c0973720ec) Thanks [@pasevin](https://github.com/pasevin)! - Add runtime peer version validation that throws at module load if installed `@openzeppelin/ui-*` packages are below the adapter's minimum required versions. This replaces silent visual degradation with an immediate, actionable error message including the exact fix command.

### Patch Changes

- [#7](https://github.com/OpenZeppelin/openzeppelin-adapters/pull/7) [`7d91492`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/7d91492cb7d383b7fc4942cf25699dfc36689dab) Thanks [@pasevin](https://github.com/pasevin)! - Move shared host runtime packages to peer plus dev dependencies, switch adapter lodash usage to
  `lodash-es`, and validate the host dependency policy during builds to avoid duplicate runtime
  installs in consumer applications.

## 1.0.0

### Major Changes

- [`ec7fb58`](https://github.com/OpenZeppelin/openzeppelin-adapters/commit/ec7fb58c4b729da5e68eec8a093f4092a3d8f40e) Thanks [@pasevin](https://github.com/pasevin)! - Initial release baseline for extracted adapter packages under the `@openzeppelin/adapter-*` namespace.

## 1.8.3

### Patch Changes

- [#360](https://github.com/OpenZeppelin/ui-builder/pull/360) [`6a1dd1e`](https://github.com/OpenZeppelin/ui-builder/commit/6a1dd1ec39549cd05ea2415ca5b010b2169b913f) Thanks [@pasevin](https://github.com/pasevin)! - Rename user-facing network labels to "Polkadot" and "Polkadot Testnet" (from "Polkadot Hub" and "Polkadot Hub TestNet").

- [#364](https://github.com/OpenZeppelin/ui-builder/pull/364) [`e8d6f0c`](https://github.com/OpenZeppelin/ui-builder/commit/e8d6f0c63fbccadd6512214a41010622432f76df) Thanks [@pasevin](https://github.com/pasevin)! - Rename remaining Polkadot Hub explorer UI labels and guidance from Blockscout to Routescan.

## 1.8.2

### Patch Changes

- [#358](https://github.com/OpenZeppelin/ui-builder/pull/358) [`5eb64ea`](https://github.com/OpenZeppelin/ui-builder/commit/5eb64ea5738a60f7a2720cb508159067861ea200) Thanks [@pasevin](https://github.com/pasevin)! - Use public SubQuery access control endpoints in network definitions. Normalize EVM and Stellar adapter `accessControlIndexerUrl` (no trailing slash), fix Stellar testnet typo (openzepplin → openzeppelin), and add SubQuery indexer URLs to Polkadot adapter networks (polkadot-hub, moonbeam, moonriver, moonbase-alpha).

## 1.8.0

### Minor Changes

- [#351](https://github.com/OpenZeppelin/ui-builder/pull/351) [`2e23c29`](https://github.com/OpenZeppelin/ui-builder/commit/2e23c29126942dc84be34d606fbdb03111e41dea) Thanks [@pasevin](https://github.com/pasevin)! - Add `./networks` subpath export for lightweight network loading without pulling in full adapter runtime, wallet libraries, or SDK code. Update `@openzeppelin/ui-components` and `@openzeppelin/ui-types` dependency versions.

## 1.7.0

### Minor Changes

- [#349](https://github.com/OpenZeppelin/ui-builder/pull/349) [`8b423c7`](https://github.com/OpenZeppelin/ui-builder/commit/8b423c799314f3abf8677fd13906c2296c178255) Thanks [@pasevin](https://github.com/pasevin)! - Add `./networks` subpath export for lightweight network loading without pulling in full adapter runtime, wallet libraries, or SDK code. Update `@openzeppelin/ui-components` and `@openzeppelin/ui-types` dependency versions.

## 1.6.0

### Minor Changes

- [#338](https://github.com/OpenZeppelin/ui-builder/pull/338) [`da33121`](https://github.com/OpenZeppelin/ui-builder/commit/da33121ba20f17d414e121b3cb28ad1b2988b28b) Thanks [@pasevin](https://github.com/pasevin)! - Add access control service integration to Polkadot adapter
  - Implement `getAccessControlService()` with lazy initialization on PolkadotAdapter
  - Add access control indexer network service form for Polkadot EVM networks
  - Re-export access control types from the evm module

- [#338](https://github.com/OpenZeppelin/ui-builder/pull/338) [`da33121`](https://github.com/OpenZeppelin/ui-builder/commit/da33121ba20f17d414e121b3cb28ad1b2988b28b) Thanks [@pasevin](https://github.com/pasevin)! - Add self-describing ecosystem metadata to all adapters
  - Each adapter now exports `ecosystemMetadata` with display info
    (name, icon, description, styling classes, default feature config)
  - New `./metadata` subpath export for lightweight static imports
  - Adapters implement the `EcosystemExport` interface from ui-types

### Patch Changes

- [#338](https://github.com/OpenZeppelin/ui-builder/pull/338) [`da33121`](https://github.com/OpenZeppelin/ui-builder/commit/da33121ba20f17d414e121b3cb28ad1b2988b28b) Thanks [@pasevin](https://github.com/pasevin)! - Bump @openzeppelin/ui-types to ^1.8.0, ui-utils to ^1.2.1, and ui-components to ^1.2.1 across all adapters

- [#344](https://github.com/OpenZeppelin/ui-builder/pull/344) [`2b74cde`](https://github.com/OpenZeppelin/ui-builder/commit/2b74cde53d603fc9c3e857140b56bc35e4cea819) Thanks [@pasevin](https://github.com/pasevin)! - fix(adapter): resolve type declarations for internal evm-core package

  Add `dts.resolve` for `adapter-evm-core` in tsup configs so type declarations
  are bundled alongside runtime JS. This fixes exported apps failing to compile
  because `.d.ts` files referenced the unpublished `adapter-evm-core` package.

  Also cleans up the type hierarchy: `TypedPolkadotNetworkConfig` now extends
  `PolkadotNetworkConfig` from `@openzeppelin/ui-types` directly (with narrowed
  `viemChain` typing), eliminating its type-level dependency on `adapter-evm-core`.
  `TypedEvmNetworkConfig` similarly extends `EvmNetworkConfig` directly.

- [#343](https://github.com/OpenZeppelin/ui-builder/pull/343) [`000c6ed`](https://github.com/OpenZeppelin/ui-builder/commit/000c6ed5a1ab5dd042040e4594c8c268ba81e231) Thanks [@pasevin](https://github.com/pasevin)! - Re-export adapter classes (EvmAdapter, StellarAdapter, PolkadotAdapter) from package entry points. These exports were accidentally removed during the ecosystemDefinition refactor in #338, breaking exported app builds that import adapter classes directly.

- [#338](https://github.com/OpenZeppelin/ui-builder/pull/338) [`da33121`](https://github.com/OpenZeppelin/ui-builder/commit/da33121ba20f17d414e121b3cb28ad1b2988b28b) Thanks [@pasevin](https://github.com/pasevin)! - Gate access-control-indexer service form behind feature flag
  - Tag access-control-indexer network service forms with `requiredFeature: 'access_control_indexer'`
  - Apply `filterEnabledServiceForms` in health check hook to skip disabled services

## 1.5.0

### Patch Changes

- [#336](https://github.com/OpenZeppelin/ui-builder/pull/336) [`4641bba`](https://github.com/OpenZeppelin/ui-builder/commit/4641bba5c57fd2e5db7fc8ccfe2afd79f80382e5) Thanks [@LuisUrrutia](https://github.com/LuisUrrutia)! - Bump `@openzeppelin/relayer-sdk` from 1.4.0 to 1.9.0, resolving two high-severity transitive vulnerabilities (bigint-buffer buffer overflow, h3 request smuggling).

## 1.4.2

### Patch Changes

- [#331](https://github.com/OpenZeppelin/ui-builder/pull/331) [`2016925`](https://github.com/OpenZeppelin/ui-builder/commit/2016925667b8c52b1912c45101685c878d90a025) Thanks [@pasevin](https://github.com/pasevin)! - Fix EVM bytes type mapping to use BytesField with proper validation. bytes32 and other fixed-size bytes types now use the 'bytes' field type with exactBytes metadata for proper hex validation.

  This fix is in the internal adapter-evm-core package which is bundled into adapter-evm and adapter-polkadot.

## 1.4.1

### Patch Changes

- [#328](https://github.com/OpenZeppelin/ui-builder/pull/328) [`fe9bc16`](https://github.com/OpenZeppelin/ui-builder/commit/fe9bc16111c1a5a5c519c6dde34bd604dfafdce2) Thanks [@pasevin](https://github.com/pasevin)! - Fix broken dependency on private package adapter-evm-core

  Moves `@openzeppelin/adapter-evm-core` from `dependencies` to `devDependencies`. Since the core package is bundled at build time via tsup's `noExternal` config, it should not appear as a runtime dependency in published packages.

## 1.4.0

### Minor Changes

- [#322](https://github.com/OpenZeppelin/ui-builder/pull/322) [`1b5496e`](https://github.com/OpenZeppelin/ui-builder/commit/1b5496e4d2ed2ba9ae8c7e206d65ee87be9eb3ec) Thanks [@pasevin](https://github.com/pasevin)! - Add `getDefaultServiceConfig` method to all adapters for proactive network service health checks

  This new required method enables the UI to proactively test network service connectivity (RPC, indexers, explorers) when a network is selected, displaying user-friendly error banners before users attempt operations that would fail.

  **New method: `getDefaultServiceConfig(serviceId: string): Record<string, unknown> | null`**

  Returns the default configuration values for a network service, extracted from the network config. This allows health check functionality without requiring user configuration.

  Implementation per adapter:
  - **EVM**: Returns `rpcUrl` for 'rpc' service, `explorerUrl` for 'explorer' service
  - **Stellar**: Returns `sorobanRpcUrl` for 'rpc' service, `indexerUri`/`indexerWsUri` for 'indexer' service
  - **Solana**: Returns `rpcEndpoint` for 'rpc' service
  - **Polkadot**: Returns `rpcUrl` for 'rpc' service, `explorerUrl` for 'explorer' service
  - **Midnight**: Returns `httpUrl`/`wsUrl` (from `indexerUri`/`indexerWsUri`) for 'indexer' service

- [#313](https://github.com/OpenZeppelin/ui-builder/pull/313) [`d53274e`](https://github.com/OpenZeppelin/ui-builder/commit/d53274e5ec3db4c7ab33c3b1316bc1c5890f4f23) Thanks [@pasevin](https://github.com/pasevin)! - feat: Add Polkadot ecosystem adapter with EVM support

  Introduces the Polkadot adapter enabling building UIs for EVM-compatible smart contracts
  deployed on Polkadot ecosystem networks.

  **Supported Networks:**

  Hub Networks (P1 - MVP):
  - Polkadot Hub (Chain ID: 420420419)
  - Kusama Hub (Chain ID: 420420418)
  - Polkadot Hub TestNet (Chain ID: 420420417)

  Parachain Networks (P2):
  - Moonbeam (Chain ID: 1284)
  - Moonriver (Chain ID: 1285)
  - Moonbase Alpha (Chain ID: 1287)

  **Features:**
  - Full EVM contract interaction (load, query, sign & broadcast)
  - Wallet integration via RainbowKit and Wagmi
  - Support for both Blockscout (Hub) and Moonscan (Moonbeam) explorers
  - Extensible architecture for future Substrate/Wasm support

  The adapter leverages shared EVM functionality from `adapter-evm-core` for code reuse.
