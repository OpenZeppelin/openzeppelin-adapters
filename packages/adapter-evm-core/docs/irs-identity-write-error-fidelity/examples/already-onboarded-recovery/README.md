# Example — Already-onboarded grant recovery

Shows the consumer catch shape when `grantHolderManagementKey` throws reused
`IdentityAlreadyRegistered` (`ALREADY_ONBOARDED`) because the holder already
holds MANAGEMENT. No new operator transaction is submitted.

HTTP/transport mapping of `ALREADY_ONBOARDED` → conflict status is dig/consumer
owned — this example only classifies the adapter error.

```bash
pnpm exec tsc --noEmit \
  packages/adapter-evm-core/docs/irs-identity-write-error-fidelity/examples/already-onboarded-recovery/grant-recover.ts
```
