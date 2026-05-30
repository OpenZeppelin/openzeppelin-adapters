# Contract: `IRSCapability`

**Tier**: 3 | **Defined in**: `@openzeppelin/ui-types` | **Implemented in**: `@openzeppelin/adapter-evm-core` (`createIRS`), re-exported by `@openzeppelin/adapter-evm/irs`

Wraps the Identity Registry Storage (IRS) and ONCHAINID identity infrastructure. Owns all on-chain identity primitives; the consuming plugin orchestrates onboarding ordering. The capability **never holds or uses the trusted-issuer key** — it submits pre-signed claims. Extends `RuntimeCapability`.

## Interface (shape contract)

```ts
interface IRSCapability extends RuntimeCapability {
  // ---- Reads ----
  getOnchainId(holder: string): Promise<OnchainIdLookup>;   // { found: false } when none — no throw
  isVerified(holder: string): Promise<boolean>;             // the IRS pre-check; false (not throw) when unregistered
  getJurisdiction(holder: string): Promise<string | undefined>;

  // ---- Pure helper (no key, no execution) ----
  buildClaimPayload(input: { onchainId: string; topic: string; scheme: number; data: string }): ClaimPayload;

  // ---- Writes (via injected signAndBroadcast) ----
  deployOnchainId(
    input: { holder: string },
    executionConfig: ExecutionConfig,
    onStatusChange?: (status: TxStatus, details: TransactionStatusUpdate) => void,
    runtimeApiKey?: string
  ): Promise<OperationResult & { onchainId: string }>;
  registerTrustedIssuer(input: { issuer: string; topics: string[] }, executionConfig: ExecutionConfig, onStatusChange?, runtimeApiKey?): Promise<OperationResult>; // idempotent
  attachClaim(input: { onchainId: string; claim: OnboardingClaim }, executionConfig: ExecutionConfig, onStatusChange?, runtimeApiKey?): Promise<OperationResult>;     // pre-signed
  registerIdentity(input: IdentityRegistration, executionConfig: ExecutionConfig, onStatusChange?, runtimeApiKey?): Promise<OperationResult>;
}
```

## Factory contract

```ts
function createIRS(
  config: NetworkConfig,
  options: { signAndBroadcast: SignAndBroadcast }
): IRSCapability;
```
- Mirrors `createAccessControl(config, { signAndBroadcast })`. No `WalletCapability` dependency; no issuer-key parameter anywhere. `dispose()` idempotent.

## Behavioral guarantees

| ID | Guarantee |
|----|-----------|
| IR-1 | `isVerified(holder)` returns `true` for a registered holder, `false` for unregistered (the IRS pre-check) — never throws for the negative case. |
| IR-2 | `getOnchainId` returns `{ found: false }` (not a throw) when no identity exists; `{ found: true, onchainId }` otherwise. |
| IR-3 | `attachClaim` accepts a pre-signed `OnboardingClaim` and submits `addClaim`; the capability neither accepts nor uses the issuer key. |
| IR-4 | `buildClaimPayload` is pure and key-free: same inputs → same `ClaimPayload.digest`, no RPC, no signing. |
| IR-5 | `deployOnchainId`, `registerTrustedIssuer` (idempotent), `attachClaim`, `registerIdentity` build correct calldata and submit via injected `signAndBroadcast`. |
| IR-6 | Identity writes are idempotent on retry (support partial-failure recovery); `registerIdentity` on an already-registered holder maps to `IdentityAlreadyRegistered`. |
| IR-7 | Imported via `@openzeppelin/adapter-evm/irs` in Node: constructs and runs `isVerified` with no React/Wagmi in the import graph. |
| IR-8 | IRS pre-check behavioral tests live in the adapter repo's suite (not the plugin's). |

## Maps to

Spec: US2, FR-008, FR-008a, FR-009–FR-016, FR-019. Plugin routes: `/onboard` (orchestration), `/mint` & `/transfer` (pre-check via `isVerified`).
