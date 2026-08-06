# Deploy ONCHAINID Submit-Only — Examples

Self-contained TypeScript snippets for SF-2 deploy early-return.

| Example | Pattern |
|---------|---------|
| [deploy-submit-only/](./deploy-submit-only/) | Narrow `DeployOnchainIdOutcome` under submit-only options |
| [resume-after-submit/](./resume-after-submit/) | Caller-owned `getFactoryIdentity` resume (no fabricated address) |

**Requirements:** TypeScript 5.x, `@openzeppelin/ui-types@3.5.0`,
`@openzeppelin/adapter-evm-core` with SF-2 outcome types. These are type-shape demos —
they do not send Relayer traffic or deploy identities.

```bash
# from adapters workspace with linked ui-types 3.5.0
pnpm exec tsc --noEmit path/to/example.ts
```

Related: [write-completion examples](../../write-completion/examples/) for option /
strategy wiring (SF-1).
