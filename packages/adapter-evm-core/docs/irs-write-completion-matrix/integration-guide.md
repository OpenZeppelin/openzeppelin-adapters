# IRS Write-Completion Matrix — Integration Guide

Audience: adapter maintainers locking the IRS write surface, and Relayer / saga
integrators who need honest `{ id }` returns on attach / register.

Prerequisites: SF-1 [write-completion](../write-completion/integration-guide.md),
SF-2 [deploy](../deploy-onchainid-submit-only/integration-guide.md), SF-3
[grant](../irs-grant-submit-only/integration-guide.md).

---

## Pattern 1: Run the maintainer lock in CI

Wire both suites into the adapters CI job that already runs Vitest for
`adapter-evm-core` and `adapter-evm`:

```bash
pnpm --filter @openzeppelin/adapter-evm-core exec vitest run \
  src/irs/__tests__/irs.write-completion-matrix.test.ts

pnpm --filter @openzeppelin/adapter-evm exec vitest run \
  test/sf-4-write-completion-pack.test.ts
```

**What GREEN means:**

- Every IRS identity write op has at least one matrix row (INV-1).
- Submit-only and confirmed/absent paths are exercised; defects go RED then GREEN.
- Would-publish `dist` contains C-1..C-4 markers; dry-run lists those dist chunks.

**What GREEN does not mean:** Residual Risk (timeout indistinguishability) is
closed — it is not. SF-2/SF-3 deep edge cases are covered by their own suites.

---

## Pattern 2: Integrator — attachClaim / registerIdentity under both modes

```ts
import { createIRS } from '@openzeppelin/adapter-evm';
import type { RelayerExecutionConfig, OnboardingClaim } from '@openzeppelin/ui-types';

const irs = createIRS(/* … */);

async function attachBothModes(
  onchainId: `0x${string}`,
  claim: OnboardingClaim,
  base: Omit<RelayerExecutionConfig, 'transactionOptions'>
) {
  const submitted = await irs.attachClaim(
    { onchainId, claim },
    { ...base, transactionOptions: { completion: 'submitted' } }
  );
  // exact OperationResult — no completion excess property
  const idSubmitted: string = submitted.id;
  // @ts-expect-error — completion is not on the public wire
  void submitted.completion;

  const confirmed = await irs.attachClaim(
    { onchainId, claim },
    { ...base, transactionOptions: { completion: 'confirmed' } }
  );
  const idConfirmed: string = confirmed.id;

  return { idSubmitted, idConfirmed };
}
```

Same shape for `registerIdentity`. Pre-submit `IdentityAlreadyRegistered` still
applies on register; that is **not** a post-submit wait.

---

## Pattern 3: Trusted issuer — audit only

```ts
import { createIRS } from '@openzeppelin/adapter-evm';
import { TRUSTED_ISSUER_NOOP_ID } from '@openzeppelin/adapter-evm-core';

const irs = createIRS(/* … */);

const result = await irs.registerTrustedIssuer(
  { issuer, topics },
  executionConfig
);

if (result.id === TRUSTED_ISSUER_NOOP_ID) {
  // Already trusted — no transaction was sent
} else {
  // Execute path — { id } is the submission / tx id; no new submit-only branch
}
```

Do **not** expect a completion-keyed union or skip semantics unique to this op.
SF-4 only strips `completion` on the execute arm and documents the noop path.

---

## Pattern 4: Catch disagreement through passthrough ops

Strip must not hide wiring bugs:

```ts
try {
  await irs.attachClaim({ onchainId, claim }, executionConfig);
} catch (error: unknown) {
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
      ? (error as { code: string }).code
      : undefined;

  if (code === 'WRITE_COMPLETION_DISAGREEMENT') {
    // Options vs strategy result disagree — fix wiring; do not retry as submit-only
    throw error;
  }
  throw error;
}
```

Both disagreement directions are covered in the matrix (options confirmed +
result submitted, and the reverse) through attachClaim / registerIdentity.

---

## Common Mistakes

- **Treating pack GREEN as behavior GREEN.** Markers prove the completion surface
  is in the tarball; the matrix proves per-op wait/assert/strip behavior.
- **Grepping `src/` for SC-005.** Published 2.5.0 had source-adjacent files with
  empty completion surface in `dist`. Always assert packed `package/dist`.
- **Branching on `result.completion` after attachClaim / registerIdentity.** That
  excess field was a CONVENTION leak; SF-4 MECHANISM strips it. Use deploy’s
  discriminant or SF-1 strategy/options signals instead.
- **Adding “symmetry” early-return wrappers** on passthrough ops. The regression
  class is re-introducing waits — not missing an early-return.
- **Inventing submit-only for trusted-issuer.** Audit/noop + execute strip only.
- **Claiming Residual Risk closed** because the matrix is green. Timeout
  indistinguishability remains named and open.
- **Cross-importing SF-2/SF-3 test modules** into the matrix (Vitest double-
  registration). Keep deep suites separate; matrix holds slim RED/GREEN only.
- **Editing `reference-implementations` or publishing** as part of this initiative.

---

## Migration (MINOR — wire honesty)

**Before SF-4 (undeclared):** `attachClaim` / `registerIdentity` /
`registerTrustedIssuer` (execute) could return a `WriteExecutionResult`-shaped
object with excess `completion` at runtime while the public type said
`OperationResult` (`{ id }`).

**After SF-4:** returns are exact `{ id: result.id }`.

| Caller kind | Action |
|-------------|--------|
| Typed `OperationResult` consumers | None |
| Untyped callers reading `.completion` after attach/register | Stop — use deploy outcome or SF-1 signals |
| Trusted-issuer noop consumers | Unchanged (`TRUSTED_ISSUER_NOOP_ID`) |

See [CHANGELOG.md](./CHANGELOG.md).

---

## Version / workspace notes

- Adapters branch: `004-irs-submit-only-completion` (MINOR 2.6.0-class; unpublished
  in this initiative).
- ui-types vocabulary: `@openzeppelin/ui-types@3.5.0` (linked / local until
  published) — SF-1 prerequisite; SF-4 does not reopen it.
- Hard exclusion: no edits under `reference-implementations`.
- Pack suite builds `@openzeppelin/adapter-evm` locally; it does **not** publish.

---

## Sibling docs

| Slice | Docs |
|-------|------|
| SF-1 detection + vocabulary | [../write-completion/](../write-completion/) |
| SF-2 deploy submit-only | [../deploy-onchainid-submit-only/](../deploy-onchainid-submit-only/) |
| SF-3 grant submit-only | [../irs-grant-submit-only/](../irs-grant-submit-only/) |
| SF-4 matrix + pack (this) | [./](./) |
