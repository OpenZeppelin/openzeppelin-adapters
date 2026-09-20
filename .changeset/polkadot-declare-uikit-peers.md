---
'@openzeppelin/adapter-polkadot': major
---

Declare the UIKit peers required by the inlined EVM wallet UI.

**Why**

`@openzeppelin/adapter-polkadot` bundles `@openzeppelin/adapter-evm-core`, whose wallet UI
leaves imports from `@openzeppelin/ui-components` and `@openzeppelin/ui-react` external.
Neither package was declared as a runtime peer, so strict package managers could not resolve the
published adapter unless the application happened to hoist a compatible UIKit installation.

**What changed**

| peer | before | after |
| --- | --- | --- |
| `@openzeppelin/ui-components` | not declared | `^3.9.0` |
| `@openzeppelin/ui-react` | not declared | `^3.3.2` |
| `@openzeppelin/ui-types` | `^3.5.2` | `^3.5.2` |
| `@openzeppelin/ui-utils` | `^4.0.1` | `^4.0.1` |

The runtime peer-version check now covers all four UIKit packages, using minimum versions
generated from the manifest at build time.

**Consumer action**

Consumers must install or declare `@openzeppelin/ui-components ^3.9.0` and
`@openzeppelin/ui-react ^3.3.2` alongside the adapter. Role Manager can remove its
version-scoped `packageExtensions` workaround for `@openzeppelin/adapter-polkadot@5.0.0` after
upgrading to this release.
