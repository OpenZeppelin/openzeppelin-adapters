import type { Chain } from 'viem';

import type { EvmNetworkConfig } from '@openzeppelin/ui-types';

/**
 * Network configuration types for EVM-compatible networks
 */

/**
 * Base interface for any EVM-compatible network configuration.
 * This allows core functions to work with both EVM and Polkadot (and future) adapters.
 * The ecosystem field is generic to allow strict typing while maintaining flexibility.
 *
 * @typeParam E - The ecosystem type, defaults to `string` for maximum flexibility.
 *                Adapters can use specific string literals (e.g., `'polkadot'`) for stricter typing.
 *
 * @remarks
 * Core functions don't actually use the `ecosystem` field at runtime - they rely on
 * `chainId`, `rpcUrl`, and other EVM-compatible fields. This type relaxation eliminates
 * the need for adapter wrapper functions that only exist to convert types.
 *
 * @example
 * ```typescript
 * // Flexible usage (defaults to string)
 * function processConfig(config: EvmCompatibleNetworkConfig) { ... }
 *
 * // Strict typing for specific adapters
 * type PolkadotConfig = EvmCompatibleNetworkConfig<'polkadot'>;
 * ```
 */
export interface EvmCompatibleNetworkConfig<E extends string = string> extends Omit<
  EvmNetworkConfig,
  'ecosystem'
> {
  /**
   * Ecosystem identifier. Generic type parameter allows strict typing while
   * maintaining flexibility. Defaults to `string` so core functions can accept
   * configs from any EVM-compatible adapter (EVM, Polkadot, etc.).
   */
  ecosystem: E;

  /**
   * Viem Chain object for this EVM network.
   * If provided, this will be used directly by Viem clients.
   * If not provided, a fallback chain object will be created.
   */
  viemChain?: Chain;
}

/**
 * EVM-specific network configuration with strict `ecosystem: 'evm'` constraint
 * and strongly-typed viem `Chain` (narrowed from `unknown` in `EvmNetworkConfig`).
 *
 * Use this type in EVM-only contexts where you want strict ecosystem typing.
 * For function signatures that should accept configs from multiple adapters
 * (EVM, Polkadot, etc.), use `EvmCompatibleNetworkConfig` instead.
 */
export interface TypedEvmNetworkConfig extends EvmNetworkConfig {
  viemChain?: Chain;
}

/**
 * The subset of an EVM network configuration that the explorer path reads:
 * identity, ecosystem, explorer URLs, and explorer-API selection fields.
 * It has no RPC or chain-connection fields.
 *
 * Any full `EvmNetworkConfig` / `TypedEvmNetworkConfig` satisfies it, so existing
 * callers are unaffected. Use it to build explorer links in apps that must not
 * ship an RPC URL.
 *
 * Defined as a `Pick` so optionality and field docs follow `EvmNetworkConfig`
 * and cannot drift from it. Adding a key here widens what the explorer path may
 * read; the core explorer helpers take this type, so reading a key outside it
 * fails to compile.
 *
 * @typeParam E - Ecosystem literal. Defaults to `'evm'`, the only ecosystem
 *   `createExplorer` accepts. The core URL helpers use
 *   `EvmExplorerNetworkConfig<string>` so EVM-compatible adapters (Polkadot)
 *   can keep passing their configs.
 *
 * @example
 * ```typescript
 * const explorerOnly: EvmExplorerNetworkConfig = {
 *   ecosystem: 'evm',
 *   id: 'ethereum-mainnet',
 *   name: 'Ethereum Mainnet',
 *   explorerUrl: 'https://etherscan.io',
 * };
 * ```
 */
export type EvmExplorerNetworkConfig<E extends string = 'evm'> = Pick<
  EvmCompatibleNetworkConfig<E>,
  | 'id' // required: user explorer-override lookup key
  | 'name' // required: resolved explorer name and log lines
  | 'ecosystem' // required: EVM guard
  | 'explorerUrl' // optional: absent means links resolve to null
  | 'apiUrl' // optional: carried into the resolved explorer config
  | 'primaryExplorerApiIdentifier' // optional: app/global API-key lookup
  | 'supportsEtherscanV2' // optional: Etherscan V2 global-key path selection
>;
