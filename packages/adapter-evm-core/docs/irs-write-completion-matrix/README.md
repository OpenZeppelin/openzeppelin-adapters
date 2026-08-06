# IRS Write-Completion Matrix

> Prove every IRS identity write under submit-only **and** confirmed completion —
> with NON-VACUITY (defect RED → fix GREEN) and a built-package gate so the
> published-2.5.0 empty-completion class cannot ship again.

This is **SF-4 (irs-write-completion-matrix)** for the IRS submit-only initiative.
It does **not** invent new write semantics. SF-1–SF-3 already deliver detection and
deploy/grant early-return; attachClaim / registerIdentity / registerTrustedIssuer
are structural passthrough (or audit). SF-4 **locks** that surface:

1. **Behavior matrix** in `@openzeppelin/adapter-evm-core` — table-driven Vitest
   over every IRS identity write × completion mode.
2. **Built-package proof** on public `@openzeppelin/adapter-evm` — `npm pack`
   dry-run inventory **plus** tarball `dist/` marker grep (never src-only).

## Overview

Maintainers need one place that proves hang/misreport cannot regress after a
future wrapper “helpfully” adds receipt waits to attach/register, and that the
files consumers install still contain the completion surface. Integrators need
honest wire shapes: non-deploy writes return exact `{ id }` (no leaked
`completion` field).

Primary entry points:

```bash
# Behavior lock (core)
pnpm --filter @openzeppelin/adapter-evm-core exec vitest run \
  src/irs/__tests__/irs.write-completion-matrix.test.ts

# Built-package proof (public adapter-evm)
pnpm --filter @openzeppelin/adapter-evm exec vitest run \
  test/sf-4-write-completion-pack.test.ts
```

Consumer factory is unchanged:

```ts
import { createIRS } from '@openzeppelin/adapter-evm';
```

**What SF-4 does not do:**

- Does **not** add method-level `if (completion === 'submitted')` early-return
  branches on attachClaim / registerIdentity (already prompt; regression class is
  **re-adding** waits).
- Does **not** invent submit-only semantics for `registerTrustedIssuer` (audit /
  passthrough only).
- Does **not** reopen SF-1 dual-source merge or SF-2/SF-3 deploy/grant typing.
- Does **not** close Residual Risk (confirmed-path timeout indistinguishability).
- Does **not** publish adapters or ui-types as part of this docs stage.
- Does **not** edit `reference-implementations`.

## Quick Start

### Maintainer — run the lock

From the `openzeppelin-adapters` workspace root:

```bash
pnpm --filter @openzeppelin/adapter-evm-core exec vitest run \
  src/irs/__tests__/irs.write-completion-matrix.test.ts

pnpm --filter @openzeppelin/adapter-evm exec vitest run \
  test/sf-4-write-completion-pack.test.ts
```

Expect: matrix GREEN (20 cases) and pack GREEN (6 cases, includes `pnpm build` +
`npm pack` in `beforeAll`, ~120s budget).

### Integrator — wire honesty on passthrough ops

```ts
import { createIRS } from '@openzeppelin/adapter-evm';
import type { RelayerExecutionConfig } from '@openzeppelin/ui-types';

const irs = createIRS(/* addresses, signAndBroadcast, … */);

const executionConfig: RelayerExecutionConfig = {
  method: 'relayer',
  serviceUrl: process.env.RELAYER_URL!,
  relayer: { /* RelayerDetails */ } as RelayerExecutionConfig['relayer'],
  transactionOptions: { completion: 'submitted' },
};

// Both modes: public return is exact { id } — no completion field
const attached = await irs.attachClaim(
  { onchainId, claim },
  executionConfig
);
// attached === { id: string }
// 'completion' in attached → false
```

Deploy still uses the SF-2 discriminant (`DeployOnchainIdOutcome`). See
[deploy-onchainid-submit-only](../deploy-onchainid-submit-only/README.md).

## Key Concepts

### Op × mode matrix

