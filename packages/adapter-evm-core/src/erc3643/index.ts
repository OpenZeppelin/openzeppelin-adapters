/**
 * ERC-3643 (T-REX) Module.
 *
 * Exports the EVM permissioned-token capability: vendored ABI fragments, on-chain reader,
 * write-action assembly, revert→typed-error mapping, and the service + factory. The
 * `createERC3643` capability factory lives in `../capabilities/erc3643`.
 *
 * @module erc3643
 */

export * from './abi';
export * from './actions';
export * from './error-mapping';
export * from './onchain-reader';
export { createEvmErc3643Service, EvmErc3643Service } from './service';
export type { EvmErc3643Executor, EvmErc3643ServiceOptions } from './types';
