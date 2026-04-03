---
"@openzeppelin/adapter-evm": patch
"@openzeppelin/adapter-polkadot": patch
"@openzeppelin/adapter-stellar": patch
---

Allow adapter ui-kit configuration to accept partial overrides while preserving default
initialization behavior. This keeps adapter releases aligned with the relaxed
`UiKitCapability.configureUiKit` contract and adds regression coverage for empty and partial
override merges.
