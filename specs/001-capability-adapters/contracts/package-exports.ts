/**
 * Package Export Contract
 *
 * Defines the sub-path export structure that each adapter package must expose.
 * This is the contract between adapter packages and consumers — each sub-path
 * is a separate tsdown entry point ensuring physical tier isolation.
 *
 * This file is a DESIGN ARTIFACT, not production code.
 */

/**
 * package.json "exports" structure for @openzeppelin/adapter-evm
 * (and similarly for @openzeppelin/adapter-stellar)
 *
 * Each sub-path maps to a separate tsdown entry producing isolated bundles.
 * Tier 1 exports MUST NOT include any Tier 2/3 code in their import graph.
 */
const packageExports = {
  // --- Existing entry points (preserved) ---
  '.': './dist/index.mjs',
  './metadata': './dist/metadata.mjs',
  './networks': './dist/networks.mjs',
  './vite-config': './dist/vite-config.mjs',

  // --- Tier 1: Lightweight / Declarative ---
  './addressing': './dist/capabilities/addressing.mjs',
  './explorer': './dist/capabilities/explorer.mjs',
  './network-catalog': './dist/capabilities/network-catalog.mjs',
  './ui-labels': './dist/capabilities/ui-labels.mjs',

  // --- Tier 2: Schema / Definition ---
  './contract-loading': './dist/capabilities/contract-loading.mjs',
  './schema': './dist/capabilities/schema.mjs',
  './type-mapping': './dist/capabilities/type-mapping.mjs',
  './query': './dist/capabilities/query.mjs',

  // --- Tier 3: Runtime / Stateful ---
  './execution': './dist/capabilities/execution.mjs',
  './wallet': './dist/capabilities/wallet.mjs',
  './ui-kit': './dist/capabilities/ui-kit.mjs',
  './relayer': './dist/capabilities/relayer.mjs',
  './access-control': './dist/capabilities/access-control.mjs',

  // --- Profiles ---
  './profiles/declarative': './dist/profiles/declarative.mjs',
  './profiles/viewer': './dist/profiles/viewer.mjs',
  './profiles/transactor': './dist/profiles/transactor.mjs',
  './profiles/composer': './dist/profiles/composer.mjs',
  './profiles/operator': './dist/profiles/operator.mjs',
};

/**
 * Each export entry above follows this structure in the actual package.json:
 *
 * "./addressing": {
 *   "types": {
 *     "import": "./dist/capabilities/addressing.d.mts",
 *     "require": "./dist/capabilities/addressing.d.cts"
 *   },
 *   "import": "./dist/capabilities/addressing.mjs",
 *   "require": "./dist/capabilities/addressing.cjs"
 * }
 */

/**
 * tsdown.config.ts entry array for adapter-evm-core:
 *
 * entry: [
 *   'src/index.ts',
 *   'src/vite-config.ts',
 *   // Capabilities
 *   'src/capabilities/addressing.ts',
 *   'src/capabilities/explorer.ts',
 *   'src/capabilities/network-catalog.ts',
 *   'src/capabilities/ui-labels.ts',
 *   'src/capabilities/contract-loading.ts',
 *   'src/capabilities/schema.ts',
 *   'src/capabilities/type-mapping.ts',
 *   'src/capabilities/query.ts',
 *   'src/capabilities/execution.ts',
 *   'src/capabilities/wallet.ts',
 *   'src/capabilities/ui-kit.ts',
 *   'src/capabilities/relayer.ts',
 *   'src/capabilities/access-control.ts',
 *   // Profiles
 *   'src/profiles/declarative.ts',
 *   'src/profiles/viewer.ts',
 *   'src/profiles/transactor.ts',
 *   'src/profiles/composer.ts',
 *   'src/profiles/operator.ts',
 * ]
 */

export default packageExports;
