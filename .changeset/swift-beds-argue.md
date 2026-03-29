---
'@openzeppelin/adapters-vite': patch
---

Tighten the public `loadOpenZeppelinAdapterViteConfig` return type so consumers
can rely on concrete arrays for merged adapter config fields without adding
defensive defaults in each app.
