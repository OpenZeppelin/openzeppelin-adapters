# Integration Guide — IRS Identity Write Error Fidelity (SF-5)

Audience: Relayer / saga integrators wiring IRS onboarding recovery, and adapter
maintainers verifying NON-VACUITY. Adapters-only — no `reference-implementations`
snippets.

## Pattern 1: Map already-onboarded grant to finished / conflict

When a saga re-drives `grantHolderManagementKey` for a holder who already holds
MANAGEMENT, catch the specific shared error **before** treating the call as a
broken IRS:

```ts
import { createIRS } from '@openzeppelin/adapter-evm';
import {
  IdentityAlreadyRegistered,
  IdentityOperationFailed,
} from '@openzeppelin/ui-types';

export async function grantOrFinished(
  irs: ReturnType<typeof createIRS>,
  onchainId: `0x${string}`,
  holder: `0x${string}`,
  executionConfig: Parameters<ReturnType<typeof createIRS>['grantHolderManagementKey']>[1]
): Promise<{ status: 'granted' | 'already_onboarded'; id?: string }> {
  try {
    const { id } = await irs.grantHolderManagementKey(
      { onchainId, holder },
      executionConfig
    );
    return { status: 'granted', id };
  } catch (e) {
    if (e instanceof IdentityAlreadyRegistered && e.code === 'ALREADY_ONBOARDED') {
      // Dig/consumer maps this to HTTP conflict / finished — not adapters' job
      return { status: 'already_onboarded' };
    }
    if (e instanceof IdentityOperationFailed) {
      // Includes pre-submit read_failed (no tx) and real write failures
      throw e;
    }
    throw e;
  }
}
```

Works under **both** `completion: 'submitted'` and confirmed/default — fidelity
runs before `execute`.

## Pattern 2: Resume deploy when factory already linked

```ts
import {
  IdentityAlreadyRegistered,
  IdentityOperationFailed,
} from '@openzeppelin/ui-types';

export async function deployOrResume(
  irs: {
    deployOnchainId: (
      input: { holder: string },
      cfg: unknown
    ) => Promise<{ id: string; onchainId?: string; completion?: string }>;
  },
  holder: `0x${string}`,
  executionConfig: unknown
): Promise<{ id?: string; onchainId: string; alreadyLinked: boolean }> {
  try {
    const outcome = await irs.deployOnchainId({ holder }, executionConfig);
    if ('onchainId' in outcome && typeof outcome.onchainId === 'string') {
      return { id: outcome.id, onchainId: outcome.onchainId, alreadyLinked: false };
    }
    // Submit-only: caller owns poll + getFactoryIdentity resume
    throw new Error('submit-only deploy returned; resume via getFactoryIdentity');
  } catch (e) {
    if (e instanceof IdentityAlreadyRegistered) {
      return {
        onchainId: e.onchainId as string,
        alreadyLinked: true,
      };
    }
    if (e instanceof IdentityOperationFailed) {
      // read_failed / timeout / revert — do NOT invent already-linked
      throw e;
    }
    throw e;
  }
}
```

## Pattern 3: Keep `read_failed` ambiguous

Never coerce a failed key-purpose or factory read into "already done" or "needs
grant":

```ts
import { IdentityOperationFailed } from '@openzeppelin/ui-types';

export function classifyGrantFailure(e: unknown): 'already_onboarded' | 'ambiguous' | 'other' {
  if (
    e instanceof Error &&
    'code' in e &&
    (e as { code: string }).code === 'ALREADY_ONBOARDED'
  ) {
    return 'already_onboarded';
  }
  if (e instanceof IdentityOperationFailed) {
    // Pre-submit read_failed messages say "ambiguous — not already-onboarded, not lacks"
    return 'ambiguous';
  }
  return 'other';
}

// CORRECT: retry probe / wait for RPC
// WRONG:   if (ambiguous) treat as ALREADY_ONBOARDED
// WRONG:   if (ambiguous) treat as lacks and submit again blindly
```

## Pattern 4: Register precedent + trusted-issuer contrast

```ts
// registerIdentity — same IdentityAlreadyRegistered class (precedent)
try {
  await irs.registerIdentity({ holder, onchainId }, executionConfig);
} catch (e) {
  if (e instanceof IdentityAlreadyRegistered) {
    /* already registered — finished */
  }
}

// registerTrustedIssuer — intentional DIFFERENT pattern: noop SUCCESS, not throw
const trusted = await irs.registerTrustedIssuer(/* … */, executionConfig);
// If already trusted: { id: TRUSTED_ISSUER_NOOP_ID }, no tx — do not expect ALREADY_ONBOARDED
```

Do not unify trusted-issuer with grant/register throw shapes in consumer code.

## Common Mistakes

1. **Only catching `IdentityOperationFailed` on re-drive** — miss the recovery
   path; grant/deploy now throw `IdentityAlreadyRegistered` when proven complete.
2. **Treating `read_failed` as already-onboarded** — steers automation into false
   conflict while the chain state is unknown.
3. **Treating `read_failed` as lacks / not_found** — may submit under RPC fog
   (orphan / duplicate risk). Adapter refuses; consumers must too.
4. **Blind retry after deploy timeout** — still Residual Risk; may orphan holders.
   Probe `getFactoryIdentity` first; never map timeout to `ALREADY_ONBOARDED`.
5. **Expecting attachClaim to throw already-onboarded** — no claim-exists
   MECHANISM; stay on generic handling.
6. **Expecting trusted-issuer already-trusted to throw** — noop success by design.
7. **Editing `reference-implementations` for the pin bump** — hard exclusion;
   consumer pin is dig/dev-owned.

## Migration (MINOR — adapters 2.6.0-class)

| Before SF-5 | After SF-5 |
|-------------|------------|
| Already-has-MANAGEMENT grant → often `IRS_OPERATION_FAILED` (possibly after attempt) | `IdentityAlreadyRegistered` **before** submit |
| Factory-linked deploy re-drive → generic / wallet-already-linked trap risk | `IdentityAlreadyRegistered` **before** submit when factory `found` |
| Register already-registered | Unchanged (`IdentityAlreadyRegistered`) |
| Trusted-issuer already trusted | Unchanged (noop success) |
| Confirmed-path **success** fixtures | Byte-identical when write proceeds |

**Steps for consumers:**

1. Ensure catch sites handle `IdentityAlreadyRegistered` / `ALREADY_ONBOARDED` on
   grant and deploy (not only register).
2. Keep `IdentityOperationFailed` for ambiguous / real failures — do not collapse
   codes by message string matching.
3. Do **not** await a typed `indeterminate` subclass in this MINOR — still OUT.
4. Pin / publish bumps remain explicitly instructed (not this docs stage).

## Maintainer — NON-VACUITY lock

```bash
pnpm --filter @openzeppelin/adapter-evm-core exec vitest run \
  src/irs/__tests__/irs.error-fidelity.test.ts
```

Expect GREEN fidelity suite (17 cases as of 2026-08-06) with RED→GREEN defect
helpers for grant has, grant read_failed, deploy found, deploy read_failed.
See Tests artifact for full regression command (92 cases including SF-2/SF-3/SF-4).
