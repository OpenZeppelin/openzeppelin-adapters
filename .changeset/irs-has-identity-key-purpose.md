---
'@openzeppelin/adapter-evm': minor
---

Add `hasIdentityKeyPurpose` IRS read for onboarding saga resume.

Consumers can probe whether an address holds a given ERC-734 key purpose on an ONCHAINID without a KV side-ledger. The read returns `{ status: 'has' }`, `{ status: 'lacks' }`, or `{ status: 'read_failed', cause }` — transport failures are distinct from an on-chain false so resume logic does not re-attempt `grantHolderManagementKey` when the grant already landed.

Use `IDENTITY_KEY_PURPOSE_MANAGEMENT` (exported from `@openzeppelin/adapter-evm-core`) for the management-key probe.
