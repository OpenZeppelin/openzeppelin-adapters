# Pattern: Maintainer lock (matrix + pack)

Runbook for the SF-4 CI lock. Copy the commands into your local shell from the
`openzeppelin-adapters` repo root. The checklist mirrors pack markers C-1..C-4.

```bash
# optional: print the checklist
cat CHECKLIST.md

# behavior matrix
pnpm --filter @openzeppelin/adapter-evm-core exec vitest run \
  src/irs/__tests__/irs.write-completion-matrix.test.ts

# built-package proof (~120s beforeAll: build + npm pack)
pnpm --filter @openzeppelin/adapter-evm exec vitest run \
  test/sf-4-write-completion-pack.test.ts
```

See also: [../../integration-guide.md](../../integration-guide.md) Pattern 1.
