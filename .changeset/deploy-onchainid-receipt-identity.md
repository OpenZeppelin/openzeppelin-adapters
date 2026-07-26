---
'@openzeppelin/adapter-evm': patch
---

Resolve `deployOnchainId` identity from the confirmed factory receipt (`WalletLinked` / `Deployed`) instead of a follow-up `getIdentity` eth_call that could miss even after confirmation. `getIdentityFromFactory` now distinguishes `not_found` from `read_failed` instead of collapsing RPC errors into `undefined`.
