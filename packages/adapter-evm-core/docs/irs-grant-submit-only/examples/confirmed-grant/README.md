# Example: Confirmed-path grant (non-regression)

Shows that omitting `completion` (or setting `'confirmed'`) keeps post-submit
`keyHasPurpose` verification and `IdentityOperationFailed` on lacks / RPC fail.

```bash
pnpm exec tsc --noEmit grant-confirmed.ts
```

Requires `@openzeppelin/ui-types@3.5.0`.
