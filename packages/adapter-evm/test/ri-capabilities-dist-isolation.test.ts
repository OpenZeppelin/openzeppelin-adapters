// @vitest-environment node
/**
 * Headless capability sub-path isolation, measured on the BUILT entries (SC-003, FR-020).
 *
 * This is the build-dependent counterpart to `ri-capabilities-subpath-isolation.test.ts`.
 * That test is deliberately build-free and walks TypeScript sources; it therefore cannot
 * observe chunk assignment, which is where this guarantee actually broke once:
 *
 *   `src/capabilities/{erc3643,irs,...}.ts` re-exported through the
 *   `@openzeppelin/adapter-evm-core` package barrel instead of the per-capability
 *   sub-path. The barrel resolves to core's `dist/index.mjs`, which statically imports
 *   every core chunk including the wallet one, so rolldown merged the barrel facade and
 *   the wallet graph into a single ~356 kB chunk that every adapter entry imported. Each
 *   source graph stayed clean and the source-level suite stayed green, while the built
 *   `dist/erc3643.mjs` reached React, wagmi, RainbowKit and
 *   `import('@rainbow-me/rainbowkit/styles.css')` — which makes the sub-path impossible to
 *   esbuild-bundle with `platform: 'node'` (no CSS loader, no DOM runtime).
 *
 * SC-003 requires "import-graph analysis of the built sub-path entries". This test is that
 * analysis: it walks the emitted `.mjs` chunk graph of each headless capability entry and
 * fails if it reaches a React/wagmi/RainbowKit runtime or any `.css` import.
 *
 * Requires a prior `pnpm build`. CI always builds before testing (`ci.yml`, `publish.yml`),
 * and a missing `dist/` fails loudly rather than skipping — a guard that can silently no-op
 * is the same class of hole this test exists to close.
 */
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  adapterDistEntry,
  findMatchingSpecifiers,
  FORBIDDEN_DIST_RUNTIME_PATTERNS,
  walkDistGraph,
} from '../../../tests/helpers/riCapabilityGraph';

/**
 * Sub-paths that must stay consumable from a plain Node/server bundler.
 *
 * Deliberate exclusions:
 * - `network-catalog`, `networks`, `metadata` — reach `@web3icons/react` (React peer) for
 *   network icons. They bundle for Node, but are not React-free, so they are out of scope
 *   for this contract and tracked separately.
 * - `execution`, `relayer` — genuinely wallet-coupled: `src/capabilities/execution.ts`
 *   injects `getEvmWalletImplementation`, which reaches the wagmi implementation.
 * - `wallet`, `ui-kit`, the profiles and the root entry — browser surfaces by design.
 */
const HEADLESS_CAPABILITY_SUBPATHS = [
  'addressing',
  'explorer',
  'ui-labels',
  'contract-loading',
  'schema',
  'type-mapping',
  'query',
  'access-control',
  'erc3643',
  'erc4626',
  'irs',
] as const;

describe('headless capability sub-path isolation in built output (SC-003)', () => {
  for (const subPath of HEADLESS_CAPABILITY_SUBPATHS) {
    it(`dist/${subPath}.mjs graph carries no React/wagmi/RainbowKit/CSS`, () => {
      const entry = adapterDistEntry(subPath);
      expect(
        existsSync(entry),
        `${entry} is missing — run \`pnpm build\` before this suite (CI builds first).`
      ).toBe(true);

      const { bareSpecifiers } = walkDistGraph(entry);
      const offenders = findMatchingSpecifiers(bareSpecifiers, FORBIDDEN_DIST_RUNTIME_PATTERNS);

      expect(
        offenders,
        `built ${subPath} sub-path reaches browser-only runtime: ${offenders.join(', ')}. ` +
          `Most likely a capability entry re-exports through the '@openzeppelin/adapter-evm-core' ` +
          `barrel instead of '@openzeppelin/adapter-evm-core/${subPath}', which merges the wallet ` +
          `chunk into the shared chunk this entry imports.`
      ).toEqual([]);
    });
  }
});
