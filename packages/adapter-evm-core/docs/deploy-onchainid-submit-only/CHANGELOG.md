# Changelog — Deploy ONCHAINID Submit-Only

## [adapters 2.6.0-class] — unpublished (SF-2 Docs)

### Added

- `DeployOnchainIdOutcome` / `DeployOnchainIdConfirmedResult` /
  `DeployOnchainIdSubmittedResult` re-exported from `@openzeppelin/adapter-evm-core` (main,
  `./irs`, capabilities barrels); the types themselves are owned by
  `@openzeppelin/ui-types` >= 3.5.0.
- `deployOnchainId` → `Promise<DeployOnchainIdOutcome>` on the **shared**
  `IRSCapability` (ui-types >= 3.5.0), so `EvmIRSCapability extends IRSCapability` plainly and
  adds only the EVM-specific reads — no `Omit`, no adapter-side re-declaration, and
  `EvmIRSCapability` ↔ `IRSCapability` stay mutually assignable.
- Submit-only early return: `{ id, completion: 'submitted' }` with **no** `onchainId`;
  skips receipt wait, log parse, and operator MANAGEMENT assert.
- Confirmed arm additive discriminant: `{ id, onchainId, completion: 'confirmed' }` with
  required `onchainId`.

### Changed

- Confirmed-path deploy return is explicit (no spread of the executor result); behavior
  of wait → parse → assert remains byte-identical to pre-SF-2.
- Shared `IRSCapability.deployOnchainId` widened in ui-types 3.5.0 from
  `Promise<DeployOnchainIdResult>` to `Promise<DeployOnchainIdOutcome>`. Consumers typed only
  as `IRSCapability` now narrow on `completion` as well — previously they saw a confirmed-only
  shape while the adapter type widened separately.

### Unchanged

- ui-types `DeployOnchainIdResult.onchainId` remains required — it is now the confirmed arm's
  base rather than the whole return type. No `onchainId?:` on any shared shape.
- `grantHolderManagementKey` body — SF-3.
- Dual-source completion detection — SF-1.

### Migration Guide

1. **Confirmed-path callers** — runtime behavior is unchanged if you omit `completion` or pass
   `'confirmed'`. At the type level you must now narrow on `completion === 'confirmed'` before
   reading `onchainId`, since the return type is a union; code that destructured `onchainId`
   directly will not compile until the check is added. That is deliberate — it is what stops a
   submit-only deploy from silently yielding an undefined address.
2. **Submit-only callers** — set `transactionOptions.completion: 'submitted'` and/or
   strategy `result.completion`; import `DeployOnchainIdOutcome` from
   `@openzeppelin/adapter-evm-core` (or `@openzeppelin/ui-types`); narrow on
   `completion === 'submitted'`; resume via Relayer + `getFactoryIdentity` — never expect
   `onchainId` on the deploy return.
3. **Shared `IRSCapability` only** — same narrowing applies; ui-types >= 3.5.0 returns the
   union on the shared interface, so no adapter-specific type is needed for honest submit-only.
   `EvmIRSCapability` adds only the EVM-specific reads. Do **not** optionalize shared
   `onchainId`.
