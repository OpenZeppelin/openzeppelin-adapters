---
'@openzeppelin/adapter-evm': patch
'@openzeppelin/adapter-midnight': patch
'@openzeppelin/adapter-polkadot': patch
'@openzeppelin/adapter-solana': patch
'@openzeppelin/adapter-stellar': patch
'@openzeppelin/adapters-vite': patch
---

Ship the AGPL-3.0 licence text inside each published package.

The repository has a root `LICENSE`, but npm does not walk up to the repository root
when packing, and these packages declare `files: ["dist", "src"]`. So every published
tarball carried an AGPL-3.0 declaration in its `package.json` with no accompanying
licence text — verified with `npm pack --dry-run`, which listed no `LICENSE` entry.

Each published package now has its own copy, which npm includes automatically. The
two private packages (`adapter-evm-core`, `adapter-runtime-utils`) are left alone
since they are never packed and the repository root covers them.
