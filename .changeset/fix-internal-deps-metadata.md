---
"@openzeppelin/adapter-evm": patch
"@openzeppelin/adapter-polkadot": patch
"@openzeppelin/adapter-stellar": patch
"@openzeppelin/adapter-solana": patch
"@openzeppelin/adapter-midnight": patch
---

Move internal workspace packages (`adapter-runtime-utils`, `adapter-evm-core`) from `dependencies`
to `devDependencies` so they are not listed in the published package metadata. These packages are
bundled at build time via `tsdown` `noExternal` and are never resolved from npm by consumers.

Also add `adapter-evm-core` to `adapter-polkadot`'s `noExternal` list so it is correctly bundled
into the built output rather than left as a bare external import.
