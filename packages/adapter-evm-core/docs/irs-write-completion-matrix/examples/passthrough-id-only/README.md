# Pattern: Passthrough ops return exact `{ id }`

Shows that `attachClaim` and `registerIdentity` under `completion: 'submitted'`
resolve to `OperationResult` with **no** `completion` property — the SF-4 strip
MECHANISM.

```bash
pnpm exec tsc --noEmit attach-register.ts
```

See also: [../../integration-guide.md](../../integration-guide.md) Pattern 2.
