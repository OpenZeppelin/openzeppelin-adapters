---
'@openzeppelin/adapter-evm': major
'@openzeppelin/adapter-midnight': major
'@openzeppelin/adapter-polkadot': major
'@openzeppelin/adapter-solana': major
'@openzeppelin/adapter-stellar': major
---

Move the UIKit peer ranges onto the v3 line.

**Why**

Every adapter declared UIKit **v2** for `ui-components`, `ui-react` and `ui-utils` while already
declaring **v3** for `ui-types`. UIKit's current line is components 3.x, react 3.x, utils 4.x,
types 3.5.x, so no consumer on current UIKit could install an adapter without unmet peers. The
manifests described a combination that no longer exists.

**What changed**

| peer | before | after |
| --- | --- | --- |
| `@openzeppelin/ui-components` | `^2.0.0` | `^3.9.0` |
| `@openzeppelin/ui-react` | `^2.0.1` | `^3.3.2` |
| `@openzeppelin/ui-utils` | `^2.0.0` | `^4.0.1` |
| `@openzeppelin/ui-types` | `^3.2.0` / `^3.5.0` | `^3.5.2` |

**Why the floors are exact patch versions rather than `^3.0.0` / `^4.0.0`**

The four UIKit packages depend on each other with `dependencies`, not peers:
`ui-components@3.9.0` depends on `ui-utils ^4.0.1` and `ui-types ^3.5.2`; `ui-react@3.3.2`
depends on `ui-components ^3.8.3`. A floor below those lets a consumer satisfy our peer with an
older patch while UIKit resolves a *second*, nested copy for itself:

- Two copies of `ui-utils` split its module-level singletons. `appConfigService` and
  `Logger.getInstance()` hold init state, so the adapter's copy would stay permanently
  uninitialized and silently return defaults behind a "called before initialization" warning.
- Two copies of `ui-components` break React context identity.
- Two copies of `ui-types` make structurally identical types nominally distinct — the
  TS2322/TS2345 failure the `@openzeppelin/ui-types` override in `pnpm-workspace.yaml` already
  exists to prevent inside this repo.

Each floor is therefore set to the version UIKit itself requires, which is also the version this
change was verified against. Carets still admit every later 3.x / 4.x release.

**v2 is not kept in the range**

`^2.0.0 || ^3.0.0` was considered and rejected. The same internal coupling means a per-package
union range advertises mixes UIKit itself forbids. More decisively, a range we neither install
nor test in CI is a claim we cannot keep: the workspace now resolves the v3 line, so nothing
would signal a v2 regression.

Consumers still on UIKit v2 must upgrade. The `validatePeerVersions` floor baked into each
bundle rises with the manifest, so a v2 install now throws at module load with an actionable
message instead of failing later on a type or prop mismatch.

**Verified against real UIKit v3**

Installed and checked against `ui-components@3.9.0`, `ui-react@3.3.2`, `ui-utils@4.0.1` and
`ui-types@3.5.2`. Build, type check, lint and the full test suite pass with **no source
changes** — the `ui-utils` v2-to-v4 jump and the components/react majors required no call-site
edits in any adapter.

The private workspace packages `@openzeppelin/adapter-evm-core` and
`@openzeppelin/adapter-runtime-utils` carry the same ranges. They are bundled into the published
adapters rather than published themselves.
