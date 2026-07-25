---
'@openzeppelin/adapter-evm': patch
---

Make the headless capability sub-paths bundleable for `platform: 'node'`.

`erc3643`, `irs`, `erc4626`, `query`, `schema`, `type-mapping`, `contract-loading` and `access-control` re-exported through the `@openzeppelin/adapter-evm-core` package barrel rather than the per-capability sub-path. The barrel resolves to core's `dist/index.mjs`, which statically imports every core chunk including the wallet one, so rolldown merged the barrel facade and the wallet graph into a single ~356 kB chunk that each of those entries imported. The built sub-paths therefore reached React, wagmi, RainbowKit and `import('@rainbow-me/rainbowkit/styles.css')`, which made them impossible to esbuild-bundle for Node — a server-side consumer such as the OpenZeppelin Relayer plugin loader (`platform: 'node'`, `bundle: true`, no CSS loader) failed outright.

Each entry now re-exports from `@openzeppelin/adapter-evm-core/<capability>`, matching the convention `addressing`, `explorer`, `network-catalog` and `ui-labels` already followed. The eight sub-paths now bundle for Node with zero React/wagmi/RainbowKit/CSS in their graphs; `dist/erc3643.mjs`'s chunk closure drops from 397 kB to 46 kB and `dist/irs.mjs` from 397 kB to 36 kB.

No API change. Browser consumers are unaffected apart from finer chunk splitting (+0.5 kB gzipped on the root + `networks` + `metadata` entry set); the `wallet`, `ui-kit`, `vite-config`, `networks` and `metadata` surfaces are behaviourally unchanged and the RainbowKit stylesheet import still ships with the wallet entries.

Also adds a build-dependent guard (`test/ri-capabilities-dist-isolation.test.ts`) that walks the emitted chunk graph of each headless sub-path, satisfying SC-003's requirement for import-graph analysis of the _built_ entries. The pre-existing source-level suite could not observe chunk assignment, which is why this defect shipped green.
