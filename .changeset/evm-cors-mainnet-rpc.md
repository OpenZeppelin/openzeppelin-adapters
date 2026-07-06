---
"@openzeppelin/adapter-evm": patch
---

Switch the default `ethereum-mainnet` RPC to a keyless, CORS-friendly public endpoint (`https://ethereum-rpc.publicnode.com`) instead of relying on viem's default mainnet transport, which is not a dependable browser default (CORS). Verified live (`eth_chainId` → `0x1`) with a browser preflight returning `access-control-allow-origin: *` and `POST` allowed. This default also serves as the last-resort fallback for the ENS v2 L1 cross-chain path (`resolveMainnetRpcUrl`), so both browser mainnet resolution and cross-chain ENS get a CORS-safe default. No behavior change for consumers that supply their own RPC via user config or app-config override.
