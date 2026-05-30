# Quickstart: RI POC Adapter Capabilities

**Feature**: `002-ri-evm-capabilities` | **Date**: 2026-05-29

This shows how a server-side consumer (the Tokenized Deposits RI plugin) uses the three new capabilities once shipped. It mirrors the existing `AccessControlCapability` usage exactly: import from a sub-path, construct with `(config, { signAndBroadcast })`, call reads/writes. No wallet, no React.

## 1. Install (consumer)

```bash
pnpm add @openzeppelin/adapter-evm @openzeppelin/ui-types
```

## 2. Provide a `signAndBroadcast` callback

The plugin supplies its own execution strategy (e.g. a `RelayerPluginExecutionStrategy` that submits in-process and polls). The callback shape matches `CreateAccessControlOptions.signAndBroadcast`:

```ts
import type { ExecutionConfig, TransactionStatusUpdate } from '@openzeppelin/ui-types';

const signAndBroadcast = async (
  transactionData: unknown,
  executionConfig: ExecutionConfig,
  onStatusChange: (status: string, details: TransactionStatusUpdate) => void,
  runtimeApiKey?: string
): Promise<{ txHash: string; result?: unknown }> => {
  // plugin: api.sendTransaction(...) then poll api.rpc(...) → final hash (submit-then-poll)
  return { txHash };
};
```

## 3. Construct capabilities (server-side, wallet-free)

```ts
import { createERC3643 } from '@openzeppelin/adapter-evm/erc3643';
import { createERC4626 } from '@openzeppelin/adapter-evm/erc4626';
import { createIRS } from '@openzeppelin/adapter-evm/irs';

const token = createERC3643(networkConfig, { signAndBroadcast });
const vault = createERC4626(networkConfig, { signAndBroadcast });
const irs = createIRS(networkConfig, { signAndBroadcast });
```

## 4. Reads (RPC only)

```ts
const balance = await token.balanceOf(holder);        // "1000000000000000000" (base-unit string)
const verified = await irs.isVerified(holder);        // false (no throw) when unregistered
const sim = await token.simulateTransfer({ from, to, amount: '500' });
// sim → { allowed: true, modulesEvaluated: 3 } | { allowed: false, blockingModule: '...' }
const assets = await vault.convertToAssets('250');     // base-unit string
```

## 5. Writes (via injected callback)

```ts
import { ExecutionMethod } from '@openzeppelin/ui-types';

const execCfg: ExecutionConfig = { method: ExecutionMethod.RELAYER /* plugin-specific */ };

const res = await token.mint({ to: holder, amount: '1000' }, execCfg);   // → { id: txHash }
await vault.deposit({ from: holder, amount: '500' }, execCfg);
```

## 6. Onboarding (plugin orchestrates; capability owns primitives)

```ts
// 1) deploy identity contract
const { onchainId } = await irs.deployOnchainId({ holder }, execCfg);
// 2) idempotent trusted-issuer registration
await irs.registerTrustedIssuer({ issuer, topics: ['KYC'] }, execCfg);
// 3) build the digest, sign OUTSIDE the adapter with the issuer key, then attach
const payload = irs.buildClaimPayload({ onchainId, topic: 'KYC', scheme: 1, data });
const signature = await pluginIssuerSigner.sign(payload.digest);   // consumer-owned key
await irs.attachClaim({ onchainId, claim: { topic: 'KYC', scheme: 1, data, signature } }, execCfg);
// 4) register holder ↔ identity
await irs.registerIdentity({ holder, onchainId, country: 840 }, execCfg);
```

## 7. Error handling (typed)

```ts
import { RecipientNotVerified, ComplianceModuleRejected } from '@openzeppelin/ui-types';

try {
  await token.transfer({ from, to, amount: '100' }, execCfg);
} catch (err) {
  if (err instanceof RecipientNotVerified) return pluginError(err.code, { holder: err.holder });
  if (err instanceof ComplianceModuleRejected) return pluginError(err.code, { module: err.blockingModule });
  throw err;
}
```

## Validation checklist (maps to spec Success Criteria)

- [ ] **SC-001/SC-002**: Each capability imports from its sub-path and constructs with `(config, { signAndBroadcast })` — no wallet, no compile-time UI dep. (Steps 3–5)
- [ ] **SC-003 / FR-015**: `@openzeppelin/adapter-evm/{erc3643,erc4626,irs}` resolve in plain Node with zero React/Wagmi in the import graph.
- [ ] **SC-004 / FR-003a**: Every amount in/out is a base-unit decimal `string`. (Steps 4–5)
- [ ] **SC-005 / R4**: Known write failures throw typed errors with stable `code`. (Step 7)
- [ ] **SC-006 / FR-018**: Writes complete against a submit-then-poll `signAndBroadcast` with no capability change. (Step 2)
- [ ] **IRS pre-check**: `irs.isVerified` returns `true`/`false`; behavioral tests live in the adapter repo.
- [ ] **No issuer key in adapter**: `attachClaim` only ever receives a pre-signed claim. (Step 6)
- [ ] `pnpm lint:adapters`, `pnpm test`, `pnpm typecheck`, `pnpm build` pass in `openzeppelin-adapters`; `@openzeppelin/ui-types` builds with the new exports.
