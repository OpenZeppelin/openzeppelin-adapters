# Changelog — Deploy ONCHAINID Submit-Only

## [adapters 2.6.0-class] — unpublished (SF-2 Docs)

### Added

- `DeployOnchainIdOutcome` / `DeployOnchainIdConfirmedResult` /
  `DeployOnchainIdSubmittedResult` in `@openzeppelin/adapter-evm-core` (main, `./irs`,
  capabilities barrels).
- `EvmIRSCapability.deployOnchainId` → `Promise<DeployOnchainIdOutcome>` via
  `Omit<IRSCapability, 'deployOnchainId'>`.
- Submit-only early return: `{ id, completion: 'submitted' }` with **no** `onchainId`;
  skips receipt wait, log parse, and operator MANAGEMENT assert.
- Confirmed arm additive discriminant: `{ id, onchainId, completion: 'confirmed' }` with
  required `onchainId`.

### Changed

- Confirmed-path deploy return is explicit (no spread of `WriteExecutionResult`); behavior
  of wait → parse → assert remains byte-identical to pre-SF-2.

### Unchanged

- ui-types `DeployOnchainIdResult.onchainId` remains required (no surgical widen).
- `grantHolderManagementKey` body — SF-3.
- Dual-source completion detection — SF-1.

### Migration Guide

1. **Confirmed-path callers** — no required changes if you omit `completion` or pass
   `'confirmed'`. Optionally narrow on `completion === 'confirmed'` before reading
   `onchainId`, or ignore the additive field.
2. **Submit-only callers** — set `transactionOptions.completion: 'submitted'` and/or
   strategy `result.completion`; import `DeployOnchainIdOutcome` from
   `@openzeppelin/adapter-evm-core`; narrow on `completion === 'submitted'`; resume via
   Relayer + `getFactoryIdentity` — never expect `onchainId` on the deploy return.
3. **Shared `IRSCapability` only** — still sees confirmed-only types (**CONVENTION** gap).
   Prefer `EvmIRSCapability` for honest submit-only narrowing. Do **not** optionalize
   shared `onchainId`.
