---
"@openzeppelin/adapter-evm": patch
"@openzeppelin/adapter-midnight": patch
"@openzeppelin/adapter-polkadot": patch
"@openzeppelin/adapter-solana": patch
"@openzeppelin/adapter-stellar": patch
"@openzeppelin/adapters-vite": patch
---

chore(deps): resolve remaining Dependabot security alerts for transitive dependencies

Update the workspace `pnpm` overrides so vulnerable transitive dependencies resolve to patched versions:

- `protobufjs` &rarr; `^7.6.3` (was pinned to `^7.5.8`, still allowed `7.6.x` advisories)
- `hono` &rarr; `^4.12.25` (was `^4.12.21`)
- `ws` &rarr; `^8.21.0` for the v8 line and `^7.5.11` for the v7 line
- `form-data` &rarr; `^4.0.6` (CRLF injection)
- `ua-parser-js` &rarr; `^2.0.10` (ReDoS)
- `js-yaml` (v4) &rarr; `^4.2.0` (quadratic-complexity DoS)
- `uuid` &rarr; `^11.1.1` (missing buffer bounds check)
- `@babel/core` &rarr; `^7.29.6` (arbitrary file read via `sourceMappingURL`)

`elliptic` (`<= 6.6.1`) has no published fix and remains; it is a low-severity advisory with no upstream patch available.

These overrides only affect dependency resolution within this monorepo's lockfile and do not change the published packages' declared dependency ranges.
