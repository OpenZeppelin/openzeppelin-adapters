---
"@openzeppelin/adapter-evm-core": patch
"@openzeppelin/adapter-evm": patch
"@openzeppelin/adapter-polkadot": patch
---

Raise every declared `viem` range floor to `^2.35.0` — the minimum version the official ENS v2 readiness guide requires. viem 2.35.0 is where the new DAO-owned Universal Resolver proxy (`0xeeee…eeee`) landed in the chain definitions; the old floors (`^2.28.0` peer, `^2.33.3` dependency) let a consumer-pinned viem resolve ENS names through the pre-v2 Universal Resolver, which breaks as ENS v2 rolls out. No runtime change for workspace builds (the lockfile already resolves viem 2.44.4, which satisfies the new floor).
