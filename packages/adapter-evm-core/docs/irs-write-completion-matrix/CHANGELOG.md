# Changelog — IRS Write-Completion Matrix (SF-4)

Unreleased documentation / behavior notes for the adapters **MINOR 2.6.0-class**
write-completion work. Neither adapters nor ui-types are published as part of
this Docs stage.

## [Unreleased] — 2026-08-06

### Added

- **IRS write-completion matrix** (`irs.write-completion-matrix.test.ts`):
  NON-VACUOUS op×mode lock across `deployOnchainId`, `grantHolderManagementKey`,
  `attachClaim`, `registerIdentity`, and `registerTrustedIssuer` (audit).
- **Built-package proof** (`sf-4-write-completion-pack.test.ts` + helpers):
  `npm pack --dry-run` inventory + packed `dist/` markers C-1..C-4 + workspace
  parity + C-5 non-vacuous pack gate on `@openzeppelin/adapter-evm`.
- Package docs under `docs/irs-write-completion-matrix/` (this tree).

### Changed

- **`attachClaim` / `registerIdentity` / `registerTrustedIssuer` (execute path):**
  public returns are exact `{ id: result.id }` (grant-style strip of SF-1 excess
  fields such as `completion`). Noop trusted-issuer path unchanged.
- **`attachClaim`:** implemented as `async` with throw-on-missing-issuer (same
  public `Promise<OperationResult>` contract).

### Migration Guide

1. If you only used the typed `OperationResult` (`{ id }`), no change.
2. If untyped code branched on `result.completion` after attach / register /
   trusted-issuer execute, remove that branch — the field is no longer present.
   Prefer:
   - SF-1 options / strategy `result.completion` for intent, or
   - SF-2 `DeployOnchainIdOutcome` discriminant for deploy.
3. Do not treat strip as a new submit-only early-return on passthrough ops —
   those ops were already prompt; SF-4 proves they stay that way.
4. Consumer pin bumps under `reference-implementations` remain **out of scope**
   (dev-owned). Do not publish until explicitly instructed.
