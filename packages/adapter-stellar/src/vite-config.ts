/**
 * Stellar Adapter: Vite Configuration Export
 *
 * This module exports Vite configuration fragments for the Stellar adapter.
 * Consumers inherit these requirements through `@openzeppelin/adapters-vite`.
 *
 * See: docs/ADAPTER_ARCHITECTURE.md § "Build-Time Requirements"
 */

import { createRequire } from 'node:module';
import type { UserConfig } from 'vite';

const require = createRequire(import.meta.url);
const STELLAR_SDK_NODE_ENTRY = require.resolve('@stellar/stellar-sdk');

/**
 * Returns the Vite configuration required for Stellar adapter compatibility
 *
 * @returns Vite configuration object to be merged with your main vite.config
 *
 * @example
 * ```typescript
 * // vite.config.ts
 * import { getStellarViteConfig } from '@openzeppelin/adapter-stellar/vite-config';
 *
 * export default defineConfig(({ mode }) => {
 *   const stellarConfig = getStellarViteConfig();
 *
 *   return {
 *     plugins: [
 *       react(),
 *       ...stellarConfig.plugins,
 *     ],
 *     resolve: {
 *       dedupe: [
 *         ...stellarConfig.resolve.dedupe,
 *       ],
 *     },
 *   };
 * });
 * ```
 */
export function getStellarViteConfig(): UserConfig {
  return {
    // Currently no Stellar-specific plugins required
    plugins: [],

    resolve: {
      alias: {
        // Avoid the SDK browser UMD bundle so Vite can prebundle the Node entry
        // and preserve named imports used throughout the adapter.
        '@stellar/stellar-sdk': STELLAR_SDK_NODE_ENTRY,
      },
      // Module Deduplication
      // Ensure singleton instances of shared dependencies
      dedupe: [
        // Stellar-specific dependencies that may need deduplication
        '@stellar/stellar-sdk',
        '@creit.tech/stellar-wallets-kit',
      ],
    },

    optimizeDeps: {
      // Force pre-bundling of CommonJS/browser-compat dependencies used behind the
      // Stellar adapter so Vite serves ESM wrappers during dev instead of raw CJS.
      include: [
        '@stellar/stellar-sdk',
        '@creit.tech/stellar-wallets-kit',
        '@stellar/freighter-api',
        'buffer',
      ],
      exclude: [],
    },
  };
}
