/**
 * IRS / ONCHAINID Module.
 *
 * Exports the EVM Identity Registry Storage capability: on-chain reader, write-action
 * assembly, the pure key-free claim-payload builder, and the service + factory. The
 * `createIRS` capability factory lives in `../capabilities/irs`.
 *
 * @module irs
 */

export * from './abis';
export * from './actions';
export * from './claim-payload';
export type {
  DeployOnchainIdConfirmedResult,
  DeployOnchainIdOutcome,
  DeployOnchainIdSubmittedResult,
} from './deploy-result';
export * from './identity-keys';
export * from './management-key';
export * from './onchain-reader';
export * from './receipt-identity';
export { createEvmIRSService, EvmIRSService } from './service';
export type { EvmIRSAddresses, EvmIRSExecutor, EvmIRSServiceOptions } from './types';
