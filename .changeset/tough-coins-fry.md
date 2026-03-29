---
'@openzeppelin/adapters-vite': patch
---

Fix Vite compatibility for relayer-backed adapters by aliasing `@openzeppelin/relayer-sdk`
to its ESM build and preserving app-level alias overrides when configs are merged.
