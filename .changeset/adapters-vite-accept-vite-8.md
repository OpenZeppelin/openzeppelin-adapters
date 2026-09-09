---
'@openzeppelin/adapters-vite': minor
---

Accept Vite 8 alongside Vite 7 in the `vite` peer range.

Every published version from 8.0.0 through 12.0.0 declared `vite: ^7.0.0`, so no release of
this package installed against Vite 8 without an unmet peer.

The package has no runtime coupling to Vite at all. Its only runtime imports are `node:module`,
`node:fs` and `node:path`; Vite appears solely as `import type { Plugin, PluginOption, UserConfig }`
in `config.ts`, `integration.ts`, `registry.ts`, `resolver.ts` and `types.ts`. All three types
still exist in Vite 8, and the workspace already builds and type-checks against `vite@8.0.5`.

The peer is now `^7.0.0 || ^8.0.0`. Vite 7 consumers are unaffected.
