---
"@openzeppelin/adapter-evm-core": minor
---

Add Option B miss-fallback reverse resolution on non-mainnet-bound EVM adapters: bound reverse first when ENS is supported; on definitive empty only, consult the gated mainnet L1 client for the default primary name (+ avatar). L1 hits carry `EnsProvenance` with absent `scopedToNetworkId` (global/mainnet identity); non-mainnet bound-local hits now set `scopedToNetworkId` to the bound network id so chain-agnostic consumers can distinguish network-local from global scope. Bound gateway/transport failures never fall through to L1.
