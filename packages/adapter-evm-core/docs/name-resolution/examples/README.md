# Examples — ENS Name Resolution (forward SF-2 · reverse SF-3 · ENS v2 SF-5 · L1 reverse SF-1)

Copy-paste-adaptable examples for the EVM name-resolution capability.

| Example | What it shows |
|---------|---------------|
| [`forward-resolve/`](./forward-resolve) | End-to-end name → address against a real viem mainnet client: feature-detect, sync `isValidName` pre-check, async `resolveName`, and the error-code switch. |
| [`reverse-resolve/`](./reverse-resolve) | End-to-end address → verified name (+ avatar) against a real viem mainnet client: feature-detect, async `resolveAddress`, and the error-code switch. Highlights the always-verified name and the best-effort, untrusted avatar. |
| [`reverse-miss-fallback/`](./reverse-miss-fallback) | **003** mocked Sepolia bound-empty → L1: opt-in, fallback triplet, scope gate. |
| [`ens-v2-resolve/`](./ens-v2-resolve) | ENS v2 against a real viem mainnet client: narrowing the result's `provenance` with `isEnsProvenance`, reading the **observed** `external` (CCIP-Read traversal) and `coinType`, and — with the optional `ensL1Client` wired — L1 cross-chain resolution carrying `scopedToNetworkId`. |

For registration into a runtime and the mocked-client test pattern, see the
[Integration Guide](../integration-guide.md).

> These examples cover all four delivered slices: forward (SF-2), reverse + avatar (SF-3), ENS v2
> (SF-5), and 003 mainnet-L1 opt-in miss-fallback (SF-3 reverse + SF-4 forward).
