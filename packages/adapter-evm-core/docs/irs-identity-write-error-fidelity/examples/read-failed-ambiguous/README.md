# Example — Keep `read_failed` ambiguous

Shows that `IdentityOperationFailed` from a pre-submit probe failure must **not**
be promoted to `ALREADY_ONBOARDED` or treated as lacks. Honest generic beats
confidently wrong specific.

```bash
pnpm exec tsc --noEmit \
  packages/adapter-evm-core/docs/irs-identity-write-error-fidelity/examples/read-failed-ambiguous/handle-read-failed.ts
```
