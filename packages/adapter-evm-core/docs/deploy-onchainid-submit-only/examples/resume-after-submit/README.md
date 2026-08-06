# Example: Resume after submit-only deploy

Shows **CONVENTION**: caller owns Relayer reconcile + `getFactoryIdentity` — the adapter
never fabricates `onchainId` on the submit-only path.

```bash
pnpm exec tsc --noEmit resume-after-submit.ts
```

Requires `@openzeppelin/adapter-evm-core` factory lookup types.
