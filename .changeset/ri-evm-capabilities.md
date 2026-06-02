---
'@openzeppelin/adapter-evm': minor
---

Add RI tokenized-deposits EVM capabilities (`erc3643`, `erc4626`, `irs`) as sub-path exports for server-side consumption. Implementations live in `@openzeppelin/adapter-evm-core` (bundled internally) with injected `signAndBroadcast` write paths, mocked test coverage, and tier-isolation conformance.

**Pinned vendored ABI sources (FR-017a)**

| Capability | Source | Pinned version |
|------------|--------|----------------|
| ERC-3643 (T-REX) | github.com/ERC-3643/ERC-3643 | `@tokenysolutions/t-rex@4.1.6` |
| ERC-4626 | github.com/OpenZeppelin/openzeppelin-contracts (`IERC4626.sol`) | `@openzeppelin/contracts@5.6.1` (EIP-4626 Final) |
| IRS / ONCHAINID | github.com/ERC-3643/ERC-3643 + github.com/onchain-id/solidity | `@tokenysolutions/t-rex@4.1.6`, `@onchain-id/solidity@2.2.1` |

Requires `@openzeppelin/ui-types` with the RI capability interfaces published first (FR-022).
