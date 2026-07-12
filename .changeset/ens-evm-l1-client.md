---
"@openzeppelin/adapter-evm": minor
---

Wire the ENS name-resolution capability into the EVM runtime profiles, injecting the L1 public client the capability requires (the `nameResolution` factory plus the optional `ensL1Client` for ENS v2 cross-chain resolution).

Hardening: the L1 mainnet ENS RPC (for the ENS v2 cross-chain path) resolves via user → override → viem-default keyed on the mainnet id, so operators can supply a keyed endpoint; no secret is hardcoded.
