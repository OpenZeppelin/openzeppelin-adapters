# IRS Identity Write — Error Fidelity

> When an IRS identity write can **prove** the holder is already complete via a
> successful on-chain read, the adapter throws reused
> `IdentityAlreadyRegistered` (`ALREADY_ONBOARDED`) **before** submit — so saga
> recovery can map conflict/finished instead of collapsing into generic
> `IRS_OPERATION_FAILED`.

This is **SF-5 (irs-identity-write-error-fidelity)** for the IRS submit-only
initiative. It changes **which error** is reported on recognisable arms — not
what counts as success, and not SF-1…SF-4 completion semantics.

## Overview

Relayer / saga consumers that re-drive onboarding for an already-complete holder
used to hit `grantHolderManagementKey`, enter `execute`, and receive generic
`IRS_OPERATION_FAILED` — indistinguishable from a broken registry. SF-5 wires
existing probes **before** `execute`:

| Write | Successful probe | Pre-submit throw | Ambiguous (`read_failed`) |
|-------|------------------|------------------|---------------------------|
| `grantHolderManagementKey` | key-purpose `has` MANAGEMENT | `IdentityAlreadyRegistered` | `IdentityOperationFailed` — **no** submit |
| `deployOnchainId` | factory `found` | `IdentityAlreadyRegistered` | `IdentityOperationFailed` — **no** submit |
| `registerIdentity` | registry `found` | `IdentityAlreadyRegistered` (precedent; non-regression) | existing register RPC shape |
| `registerTrustedIssuer` | already trusted | **noop success** (unchanged) | n/a |
| `attachClaim` | *(none)* | stay generic | stay generic |

**Primary integration point:** catch `IdentityAlreadyRegistered` from
`@openzeppelin/ui-types` on grant / deploy / register — same class, same
`code: 'ALREADY_ONBOARDED'`. No new error code.

**What SF-5 does not do:**

- Does **not** invent a new error class or `IdentityAlreadyGranted`.
- Does **not** promote `read_failed` to already-onboarded or lacks / not_found.
- Does **not** convert trusted-issuer noop-success into a throw.
- Does **not** invent attach-claim claim-exists infrastructure.
- Does **not** add a typed `indeterminate` timeout subclass (Residual Risk stays open).
- Does **not** change confirmed-path **success** shapes or SF-1…SF-4 completion.
- Does **not** own consumer HTTP mapping of `ALREADY_ONBOARDED` → conflict.
- Does **not** edit `reference-implementations` or publish packages.

## Quick Start

```ts
import { createIRS } from '@openzeppelin/adapter-evm';
import {
  IdentityAlreadyRegistered,
  IdentityOperationFailed,
} from '@openzeppelin/ui-types';

const irs = createIRS(networkConfig, {
  signAndBroadcast,
  addresses,
  operatorManagementKey,
});

try {
  await irs.grantHolderManagementKey(
    { onchainId, holder },
    executionConfig // confirmed or submit-only — fidelity runs first
  );
} catch (e) {
  if (e instanceof IdentityAlreadyRegistered) {
    // code === 'ALREADY_ONBOARDED' — dig/consumer maps to conflict / finished
    // e.holder, e.onchainId available; no new operator tx was submitted
    return;
  }
  if (e instanceof IdentityOperationFailed) {
    // ambiguous RPC (read_failed) or real write failure — do NOT treat as done
    throw e;
  }
  throw e;
}
```

Factory-linked deploy re-drive:

```ts
try {
  await irs.deployOnchainId({ holder }, executionConfig);
} catch (e) {
  if (e instanceof IdentityAlreadyRegistered) {
    // resume with e.onchainId — do NOT createIdentity again
  }
}
```

## Key Concepts

### Dig locks (binding)

1. **Reuse** `IdentityAlreadyRegistered` / `ALREADY_ONBOARDED` — no new code.
2. Adapters release class **MINOR** (2.6.0-class) — widened throw sites.
3. Typed `indeterminate` / mined-but-verify-timed-out — **OUT** of SF-5.

### MECHANISM vs CONVENTION (INV-31 / SC-004)

| Item | Class | Notes |
|------|-------|-------|
| Grant probe `has` → `IdentityAlreadyRegistered` before submit | **MECHANISM** | Runtime ternary + throw; execute never called |
| Deploy factory `found` → same throw before submit | **MECHANISM** | `getFactoryIdentity` eth_call |
| Ternary `read_failed` never collapses to already-onboarded or lacks/not_found | **MECHANISM** | Explicit branch; no-submit generic |
| Zero submit on has / found / read_failed arms | **MECHANISM** | Probe before `assemble*` / `execute` |
| Register already-onboarded throw preserved | **MECHANISM** | Non-regression (precedent shape) |
| Trusted-issuer already-trusted → noop **success** | **MECHANISM** | Intentional different pattern — not converted |
| Attach stays generic (no claim-exists reader) | **MECHANISM** (absence) | Honest generic > wrong specific |
| Pre-submit fidelity in **both** completion modes | **MECHANISM** | Submit-only does not skip the throw |
| Consumer HTTP map `ALREADY_ONBOARDED` → conflict | **CONVENTION** | Dig / consumer-owned |
| Saga retry policy after generic `read_failed` | **CONVENTION** | Host-owned |
| Residual Risk timeout indistinguishability | Named open — **not** closed by SF-5 | Still `IRS_OPERATION_FAILED` + INDETERMINATE prose |

### Probe outcomes (grant)

```text
lookupIdentityKeyPurpose → has        → IdentityAlreadyRegistered (no execute)
                         → read_failed → IdentityOperationFailed (no execute)
                         → lacks       → today's execute + SF-3 completion branch
```

### Probe outcomes (deploy)

```text
getFactoryIdentity → found       → IdentityAlreadyRegistered (no execute)
                   → read_failed → IdentityOperationFailed (no execute; do-not-retry-blind)
                   → not_found   → today's SF-2 execute + completion branch
```

Timeout / unresolvable / revert after submit remain `IdentityOperationFailed`
with existing messaging — **never** `ALREADY_ONBOARDED`.

## API Reference

See [api-reference.md](./api-reference.md).

## Integration Guide

See [integration-guide.md](./integration-guide.md).

## Safety

- **Do not guess on `read_failed`.** Ambiguous RPC is not already-onboarded and
  not lacks. Retry the probe or resume after RPC recovers; do not invent a
  specific code.
- **Do not retry blind on deploy timeout / unresolvable.** An identity may
  already exist; re-`createIdentity` can orphan the holder. Probe
  `getFactoryIdentity` first.
- **Catch `IdentityAlreadyRegistered` for recovery.** Consumers that only handled
  `IdentityOperationFailed` on re-drives will miss the intended conflict path.
- **Success semantics unchanged.** When probes allow the write (`lacks` /
  `not_found`), confirmed-path success shapes stay byte-identical to SF-1…SF-4.
- **Secrets:** error messages interpolate addresses / ids only — never
  `runtimeApiKey` or signer material.
- **Hard exclusions:** no `reference-implementations` edits; no npm publish from
  this docs stage.

## Related docs

- [SF-1 write completion](../write-completion/)
- [SF-2 deploy submit-only](../deploy-onchainid-submit-only/)
- [SF-3 grant submit-only](../irs-grant-submit-only/)
- [SF-4 write-completion matrix](../irs-write-completion-matrix/)

## License

Same as `@openzeppelin/adapter-evm-core` / repository root.
