---
'@openzeppelin/adapter-evm-core': minor
'@openzeppelin/adapter-evm': minor
---

Add `EvmExplorerNetworkConfig`, an explorer-only network config type, and accept it in `createExplorer`.

The type holds only the fields the explorer path reads (`ecosystem`, `id`, `name`, `explorerUrl`, `apiUrl`, `primaryExplorerApiIdentifier`, `supportsEtherscanV2`), so browser apps can build explorer links without an RPC URL or a placeholder `rpcUrl: ''`. It is exported from both package roots and both `/explorer` entries. `createExplorer` still accepts every config it accepted before, produces the same links, and rejects non-EVM configs with the same error. `resolveExplorerConfig`, `getEvmExplorerAddressUrl` and `getEvmExplorerTxUrl` in `@openzeppelin/adapter-evm-core` now accept the narrower type too.
