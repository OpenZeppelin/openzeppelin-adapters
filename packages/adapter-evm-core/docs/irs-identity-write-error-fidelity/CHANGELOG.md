# Changelog — IRS Identity Write Error Fidelity (SF-5)

Unreleased documentation / behavior notes for the adapters **MINOR 2.6.0-class**
error-fidelity work. Neither adapters nor ui-types are published as part of this
Docs stage. No `reference-implementations` edits.

## [Unreleased] — 2026-08-06

### Added

- **Pre-submit fidelity on `grantHolderManagementKey`:** successful key-purpose
  `has` MANAGEMENT → throw reused `IdentityAlreadyRegistered`
  (`ALREADY_ONBOARDED`) before `execute` (both completion modes).
- **Pre-submit fidelity on `deployOnchainId`:** successful factory `found` → same
  `IdentityAlreadyRegistered` throw before `execute` (both completion modes).
- **`read_failed` no-submit arms** on grant/deploy: throw
  `IdentityOperationFailed` (ambiguous) — never invent already-onboarded or
  lacks / not_found.
- NON-VACUITY suite `irs.error-fidelity.test.ts` (Tests stage).
- Package docs under `docs/irs-identity-write-error-fidelity/` (this tree).

### Changed

- **Public error surface (behavioral MINOR):** grant and deploy now throw
  `IdentityAlreadyRegistered` on recognisable already-complete conditions where
  they previously collapsed to generic `IRS_OPERATION_FAILED` (or risked a
  doomed submit). Method signatures unchanged.
- **Plan drift vs SF-3 docs wording:** submit-only still skips **post-submit**
  assert; pre-submit key-purpose / factory probes **do** run (fidelity first).

### Unchanged

- `registerIdentity` already-onboarded throw (non-regression precedent).
- `registerTrustedIssuer` already-trusted noop **success**.
- `attachClaim` leave-generic (no claim-exists MECHANISM).
- Confirmed-path **success** shapes when probes allow the write (SC-009).
- SF-1…SF-4 completion semantics after fall-through.
- Typed `indeterminate` / mined-but-verify-timed-out — still **OUT** (Residual Risk).

### Migration Guide

1. Catch `IdentityAlreadyRegistered` / `code === 'ALREADY_ONBOARDED'` on
   **grant** and **deploy** re-drives (same class consumers already use for
   register).
2. Keep treating `IdentityOperationFailed` as ambiguous or real failure — do not
   map `read_failed` messages to conflict/finished.
3. Do not expect a new error code or typed indeterminate subclass in this MINOR.
4. Trusted-issuer already-trusted remains success — do not convert consumer
   handling to expect a throw.
5. Consumer pin bumps under `reference-implementations` remain **out of scope**
   (dev-owned). Do not publish until explicitly instructed.
