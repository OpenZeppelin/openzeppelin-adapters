/**
 * Completion-keyed deploy results for {@link EvmIRSService.deployOnchainId}.
 *
 * These shapes are **owned by `@openzeppelin/ui-types`** (>= 3.5.0) and re-exported here so
 * existing `@openzeppelin/adapter-evm-core` import paths keep working. The MECHANISM is
 * unchanged: the submit-only arm has no `onchainId` property, while the confirmed arm keeps
 * `onchainId` required — a single shared type with `onchainId?:` is never shipped.
 *
 * Previously this module declared the union locally and `EvmIRSCapability` had to `Omit` the
 * shared `deployOnchainId` to widen it. As of ui-types 3.5.0 `IRSCapability.deployOnchainId`
 * returns the union directly, so the local declaration would duplicate a shared type
 * (constitution principle V) and the `Omit` is gone.
 *
 * @module irs/deploy-result
 */

export type {
  DeployOnchainIdConfirmedResult,
  DeployOnchainIdOutcome,
  DeployOnchainIdSubmittedResult,
} from '@openzeppelin/ui-types';
