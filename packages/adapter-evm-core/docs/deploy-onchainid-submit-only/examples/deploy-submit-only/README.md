# Example: Deploy submit-only outcome narrowing

Shows **MECHANISM**: after `completion: 'submitted'`, the return arm has `{ id }` only —
no `onchainId` property.

```bash
pnpm exec tsc --noEmit deploy-submit-only.ts
```

Requires `@openzeppelin/ui-types@3.5.0` and `@openzeppelin/adapter-evm-core` with
`DeployOnchainIdOutcome`.
