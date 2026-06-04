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
export * from './onchain-reader';
export { createEvmIRSService, EvmIRSService } from './service';
export type { EvmIRSAddresses, EvmIRSExecutor, EvmIRSServiceOptions } from './types';
