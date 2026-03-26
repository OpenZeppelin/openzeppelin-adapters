---
'@openzeppelin/adapter-evm': patch
'@openzeppelin/adapter-midnight': patch
'@openzeppelin/adapter-stellar': patch
---

Use AddressDisplay in AccountDisplay for tooltip and copy support

Replace the plain truncated address `<span>` in AccountDisplay with the
upstream `AddressDisplay` component across EVM, Midnight, and Stellar
adapters, enabling:

- Full-address tooltip on hover
- Copy-to-clipboard button on hover
- Inline variant (no chip background) to match existing layout

Polkadot already inherits the fix via `adapter-evm-core`.

Bump `@openzeppelin/ui-components` peer/dev dependency to `^1.6.0`.
