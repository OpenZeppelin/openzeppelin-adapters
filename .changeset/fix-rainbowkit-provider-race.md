---
'@openzeppelin/adapter-evm': patch
'@openzeppelin/adapter-polkadot': patch
---

Fix a white screen when switching the wallet UI kit to RainbowKit at runtime.

`uiKitManager.configure()` clears `kitProviderComponent` and `isKitAssetsLoaded` and
notifies listeners *before* RainbowKit's dynamically imported provider and CSS
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