| Op | Submitted | Confirmed / absent | SF-4 role |
|----|-----------|--------------------|-----------|
| `deployOnchainId` | Early return; no wait/parse/assert | Wait → parse → assert; required `onchainId` | Slim NON-VACUITY (SF-2 deep suite remains) |
| `grantHolderManagementKey` | Skip key-purpose assert; `{ id }` | Assert + `IdentityOperationFailed` | Slim NON-VACUITY (SF-3 deep suite remains) |
| `attachClaim` | Prompt `{ id }`; no new wait | Same; strip `completion` | Prove no post-submit wait; wire honesty |
| `registerIdentity` | Prompt `{ id }` after pre-read | Same; strip | Same (+ `getOnchainId` pre-guard) |
| `registerTrustedIssuer` | n/a new semantics | Audit noop or execute `{ id }` | Document current behavior only |

**Absent ≡ confirmed** (SF-1 default). Matrix includes explicit `absent` rows.

### NON-VACUITY

Every behavioral row:

1. Constructs a defect (always-wait / always-assert / post-execute wait wrapper /
   strip-leak).
2. Goes **RED** under that defect.
3. Runs the real service method → **GREEN**.
4. Anchors confirmed-path call counts / return shapes where applicable.

Vacuous always-green guards are forbidden (SC-003).

### Built-package proof (SC-005)

Three gates on public `@openzeppelin/adapter-evm`:

1. `npm pack --dry-run --json` inventory lists would-publish `dist/*.mjs|cjs`.
2. Content grep on **extracted tarball** `package/dist` for markers C-1..C-4.
3. Workspace `dist/` marker parity (build-without-pack drift).

**Never** grepping `src/` or packed `package/src/` for the content gate.
Dry-run file names alone are insufficient (published 2.5.0 had files, zero
completion strings).

### MECHANISM vs CONVENTION

| Item | Class | Notes |
|------|-------|-------|
| Op×mode matrix + NON-VACUITY RED→GREEN | **MECHANISM** | Vitest fails CI if a row is removed or made vacuous |
| attach / register / trusted-issuer execute → exact `{ id }` | **MECHANISM** | Runtime strip at public op boundary |
| No post-submit wait/verify on passthrough ops | **MECHANISM** | Matrix asserts wait/assert call count **0** |
| Trusted-issuer audit only (no invented submit-only) | **MECHANISM** | Absence of branch + audit rows |
| SC-005 dry-run + packed `dist` markers + workspace parity | **MECHANISM** | Pack suite; C-5 proves the gate itself is non-vacuous |
| Prior excess `completion` on attach/register wire | Was **CONVENTION** leak → **MECHANISM** strip | Never in Specify `{ id }` table |
| SF-2/SF-3 deep suites for edge cases | **CONVENTION** (layout) + **MECHANISM** (suites exist) | Matrix does not delete them |
| Adapter does not re-fire `onSubmitted` | **CONVENTION** | SF-1 — types do not prevent a second fire |
| Residual Risk (timeout indistinguishability) | Named open — **not** closed | INV-9 / Specify Residual Risk |

Full tables: [integration-guide.md](./integration-guide.md) · sibling SF docs for
detection / deploy / grant.

## API Reference

See [api-reference.md](./api-reference.md).

## Integration Guide

See [integration-guide.md](./integration-guide.md) for maintainer and integrator
patterns.

## Safety

- **Confirmed-path default must not change.** Omitting `completion` ≡ confirmed
  (matrix pins `absent` rows).
- **Disagreement THROW** still applies through passthrough ops — strip must not
  swallow `WRITE_COMPLETION_DISAGREEMENT` (INV-7).
- **Do not treat `{ id }` after attach/register as on-chain success beyond
  submission.** Passthrough means execute returned; caller owns resume / WAL.
- **Do not invent identity addresses** on deploy submit-only (SF-2).
- **Residual Risk remains open:** confirmed-path deploy mined-but-verify-timed-out
  vs never-landed is still indistinguishable at the typed-error boundary.
- **Pack markers are not a substitute for the matrix.** Markers prove the surface
  shipped; the matrix proves per-op behavior.

## License

Same as `@openzeppelin/adapter-evm-core` / `@openzeppelin/adapter-evm`.
