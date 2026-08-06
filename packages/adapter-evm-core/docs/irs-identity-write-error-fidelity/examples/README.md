# IRS Identity Write Error Fidelity — Examples

Self-contained TypeScript snippets for SF-5 recovery and ambiguity handling.
**Adapters-only** — no `reference-implementations` paths.

| Example | Pattern |
|---------|---------|
| [already-onboarded-recovery/](./already-onboarded-recovery/) | Catch `IdentityAlreadyRegistered` on grant re-drive |
| [read-failed-ambiguous/](./read-failed-ambiguous/) | Keep `read_failed` / generic failures out of conflict path |

**Requirements:** TypeScript 5.x, `@openzeppelin/ui-types` (with
`IdentityAlreadyRegistered` / `IdentityOperationFailed`), adapters on branch
`004-irs-submit-only-completion`. These are type-shape demos — they do not send
Relayer traffic or publish packages.

```bash
# from adapters workspace with ui-types linked via dev:local
pnpm exec tsc --noEmit \
  packages/adapter-evm-core/docs/irs-identity-write-error-fidelity/examples/already-onboarded-recovery/grant-recover.ts \
  packages/adapter-evm-core/docs/irs-identity-write-error-fidelity/examples/read-failed-ambiguous/handle-read-failed.ts
```
