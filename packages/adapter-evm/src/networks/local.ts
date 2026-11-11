import { foundry as viemFoundry } from 'viem/chains';

import type { TypedEvmNetworkConfig } from '@openzeppelin/adapter-evm-core';

/**
 * Local development node (Anvil / Hardhat / Foundry, chain 31337).
 *
 * Opt-in only: import it directly and pass it to your app. It is deliberately NOT part of
 * `evmMainnetNetworks`, `evmTestnetNetworks` or `evmNetworks`, because those lists feed the
 * wallet (wagmi) chain set, the network catalog and the ecosystem definition. Adding it there
 * would change every consumer. Consequence: wallet connect, chain switching and wallet-signed
 * writes are not available on this network; read-only calls work through the RPC URL.
 *
 * Has no block explorer. Override the RPC (e.g. a non-default port) via `rpcEndpoints['evm-localhost']`.
 */
export const evmLocalhost: TypedEvmNetworkConfig = {
  id: 'evm-localhost',
  exportConstName: 'evmLocalhost',
  name: 'Localhost (31337)',
  ecosystem: 'evm',
  network: 'localhost',
  type: 'testnet',
  isTestnet: true,
  chainId: viemFoundry.id,
  rpcUrl: viemFoundry.rpcUrls.default.http[0],
  nativeCurrency: {
    name: viemFoundry.nativeCurrency.name,
    symbol: viemFoundry.nativeCurrency.symbol,
    decimals: viemFoundry.nativeCurrency.decimals,
  },
  viemChain: viemFoundry,
};
