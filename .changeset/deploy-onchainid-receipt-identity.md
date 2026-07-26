---
'@openzeppelin/adapter-evm': patch
---

Resolve `deployOnchainId` identity from the confirmed factory receipt (`WalletLinked` / `Deployed`) instead of a follow-up `getIdentity` eth_call that could miss even after confirmation.

`deployOnchainId` now **waits** for the receipt (`waitForTransactionReceipt`) rather than doing a point-in-time read, so the path genuinely gates on confirmation instead of assuming the injected executor already established it. The wait is bounded by a confirmations count and a timeout, tunable via the new `deployReceiptWait` service option (defaults: 1 confirmation, 120s).

Three terminal outcomes are now distinguished, because they carry opposite retry semantics:

- **confirmed + identity parsed** — success.
- **confirmed + reverted** — explicit revert error; nothing was created, so a retry is safe.
- **wait timed out** — reported as `INDETERMINATE`; the transaction may still land, so the error states plainly that it must not be treated as failed and must not be retried blind (a re-attempted `createIdentity` reverts with `wallet already linked to an identity`, which orphans the holder permanently).

`getIdentityFromFactory` now distinguishes `not_found` from `read_failed` instead of collapsing RPC errors into `undefined`.
