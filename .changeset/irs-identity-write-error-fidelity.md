---
'@openzeppelin/adapter-evm-core': minor
'@openzeppelin/adapter-evm': minor
---

Report already-onboarded IRS identity writes faithfully, before submitting.

`grantHolderManagementKey` and `deployOnchainId` now probe on-chain state **before** assembling
or executing anything, and when that probe proves the work is already complete they throw
`IdentityAlreadyRegistered` (`code: 'ALREADY_ONBOARDED'`) without submitting a transaction:

- `grantHolderManagementKey` reads the ERC-734 MANAGEMENT key purpose. `has` → throw; the holder
  already has the key, so submitting `addKey` again would spend gas to no effect.
- `deployOnchainId` reads the identity factory. `found` → throw, carrying the existing
  `onchainId`; deploying again would strand a second identity.

Previously these surfaced as a generic post-submit failure — or worse, appeared to succeed —
after a redundant write. A saga can now branch on `ALREADY_ONBOARDED` and resume instead of
treating an idempotent no-op as a hard failure.

**Ambiguity stays ambiguous.** When the probe itself fails (RPC/transport `read_failed`), the
write is refused with the generic `IdentityOperationFailed` (`code: 'IRS_OPERATION_FAILED'`) and
still does not submit. A failed read is not evidence of _any_ state, so it is never reported as
already-onboarded, and never assumed to be `lacks` / `not_found` either. Likewise a confirmed
write that times out remains `IdentityOperationFailed` and INDETERMINATE — it may still land, so
it is never re-labelled already-onboarded.

**No new error codes.** Both codes already exist in `@openzeppelin/ui-types`; this only changes
which one you get, and when. Handlers matching on `err.code` keep working.

**Success semantics are unchanged.** Every previously-successful call still succeeds with the
same resolved shape, on both the confirmed and submit-only paths — including submit-only, where
the pre-submit probe runs but the post-submit assert stays skipped. The other IRS writes are
deliberately untouched: `registerIdentity` keeps its existing already-registered throw,
`registerTrustedIssuer` keeps returning its idempotent no-op sentinel rather than throwing, and
`attachClaim` gains no invented claim-exists path.

**Migration.** If you previously caught a generic failure to detect an already-onboarded holder,
match `err.code === 'ALREADY_ONBOARDED'` instead, and treat `IRS_OPERATION_FAILED` from these two
methods as "state unknown, do not retry blind". Callers that never hit the already-complete case
need no changes.

Each arm is locked by `src/irs/__tests__/irs.error-fidelity.test.ts`, whose already-onboarded and
read-failed cases are non-vacuous: each first proves the pre-fix behaviour RED (generic error
and/or a submitted transaction) before asserting the typed error with no submission.
