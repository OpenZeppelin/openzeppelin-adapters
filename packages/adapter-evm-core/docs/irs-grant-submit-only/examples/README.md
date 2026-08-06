# IRS Grant Submit-Only — Examples

Self-contained TypeScript snippets for SF-3 grant-holder MANAGEMENT submit-only.

| Example | Pattern |
|---------|---------|
| [submit-only-grant/](./submit-only-grant/) | Skip post-submit assert; caller confirms with `hasIdentityKeyPurpose` |
| [confirmed-grant/](./confirmed-grant/) | Default / confirmed path still asserts MANAGEMENT |

**Requirements:** TypeScript 5.x, `@openzeppelin/ui-types@3.5.0` (linked / local until
published), `@openzeppelin/adapter-evm-core` on branch
`004-irs-submit-only-completion`. These examples are type-shape / control-flow demos —
they do not send Relayer traffic.

```bash
# from adapters workspace with ui-types linked via dev:local
pnpm exec tsc --noEmit path/to/example.ts
```
