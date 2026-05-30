# Phase 0 Research: RI POC Adapter Capabilities

**Feature**: `002-ri-evm-capabilities` | **Date**: 2026-05-29

All Technical Context items were resolved during `/speckit-clarify` (5 decisions) and codebase inspection. No `NEEDS CLARIFICATION` markers remain. This document consolidates the load-bearing decisions and their rationale.

## R1. Amount representation at the interface boundary

- **Decision**: All token/share amounts in the `@openzeppelin/ui-types` capability interfaces are base-unit decimal `string`. The viem-based factory converts `string ↔ bigint` internally.
- **Rationale**: JSON/serialization-safe (the RI plugin crosses HTTP/KV boundaries and its KV schema already stores "bigint as string"); portable to non-EVM chains (e.g. Stellar i128) without an interface change; keeps `viem`/`bigint` out of `@openzeppelin/ui-types` (Constitution II).
- **Alternatives considered**: native `bigint` in interfaces (rejected — not JSON-safe, leaks EVM-native shape, forces every consumer to serialize); `bigint | string` union (rejected — pushes normalization onto every consumer, weaker contract).

## R2. IRSCapability scope = all on-chain identity primitives

- **Decision**: `IRSCapability` owns deploy-ONCHAINID, idempotent trusted-issuer registration, attach-claim, `registerIdentity`, `getOnchainId`, `isVerified`, and jurisdiction reads. Multi-step onboarding *orchestration* stays in the consuming plugin's `/onboard` route.
- **Rationale**: §2e mandates that all chain mechanics live in the adapter so any backend reusing `/onboard` gets identical semantics. Each on-chain step is a discrete capability primitive; ordering/idempotency-policy is business logic.
- **Alternatives considered**: capability owns only `registerIdentity` + reads (rejected — ONCHAINID deploy and claim attachment are chain mechanics that would otherwise leak into the plugin); reads + `registerIdentity` only (rejected — same leak, larger).

## R3. Claim-signing boundary (issuer key never in the adapter)

- **Decision**: `attachClaim` accepts a pre-signed claim (`topic`, `scheme`, `data`, `signature`) and submits `addClaim`. The capability never holds/accepts/uses the trusted-issuer key. It MAY expose a pure, key-free helper that builds the canonical claim payload/digest for the consumer to sign.
- **Rationale**: The issuer key is "the root of the compliance story" (Identity Onboarding HLD); HLD §9 Q1 explicitly defers issuer-signer integration. Keeping signing out of the adapter avoids baking a key-custody decision into a shared library and keeps the capability strategy/transport-agnostic.
- **Alternatives considered**: capability signs via injected signer abstraction (rejected — premature; HLD defers this); capability signs with a key in config (rejected — puts sensitive material into adapter config).

## R4. Error model = typed error classes in ui-types

- **Decision**: Known on-chain failure conditions (recipient-not-verified, compliance-module-rejected, holder-frozen, etc.) are surfaced as typed error classes defined in `@openzeppelin/ui-types`, each with a stable code + structured details, thrown by write methods. Expected negative-but-not-failure outcomes are returned as values: `isVerified` → `false`; `simulateTransfer` → `{ allowed: false, blockingModule }`.
- **Rationale**: Mirrors the `AccessControlError` precedent (`access-control-errors.ts`: abstract base + 5 concrete classes). Gives the plugin an exhaustive, decodable mapping target for translating into `pluginError(code, …)` envelopes. Distinguishing "expected negative read" from "operation failure" prevents control-flow-by-exception.
- **Alternatives considered**: discriminated-union result objects everywhere (rejected — diverges from the AccessControl precedent, heavier for callers); plain `Error` + `code` string (rejected — loses structured details and `instanceof` ergonomics).

## R5. Tier classification + execution model (no wallet, no new primitive)

- **Decision**: All three are single **Tier 3** capabilities spanning RPC reads + execution-backed writes. Factories follow `createAccessControl(config, { signAndBroadcast })`: `NetworkConfig` + an injected `signAndBroadcast` callback. No `WalletCapability` dependency; reads run over RPC; writes delegate to the injected callback.
- **Rationale**: Verified against `packages/adapter-evm-core/src/capabilities/access-control.ts` — the factory takes exactly `(config, { signAndBroadcast })` and the service "delegates execution to a caller-provided callback, decoupling the service from wallet/signing infrastructure." This is what makes server-side, wallet-free consumption (the RI plugin inside the Relayer) work. The Plugin doc §2e tags reads as "Tier 2" and writes as "Tier 3" at the *operation* level; the repo's tier model classifies a capability by its highest tier (AccessControl is Tier 3 despite having reads), so each is one Tier 3 capability.
- **Alternatives considered**: Tier 3 with a `WalletCapability` dependency (rejected — breaks server-side use, contradicts the precedent); split read=Tier2/write=Tier3 capabilities (rejected — diverges from AccessControl, doubles surface for no benefit).

## R6. Async submit-then-poll fits the existing execution contract (FR-018 / spec Q5)

