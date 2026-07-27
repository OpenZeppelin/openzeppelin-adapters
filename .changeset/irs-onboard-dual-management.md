---
'@openzeppelin/adapter-evm': minor
---

Deploy ONCHAINID identities with operator MANAGEMENT so the onboarding saga can complete.

`deployOnchainId` now calls IdFactory `createIdentityWithManagementKeys` instead of `createIdentity`, granting MANAGEMENT to a configured operator key while wallet-linking the holder. Every future identity's key layout changes: the holder is linked but does not self-manage until `grantHolderManagementKey` runs.

**Consumer-visible behaviour change (new required construction input).** `createIRS` now requires `operatorManagementKey` — the EOA that will execute `attachClaim` in the saga. It must be explicit; do not infer it from the transaction signer, because the IdFactory `onlyOwner` caller may be a relayer contract. Missing or malformed values throw `InvalidOperatorManagementKeyError` at construction (same discipline as `InvalidDeployReceiptWaitError`).

**New write: `grantHolderManagementKey`.** Submits `addKey(holder, MANAGEMENT)` on the deployed identity. Consumers must call it after `deployOnchainId` and before `attachClaim` — that ordering is load-bearing for partial-failure resilience (holder can rescue their identity if a later step fails).

**Saga order:** `deployOnchainId` → `grantHolderManagementKey` → `attachClaim` → `registerIdentity`.

Pass `operatorManagementKey` at `createIRS` construction with the saga operator's EOA address (the same address that signs `attachClaim` transactions).
