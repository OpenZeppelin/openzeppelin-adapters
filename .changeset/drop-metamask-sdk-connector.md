---
'@openzeppelin/adapter-evm': major
'@openzeppelin/adapter-polkadot': major
---

Remove the dedicated `metaMask()` wagmi connector, and strip `@metamask/sdk` from the install
tree.

**Why**

`@metamask/sdk` is not open source. It ships a proprietary licence — "Copyright ConsenSys
Software Inc. 2022. All rights reserved" — granting only a non-exclusive, non-transferable
licence for **Non-Commercial Use**. Clause 2 requires any Resulting Program to carry that same
Non-Commercial restriction forward.

We publish under AGPL-3.0, which forbids conveying the work under added restrictions. A
non-commercial-only restriction is exactly such a restriction, while the SDK licence demands our
derivative propagate it. Those two obligations cannot both be satisfied.

This conflict is structural, not a threshold question — it does not depend on any monthly
active user count. There is also no clean version to pin: none of the published versions of
`@metamask/sdk` declare a `license` field at all, and the proprietary licence file dates from
2022. The same 2715-byte licence ships in `@metamask/sdk`,
`@metamask/sdk-communication-layer` and `@metamask/sdk-install-modal-web`.

**What changed**

`createDefaultConfig()` in the shared wagmi implementation now builds its connector list from
`[injected(), safe()]` instead of `[injected(), metaMask(), safe()]`. `@openzeppelin/adapter-polkadot`
extends the same class, so it inherits the change.

Removing the connector alone is not sufficient: `@wagmi/connectors` declares `@metamask/sdk` as
a **hard dependency**, not an optional peer, so it installed whether or not the connector was
registered. A `.pnpmfile.cjs` `readPackage` hook now strips it, and
`scripts/check-dependency-licenses.cjs` fails if it returns to the lockfile or if the hook is
removed.

The strip targets those three package names exactly, **not** the `@metamask/*` scope. Most of
that scope is MIT or ISC (`utils`, `providers`, `json-rpc-engine`, `rpc-errors`, `superstruct`,
`sdk-analytics`, …) and is legitimately required; a scope-wide ban would break far more than it
fixes.

**What this means for users**

MetaMask **desktop keeps working.** The browser extension is discovered through `injected()`
plus EIP-6963 multi-injected provider discovery, which `createConfig` leaves enabled by
default.

**MetaMask mobile deep-link / QR pairing is gone.** That pairing flow was provided only by the
SDK, and it is a user-visible behaviour change. Mobile users can still connect through the
MetaMask in-app browser, which exposes an injected provider.

The RainbowKit path is unaffected: its wallet list was already pinned to
`[injectedWallet, safeWallet]`.
