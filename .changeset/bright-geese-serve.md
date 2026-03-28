---
'@openzeppelin/adapters-vite': minor
---

Add a shared Vite and Vitest integration package for OpenZeppelin adapters.

The new `@openzeppelin/adapters-vite` package centralizes loading adapter
`./vite-config` exports, merging build-time requirements, and resolving adapter
package entry points for Vitest. Documentation now treats the adapters repo as
the source of truth for adapter architecture and build-time integration.
