---
"@openzeppelin/adapter-evm": patch
---

Use AddressDisplay in AccountDisplay for tooltip and copy support

Replace the plain truncated address `<span>` in AccountDisplay with the
upstream `AddressDisplay` component, enabling:
- Full-address tooltip on hover
- Copy-to-clipboard button on hover
- Inline variant (no chip background) to match existing layout

Bump `@openzeppelin/ui-components` peer/dev dependency to `^1.6.0`.