- **Finding (terminology precision)**: The Notion doc references `AdapterExecutionStrategy.signAndBroadcast` + `waitForTransactionConfirmation`. In the actual code these names live on **two** types:
  - `ExecutionCapability` (`@openzeppelin/ui-types`) has `signAndBroadcast(...)` **and** the optional `waitForTransactionConfirmation?(txHash): Promise<{ status: 'success' | 'error'; receipt?; error? }>` — i.e. the async submit-then-poll model already exists here.
  - `AdapterExecutionStrategy` (`adapter-evm-core/src/transaction/execution-strategy.ts`) has `execute(txData, config, walletImplementation, onStatusChange, runtimeApiKey): Promise<{ txHash }>` — wallet-bound, used by the EOA/Relayer strategies inside the existing `ExecutionCapability`.
  - The `AccessControlCapability` factory does **not** consume `AdapterExecutionStrategy` directly; it takes an injected `signAndBroadcast` callback `(transactionData, executionConfig, onStatusChange, runtimeApiKey) => Promise<{ txHash; result? }>`.
- **Decision**: The new capabilities follow the **AccessControl injected-callback pattern** (`{ signAndBroadcast }`), not the wallet-bound `AdapterExecutionStrategy.execute`. The async submit-then-poll model the RI plugin needs is already expressed by `ExecutionCapability.signAndBroadcast` + optional `waitForTransactionConfirmation`. The plugin's future `RelayerPluginExecutionStrategy` implements the injected `signAndBroadcast` callback (submitting in-process via `api.sendTransaction` and polling via `api.rpc`). **No new primitive is needed in `@openzeppelin/ui-types`.** FR-018 verification outcome: **CONFIRMED** — the optional `waitForTransactionConfirmation` accommodates submit-then-poll; the existing Relayer strategy is already async.
- **Action for implementation**: capability write methods accept the same injected `signAndBroadcast` shape as `CreateAccessControlOptions`; a test submit-then-poll callback validates the two-step flow (SC-006).

## R7. Packaging, sub-path exports, and tier isolation

- **Decision**: Add `erc3643`, `erc4626`, `irs` entries to `tsdown.config.ts` (both `adapter-evm-core` and `adapter-evm`) and `package.json` `exports` (in `adapter-evm`, matching the existing per-capability `{ types: { import, require }, import, require }` shape). `adapter-evm` gets thin `src/capabilities/{erc3643,erc4626,irs}.ts` re-export modules.
- **Rationale**: Identical to how `access-control` is wired (verified in both tsdown configs and `adapter-evm/package.json`). Sub-path exports give physical tier isolation; the new sub-paths MUST keep `react`/`wagmi` external and absent from the import graph (Constitution I/II, FR-015).
- **Verification**: `pnpm lint:adapters` (tier-isolation + export structure) and the repo's export/vite-config validation MUST pass; an import-graph assertion on the three sub-paths confirms zero React/Wagmi (SC-003).

## R8. ABI sourcing for T-REX / ERC-4626 / identity contracts

- **Decision**: Bundle the required ABIs inside `adapter-evm-core` (`src/<domain>/abi*`): T-REX token (ERC-3643), ERC-4626 vault, IRS / IdentityRegistry, ONCHAINID, Claim Topics & Issuers, Trusted Issuers Registry, Identity Verifier. Source from the canonical Tokeny T-REX + OpenZeppelin ERC-4626 + ONCHAINID releases (stable/public per v0.3 §7a — EVM modules are not under-review).
- **Rationale**: Consumers must not supply ABIs (FR-017); the capability is the home of "how the contract works." Pinning ABIs to released versions keeps decoding deterministic.
- **Alternatives considered**: consumer-supplied ABIs (rejected by FR-017); dynamic ABI fetch (rejected — server-side determinism, no network dependency at construction).
- **Action — pin ABI source versions (REQUIRED)**: Every bundled ABI MUST record its exact upstream source and version so decoding is reproducible and upgrades are auditable. Concretely:
  - Each ABI module (e.g. `src/<domain>/abi.ts` / `src/irs/abi/*.ts`) carries a header comment with the source repo, release tag/commit, and contract name it was extracted from (e.g. `// Source: @tokenysolutions/t-rep-contracts v4.x.y (tag/commit), contract Token`).
  - The package's Changeset entry for this feature lists the pinned versions, so a future ABI bump is a visible, intentional change (Constitution VII).
  - Where an upstream npm package provides the artifacts, pin it as an exact `devDependency` (no `^`) used to generate/refresh the bundled ABI, rather than copy-paste without provenance.
  - A short note in `adapter-evm-core`'s README/ABI directory documents the refresh procedure (which upstream version → which bundled file).
- **Rationale (pinning)**: ABI drift silently breaks calldata encoding/decoding and is painful to debug in production; explicit, version-stamped provenance makes the blast radius of any contract upgrade obvious and keeps the three capabilities and the RI plugin in lockstep with a known on-chain ABI.

## R9. Cross-repository release sequence

- **Decision**: Publish `@openzeppelin/ui-types` first (new interfaces/types/errors — MINOR), then `@openzeppelin/adapter-evm-core` and `@openzeppelin/adapter-evm` (implementations — MINOR), each with a Changeset. Additive only; no breaking changes to existing exports.
- **Rationale**: Matches the established sequence from the `001-capability-adapters` rollout and Constitution VII; adapters depend on the published types. The RI plugin then consumes the published (or pre-release) packages.
