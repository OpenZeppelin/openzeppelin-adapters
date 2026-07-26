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

**Consumer-visible behaviour change (previously-accepted input now throws).** `deployReceiptWait` bounds are validated when the IRS capability is constructed, and `createIRS` throws `InvalidDeployReceiptWaitError` for a bound that cannot keep the wait bounded: `confirmations` must be an integer `>= 1`, and `timeoutMs` a finite integer `> 0`. Previously `0`, negatives, non-integers, `NaN` and `Infinity` were passed straight through to viem, where `timeout: 0` disables the timeout entirely (an unbounded wait) and `Infinity`/`NaN` collapse to ~1 ms (an immediate spurious timeout). Note `confirmations: 0` is rejected rather than clamped because viem short-circuits on `confirmations <= 1`, making it identical to `1` — so no capability is lost. Callers passing only valid bounds, or omitting the option, are unaffected.
