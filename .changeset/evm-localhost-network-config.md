---
'@openzeppelin/adapter-evm': minor
---

Add `evmLocalhost`, a ready-made local development network config for Anvil, Hardhat or Foundry (chain 31337, default RPC URL).

It is exported from the `networks` entry and the package root, and is deliberately excluded from `evmNetworks`, `evmMainnetNetworks` and `evmTestnetNetworks`, so the wallet chain set, network catalog and ecosystem definition are unchanged for apps that don't import it. Wallet connect, chain switching and wallet-signed writes are not available on this network. Read-only calls go through its RPC URL, which you can override with `rpcEndpoints['evm-localhost']`. It uses the Ethereum icon and has no block explorer.
