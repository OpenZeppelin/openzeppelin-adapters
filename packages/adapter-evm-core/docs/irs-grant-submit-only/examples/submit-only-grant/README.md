# Example: Submit-only grant + resume probe

Shows SF-3 MECHANISM (skip `keyHasPurpose` after submit) and CONVENTION
(caller-owned confirmation via `hasIdentityKeyPurpose`).

```bash
pnpm exec tsc --noEmit grant-submit-only.ts
```

Requires `@openzeppelin/ui-types@3.5.0` and an adapters workspace that exports
`createIRS` / `EvmIRSCapability`. MANAGEMENT purpose is the literal `1`.
