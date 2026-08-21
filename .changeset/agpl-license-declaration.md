---
'@openzeppelin/adapter-evm': major
'@openzeppelin/adapter-midnight': major
'@openzeppelin/adapter-solana': major
'@openzeppelin/adapter-stellar': major
'@openzeppelin/adapters-vite': major
---

Declare AGPL-3.0 consistently and add the missing LICENSE file.

The repository had no `LICENSE` file at all, and its licence metadata contradicted
itself. `README.md` states **AGPL v3**, `adapter-evm-core` and `adapter-polkadot`
declared AGPL-3.0, but six packages declared **MIT** — and published to npm as MIT.
All of these were set in a single scaffolding commit (`ec7fb58`), so the split looks
accidental rather than intentional.

- Added `LICENSE` (GNU AGPL v3), matching `openzeppelin-ui` and `ui-builder`, the
  repository these adapters were extracted from.
- Set `license: "AGPL-3.0"` on the root manifest and every package, replacing MIT on
  `adapter-evm`, `adapter-evm-core`, `adapter-midnight`, `adapter-solana`,
  `adapter-stellar` and `adapters-vite`, and filling in the missing field on
  `adapter-runtime-utils`.
- `adapter-midnight`'s README said MIT; it now says AGPL-3.0.

**Marked major deliberately.** For anyone consuming these packages this is a move
from a permissive licence to a copyleft one, which is materially restrictive
regardless of the original intent. Note also that versions already published
declaring MIT remain MIT for anyone who obtained them — this corrects the
declaration going forward, it does not reach back. Worth a legal review rather than
treating it as a metadata tidy-up.
