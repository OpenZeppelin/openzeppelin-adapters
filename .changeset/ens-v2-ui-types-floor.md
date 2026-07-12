---
"@openzeppelin/adapter-evm-core": patch
"@openzeppelin/adapter-evm": patch
"@openzeppelin/adapter-polkadot": patch
"@openzeppelin/adapter-solana": patch
"@openzeppelin/adapter-runtime-utils": patch
"@openzeppelin/adapter-stellar": patch
"@openzeppelin/adapter-midnight": patch
---

Raise the `@openzeppelin/ui-types` range floor from `^3.1.0` to `^3.2.0`. The ENS v2 name-resolution work populates `ResolutionProvenance.external` and `ResolutionProvenance.scopedToNetworkId`, which were introduced in `@openzeppelin/ui-types@3.2.0`; a consumer pinned to `3.1.0` would not have these fields on the shared provenance contract. No runtime change for workspace builds (the lockfile already resolves ui-types 3.2.0, which satisfies both the old and new floors).
