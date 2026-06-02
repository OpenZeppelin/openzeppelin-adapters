/**
 * ERC-4626 (Tokenized Vault) Module.
 *
 * Exports the EVM vault capability: vendored ABI fragments, on-chain reader, write-action
 * assembly, revert→typed-error mapping, and the service + factory. The `createERC4626`
 * capability factory lives in `../capabilities/erc4626`.
 *
 * @module erc4626
 */

export * from './abi';
export * from './actions';
export * from './error-mapping';
export * from './onchain-reader';
export { createEvmErc4626Service, EvmErc4626Service } from './service';
export type { EvmErc4626Executor, EvmErc4626ServiceOptions } from './types';
