---
'@openzeppelin/adapters-vite': patch
---

Fix the default Vitest adapter export alias order so `metadata` and `networks`
subpath imports resolve before the broader package root alias.
