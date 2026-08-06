# IRS Write-Completion Matrix — Examples

Self-contained TypeScript snippets for SF-4 matrix / pack awareness and
passthrough wire honesty.

| Example | Pattern |
|---------|---------|
| [passthrough-id-only/](./passthrough-id-only/) | attachClaim / registerIdentity return exact `{ id }` under submit-only |
| [maintainer-lock/](./maintainer-lock/) | Commands + marker checklist for the CI lock |

**Requirements:** TypeScript 5.x, `@openzeppelin/ui-types@3.5.0` (linked / local
until published), `@openzeppelin/adapter-evm` / `-core` on branch
`004-irs-submit-only-completion`. These examples are type-shape / runbook demos —
they do not send Relayer traffic or publish packages.

```bash
# from adapters workspace with ui-types linked via dev:local
pnpm exec tsc --noEmit packages/adapter-evm-core/docs/irs-write-completion-matrix/examples/passthrough-id-only/attach-register.ts
```
