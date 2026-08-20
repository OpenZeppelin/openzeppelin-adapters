---
'@openzeppelin/adapter-evm-core': major
'@openzeppelin/adapter-evm': major
'@openzeppelin/adapter-polkadot': major
'@openzeppelin/adapter-stellar': major
---

Remove WalletConnect support entirely.

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
