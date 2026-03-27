---
'@openzeppelin/adapter-evm': minor
'@openzeppelin/adapter-midnight': minor
'@openzeppelin/adapter-polkadot': minor
'@openzeppelin/adapter-solana': minor
'@openzeppelin/adapter-stellar': minor
---

Add runtime peer version validation that throws at module load if installed `@openzeppelin/ui-*` packages are below the adapter's minimum required versions. This replaces silent visual degradation with an immediate, actionable error message including the exact fix command.
