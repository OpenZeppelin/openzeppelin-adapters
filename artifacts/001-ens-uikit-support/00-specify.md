---
stage: specify
project: ens-uikit-support
repo: openzeppelin-adapters
mode: extension
status: draft
timestamp: 2026-07-03
author: aleksandr.pasevin
previous_stage: null
tags: [ens, name-resolution, capability, evm, adapter, ccip-read, conformance, cross-repo]
related_initiatives:
  - repo: openzeppelin-ui
    path: artifacts/001-ens-uikit-support
    role: Owns the TYPE SHAPE — the `NameResolutionCapability` interface, value types (`ResolutionProvenance`, `ResolvedName`, `ResolvedAddress`, `ResolutionResult`), and the closed `NameResolutionError` union in `@openzeppelin/ui-types` (locked & shipped as UIKit SF-1), plus the React hooks / validation / display / address-book / v2-UX consumers (UIKit SF-2..SF-6). This repo implements the primitives that back that shape.
---

# ENS + ENS v2 Adapter Support — Repo Specification

## Summary _(mandatory)_

This repo implements the on-chain / gateway ENS name-resolution primitives that back the UIKit's `NameResolutionCapability`. The UIKit repo owns the type shape (locked & shipped as UIKit SF-1); this repo owns the EVM implementation: forward resolution (name → address), reverse resolution (address → name with a trustworthy `forwardVerified` flag and optional avatar), the native-error → typed-union mapping that guarantees expected failures never throw, ENS v2 (CCIP-Read / Namechain / cross-chain) support with an EVM-specific provenance extension type and type guard, and a parameterized adapter conformance harness that proves any adapter honors the contract. The prioritized story shape is P1 (forward resolution — the MVP backing the UIKit's own P1), P2 (reverse resolution + the conformance harness), and P3 (ENS v2 + provenance extension).

## Within-Repo Scope _(mandatory)_

- **In scope (this repo):**
  - EVM implementation of `NameResolutionCapability` in `@openzeppelin/adapter-evm-core` (capability file alongside `src/capabilities/addressing.ts`): the required synchronous `isValidName` shape check, forward `resolveName`, and reverse `resolveAddress`.
  - Reverse-resolution semantics: `forwardVerified` reported as a concrete boolean (forward-verification of `forward(name) === address`) and an optional `avatarUrl`.
  - A reusable native-error → `NameResolutionError` mapping layer (viem / RPC / gateway / timeout → the closed 7-code union), so every expected failure path returns `{ ok: false }` and never throws.
  - ENS v2 support (CCIP-Read / Namechain / cross-chain), an EVM-specific `EnsProvenance` extension type, and an `isEnsProvenance` type guard — both exported from `@openzeppelin/adapter-evm-core` for downstream narrowing.
  - A parameterized, adapter-agnostic conformance test harness (home: `@openzeppelin/adapter-runtime-utils`) that any `NameResolutionCapability` implementation runs against to prove contract compliance.
- **Out of scope (other repos / future phases):**
  - The capability type shape itself — the interface, value types, and error union live in `@openzeppelin/ui-types` and are owned by the UIKit initiative (UIKit SF-1, already locked & shipped). This repo implements against them and does not modify them.
  - React hooks, input validation, address-display components, AddressBookWidget integration, and v2 UX plumbing — all owned by the UIKit initiative (UIKit SF-2..SF-6).
  - Non-EVM name systems (SNS on Solana, Unstoppable Domains, `.sui`, Aptos names) — non-EVM adapters (`adapter-solana`, `adapter-midnight`, `adapter-polkadot`, `adapter-stellar`) omit the capability entirely; they MUST NOT break. Normalizing other name systems under the same capability is a follow-up initiative.
  - The `provenance.external` → v2-mechanism semantic boundary — deliberately left to the UIKit dev's decision at their SF-6 Design (see Open Questions).

## User Stories _(mandatory)_

### US-1: Integrator resolves an ENS name to an address via the EVM adapter (Priority: P1)

As a UIKit / dapp integrator wiring an EVM network, I can call the adapter's name-resolution capability to turn an ENS name (e.g. `alice.eth`) into a hex address, cheaply pre-check whether an input even looks like a name (`isValidName`), and receive a typed result — a resolved address with provenance on success, or a distinct typed error code on failure — so the UIKit's address-input path can accept ENS names without any bespoke ENS code in the consumer.

**Why this priority:** Forward resolution is the single most user-valuable ENS primitive and the direct backing for the UIKit's own P1 MVP (UIKit SF-3 — high stakes, their highest external priority). A wrong forward resolution sends funds to the wrong address, so correctness here is the whole point. It stands alone: an adapter that only forward-resolves already lets a dapp accept ENS names on input, even before reverse, conformance, or v2 exist.

**Independent Test:** Point the EVM adapter at a mainnet fork (or a mocked viem public client), call `resolveName('vitalik.eth')`, and confirm it returns `{ ok: true, value: { address: '0xd8dA6BF…', provenance: … } }`; call `isValidName('vitalik.eth')` → `true` and `isValidName('0xabc…')` → `false`; call `resolveName` on a nonexistent name and confirm it returns `{ ok: false, error: { code: 'NAME_NOT_FOUND', … } }` rather than throwing. Delivers value even without US-2 / US-3 / US-4.

**Sub-features needed:** SF-1, SF-2

---

### US-2: Integrator reverse-resolves an address to a trustworthy name (+ avatar) (Priority: P2)

As a UIKit / dapp integrator, I can call the adapter to turn a hex address into the ENS name it reverse-resolves to, receive a concrete `forwardVerified` boolean telling me whether the adapter confirmed the name forward-resolves back to that address, and receive an optional avatar URL — so the UIKit display layer can render names instead of hex without risk of rendering a spoofed (forward-mismatched) name as if it were verified.

**Why this priority:** Reverse resolution backs the UIKit display path (UIKit SF-4) and is a high-legibility win, but it is not a correctness prerequisite for the input MVP — a dapp that forward-resolves on input (US-1) but shows hex on display is still usable. Reverse also carries the forward-mismatch spoofing hazard (a reverse record pointing to a name whose forward record points elsewhere), so the adapter's obligation to report `forwardVerified` honestly is the crux and warrants its own slice after forward is proven.

**Independent Test:** With the EVM adapter on a fork, call `resolveAddress` on an address with a valid, forward-consistent reverse record and confirm `{ ok: true, value: { name, forwardVerified: true, avatarUrl?, provenance } }`; call it on an address whose reverse record does not forward-verify and confirm `forwardVerified: false`; call it on an address with no reverse record and confirm `{ ok: false, error: { code: 'ADDRESS_NOT_FOUND', … } }`.

**Sub-features needed:** SF-1, SF-3

---

### US-3: Integrator (and the UIKit team) can prove any adapter honors the capability contract (Priority: P2)

As an adapter author (or the UIKit team consuming an adapter), I can run a single parameterized conformance harness against any `NameResolutionCapability` implementation and get a pass/fail verdict on the contract obligations that only an adapter can satisfy — `forwardVerified` is always a concrete boolean, expected failures return `ok: false` and never throw, deterministic inputs under stable state return structurally-equal results, and `provenance.label` is user-safe — so a broken adapter cannot silently ship and the UIKit's cross-adapter guarantees become enforceable against a real implementation.

**Why this priority:** This is this repo's commitment back to the UIKit: it makes the UIKit's SC-004 (no silent coercion of unresolved names) and SC-006 (graceful degradation) enforceable rather than aspirational. It is P2 because it can only be built once both resolution directions exist to exercise, and the resolution primitives themselves deliver value before the harness formalizes their guarantees.

**Independent Test:** Instantiate the harness against the EVM adapter and confirm all four invariant families pass; then feed it a deliberately-broken stub adapter (one that throws on `NAME_NOT_FOUND`, or returns `forwardVerified: undefined`, or emits a URL as `label`) and confirm the harness fails it with a clear per-invariant message.

**Sub-features needed:** SF-4

---

### US-4: Integrator resolves ENS v2 names with narrowable EVM provenance (Priority: P3)

As a UIKit / dapp integrator, I can resolve ENS v2 names (via CCIP-Read off-chain gateway, Namechain L2 registry, or other cross-chain paths) through the same capability, receive an EVM-specific `EnsProvenance` on the result, and narrow to it downstream via an exported `isEnsProvenance` type guard — so v2 names resolve correctly (including chain-scoped addresses), v2 gateway failures surface as distinct typed errors, and v2 provenance is programmatically distinguishable without string-matching a display label.

**Why this priority:** ENS v2 adoption is still ramping in 2026; graceful v1 handling remains the majority case. But a v2 name that silently fails is worse than no ENS support, so v2 cannot be ignored. It is P3 because it layers additively on the v1 forward pipeline and the error-mapping foundation, and it backs the UIKit's last sub-feature (UIKit SF-6).

**Independent Test:** With the EVM adapter configured for v2, resolve a name known to resolve only via CCIP-Read and confirm success with a result whose provenance narrows true under `isEnsProvenance` and carries the v2 discriminators; simulate an unreachable gateway and confirm `{ ok: false, error: { code: 'EXTERNAL_GATEWAY_ERROR', … } }` (never a silent v1 fallback); confirm a chain-scoped result carries `scopedToNetworkId`.

**Sub-features needed:** SF-5

---

## Sub-Features _(mandatory)_

### SF-1: Native-error → NameResolutionError mapping

**Purpose:** A reusable mapping layer that converts native failures raised by the underlying resolution transport (client exceptions, RPC errors, gateway responses, timeouts) into the closed seven-code `NameResolutionError` union, so that every expected failure path across the capability returns a typed `{ ok: false }` result and never throws. It is the single place the "never throw for expected failures" contract is centralized, consumed by the forward, reverse, and v2 paths alike; only genuine programmer errors are allowed to propagate as thrown errors.

- **Language:** typescript
- **Work-type:** service
- **Stakes:** Medium
- **Delivers user story:** US-1, US-2, US-4
- **Depends on:** none (root of DAG)
- **Pipeline invocation:** `dev3 --languages=typescript --work-types=service`

**Acceptance Scenarios:**

1. **Given** a native error representing "no record exists for this name,"
   **When** it passes through the mapping layer,
   **Then** the layer returns the `NAME_NOT_FOUND` variant with its required payload, and the caller receives an `{ ok: false }` result rather than a thrown exception.

2. **Given** a native transport timeout and, separately, an off-chain gateway failure,
   **When** each passes through the mapping layer,
   **Then** the former maps to `RESOLUTION_TIMEOUT` and the latter to `EXTERNAL_GATEWAY_ERROR` — distinct codes — and any unrecognized/unclassifiable native error maps to `ADAPTER_ERROR` carrying the underlying value as an opaque cause, never surfacing an invented code outside the closed union.

---

### SF-2: Forward resolution + capability scaffold + isValidName

**Purpose:** Implements the `NameResolutionCapability` for EVM in `@openzeppelin/adapter-evm-core` (alongside the existing `addressing.ts` capability), providing the required synchronous `isValidName` shape check and the forward `resolveName` (name → address) path, returning a typed result carrying the resolved address plus base provenance, and registering the capability factory in the EVM runtime so consumers obtain it through the standard capability seam. This is the correctness core of the input path: a wrong forward result is a fund-safety failure.

- **Language:** typescript
- **Work-type:** service
- **Stakes:** High — a wrong forward resolution sends funds to the wrong address (fund-loss risk analogous to UIKit SF-3).
- **Delivers user story:** US-1
- **Depends on:** SF-1
- **Pipeline invocation:** `dev3 --languages=typescript --work-types=service`

**Acceptance Scenarios:**

1. **Given** the EVM adapter on a network whose registry holds a forward record for `alice.eth`,
   **When** a consumer calls `resolveName('alice.eth')`,
   **Then** the capability returns an `{ ok: true }` result carrying the correct hex address and a base provenance record, and a prior `isValidName('alice.eth')` returns `true` while `isValidName` on a raw hex string returns `false`.

2. **Given** the same adapter,
   **When** a consumer calls `resolveName` on a name with no forward record (and, separately, on a network where resolution is unsupported),
   **Then** the capability returns `{ ok: false }` with `NAME_NOT_FOUND` (respectively `UNSUPPORTED_NETWORK`) — never a thrown error and never a coerced/placeholder address.

3. **Given** a non-EVM adapter in the same workspace that does not implement the capability,
   **When** the workspace is type-checked and built,
   **Then** it continues to compile and its runtime is unaffected — the new capability is additive and optional at the runtime-map level.

---

### SF-3: Reverse resolution + forward-verification + avatar

**Purpose:** Adds the reverse `resolveAddress` (address → name) path to the EVM capability, reporting `forwardVerified` as a concrete boolean that reflects whether the adapter confirmed the resolved name forward-resolves back to the queried address, and surfacing an optional avatar URL when available. Expected misses (no reverse record) return a typed `{ ok: false }`. The honest reporting of `forwardVerified` is the anti-spoofing crux the UIKit display layer depends on.

- **Language:** typescript
- **Work-type:** service
- **Stakes:** High — mis-reporting `forwardVerified` (claiming verified when it is not) lets the UI render a spoofed name as trusted, a display-layer identity/fund hazard (UIKit INV-6 is Critical).
- **Delivers user story:** US-2
- **Depends on:** SF-1, SF-2 (reuses the forward path to perform forward-verification)
- **Pipeline invocation:** `dev3 --languages=typescript --work-types=service`

**Acceptance Scenarios:**

1. **Given** an address whose reverse record resolves to a name that forward-resolves back to the same address,
   **When** a consumer calls `resolveAddress(address)`,
   **Then** the capability returns `{ ok: true }` with the name, `forwardVerified: true`, an `avatarUrl` when the adapter surfaces one, and provenance.

2. **Given** an address whose reverse record resolves to a name whose forward record points to a *different* address (forward-mismatch),
   **When** a consumer calls `resolveAddress(address)`,
   **Then** the capability still returns the name but with `forwardVerified: false` — the field is always a concrete boolean, never `undefined` — leaving the render decision to the consumer.

3. **Given** an address with no reverse record,
   **When** a consumer calls `resolveAddress(address)`,
   **Then** the capability returns `{ ok: false }` with `ADDRESS_NOT_FOUND` rather than throwing.

---

### SF-4: Adapter conformance test harness

**Purpose:** A parameterized, adapter-agnostic conformance suite (home: `@openzeppelin/adapter-runtime-utils`) that takes any `NameResolutionCapability` implementation and asserts the contract obligations only an adapter can satisfy: `forwardVerified` is always a concrete boolean, every expected failure returns `ok: false` and never throws, deterministic inputs under stable underlying state return structurally-equal results (this repo defines the deep-equal-under-cache-TTL semantics), and `provenance.label` is user-safe (this repo defines the allowlist). It is the reusable gate that other adapters (`adapter-solana`, `adapter-midnight`, and beyond) run later, and the mechanism that makes the UIKit's cross-adapter success criteria enforceable against a real adapter.

- **Language:** typescript
- **Work-type:** service
- **Stakes:** High — it defines novel correctness semantics (cache-TTL deep-equal, the label allowlist) and is the enforceable fund-safety gate; a false pass here is itself a fund-safety hole because it lets a broken adapter ship unnoticed.
- **Delivers user story:** US-3
- **Depends on:** SF-2, SF-3 (needs both resolution directions to exercise; relies on SF-1's mapping for the never-throw checks)
- **Pipeline invocation:** `dev3 --languages=typescript --work-types=service`

**Acceptance Scenarios:**

1. **Given** the conformance harness pointed at the compliant EVM adapter,
   **When** the suite runs,
   **Then** all four invariant families (concrete-boolean `forwardVerified`, never-throw expected failures, deterministic-under-stable-state idempotency, user-safe `label`) pass, and re-running with identical inputs and stable state yields identical structural results.

2. **Given** a deliberately non-compliant stub adapter (throws on an expected failure, or returns `forwardVerified: undefined`, or emits a URL / internal identifier as `label`),
   **When** the suite runs against it,
   **Then** the harness fails it with a distinct, per-invariant failure message identifying which obligation was violated — no false pass.

---

### SF-5: ENS v2 (CCIP-Read / Namechain / cross-chain) + EnsProvenance + isEnsProvenance

**Purpose:** Extends the EVM capability to resolve ENS v2 names through CCIP-Read off-chain gateways, Namechain L2 registry, and other cross-chain paths, introduces the EVM-specific `EnsProvenance` extension type carried on v2 results and the `isEnsProvenance` type guard for downstream narrowing (both exported from `@openzeppelin/adapter-evm-core`), and routes v2-specific failures through the error-mapping layer as distinct typed errors. Chain-scoped resolutions carry the network scope so the consumer can bind the address to the correct chain. This is the additive v2 layer on top of the v1 forward pipeline; it backs the UIKit's last sub-feature.

- **Language:** typescript
- **Work-type:** service
- **Stakes:** High — a wrong v2 resolution carries the same fund-loss risk as v1 forward, and mishandling chain-scoped addresses can bind a result to the wrong chain (analogous to UIKit SF-6).
- **Delivers user story:** US-4
- **Depends on:** SF-1, SF-2
- **Pipeline invocation:** `dev3 --languages=typescript --work-types=service`

**Acceptance Scenarios:**

1. **Given** an ENS name that resolves only via CCIP-Read,
   **When** a consumer calls `resolveName` on it,
   **Then** resolution succeeds with an `{ ok: true }` result whose provenance narrows to `EnsProvenance` under `isEnsProvenance` and carries the v2 discriminators, and a chain-scoped result additionally carries its network scope.

2. **Given** a v2 resolution attempt where the CCIP-Read gateway is unreachable,
   **When** the timeout / failure elapses,
   **Then** the capability returns `{ ok: false }` with `EXTERNAL_GATEWAY_ERROR` (distinct from `NAME_NOT_FOUND`) — never a silent fallback to a stale v1-only result — and `isEnsProvenance` remains the sole supported narrowing path (no `label` string-matching).

---

## Within-Repo Dependency DAG _(mandatory)_

```text
                    ┌─────────────┐
                    │    SF-1     │  error-taxonomy mapping (service)
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │    SF-2     │  forward + capability scaffold + isValidName (service)
                    └───┬─────┬───┘
                        │     │
              ┌─────────┘     └───────────┐
              ▼                           ▼
       ┌─────────────┐             ┌─────────────┐
       │    SF-3     │             │    SF-5     │  ENS v2 + EnsProvenance
       │  reverse +  │             │  + guard    │  (service)
       │  fwd-verify │             └─────────────┘
       └──────┬──────┘
              │
              ▼
       ┌─────────────┐
       │    SF-4     │  conformance harness (service)
       └─────────────┘
       (also depends on SF-1's mapping for the never-throw checks)
```

DAG is acyclic. SF-5 (v2) branches off SF-2 in parallel with SF-3 — it needs the forward pipeline and the error mapping, not reverse. SF-4 (conformance) sits after SF-3 because it must exercise both resolution directions.

## Recommended Build Order _(mandatory)_

Topological sort, with ties broken by the cross-repo unblocking sequence:

1. **SF-1 (error-taxonomy mapping)** — root of the DAG; forward, reverse, and v2 all reuse it and it centralizes the never-throw contract.
2. **SF-2 (forward + scaffold + isValidName)** — land as early as possible: it unblocks UIKit SF-3, the UIKit's P1 MVP and highest external priority.
3. **SF-3 (reverse + forward-verify + avatar)** — unblocks UIKit SF-4.
4. **SF-4 (conformance harness)** — land with / just after SF-3, so the UIKit consumes a verified adapter across UIKit SF-2..SF-5.
5. **SF-5 (ENS v2 + provenance extension + guard)** — last; additive on the v1 forward pipeline, unblocks UIKit SF-6.

Note: SF-5 has no dependency on SF-3 or SF-4, so once SF-2 is stable it can proceed in parallel with SF-3/SF-4 if capacity allows — but its external consumer (UIKit SF-6) is last in the UIKit's own order, so it is sequenced last here.

## Build Status _(mandatory)_

|       | Research | Design | Invariants | Code | Tests | Docs |
|-------|----------|--------|------------|------|-------|------|
| SF-1  | n/a      | ⏸️     | ⏸️         | ⏸️   | ⏸️    | n/a  |
| SF-2  | ⏸️       | ⏸️     | ⏸️         | ⏸️   | ⏸️    | ⏸️   |
| SF-3  | ⏸️       | ⏸️     | ⏸️         | ⏸️   | ⏸️    | ⏸️   |
| SF-4  | ⏸️       | ⏸️     | ⏸️         | ⏸️   | ⏸️    | ⏸️   |
| SF-5  | ⏸️       | ⏸️     | ⏸️         | ⏸️   | ⏸️    | ⏸️   |

**Legend:** ✅ done · ⏳ in progress · ⏸️ not started · `n/a` stage skipped per stakes

**Filling rule:** Replace ⏸️ with `n/a` for any stage a sub-feature deliberately skips per its `stakes` setting (Low = Research / Invariants / Docs are `n/a`; Medium = Research / Docs are `n/a`; High = all stages run). The per-slice stages flip cells from ⏸️ → ⏳ on entry and ⏳ → ✅ on completion. (SF-1 is Medium → Research & Docs are `n/a`; SF-2 / SF-3 / SF-4 / SF-5 are High → all stages run.)

**Last update:** *2026-07-03 — Initial Specify run; no per-slice stages started yet.*

**Currently:** *Spec drafted, pending dev approval gate (via Orchestrator). First eligible stage: SF-1 Design (Medium stakes → Research skipped). SF-2 Research is eligible in parallel once SF-1's error-union mapping shape is settled.*

## Success Criteria _(mandatory)_

- **SC-001**: An integrator wiring the EVM adapter can forward-resolve a well-known ENS name to the correct hex address through the capability with no bespoke ENS code in the consumer — verified against a public test set (e.g. `vitalik.eth`, `nick.eth`, top-100 registrations) with ≥95% forward-resolving correctly in an integration environment.
- **SC-002**: 100% of expected failure paths (name not found, address not found, unsupported network, unsupported name, timeout, external-gateway error) return a typed `{ ok: false }` with a distinct code from the closed seven-code union — zero expected failures propagate as thrown exceptions, verified by the conformance harness.
- **SC-003**: Every `resolveAddress` result carries `forwardVerified` as a concrete boolean (never `undefined`), verified by the conformance harness across compliant and non-compliant adapters.
- **SC-004**: The conformance harness fails every deliberately non-compliant adapter it is fed (throw-on-expected-failure, `undefined` `forwardVerified`, non-user-safe `label`, non-deterministic-under-stable-state) with a per-invariant message, and passes the compliant EVM adapter — a 100% detection rate on the seeded-defect set.
- **SC-005**: ENS v2 provenance on a v2 result narrows correctly under `isEnsProvenance` (type guard returns `true` for v2 results and `false` for base/non-EVM provenance), and no consumer needs to string-match `provenance.label` to detect v2.
- **SC-006**: The non-EVM adapters (`adapter-solana`, `adapter-midnight`, `adapter-polkadot`, `adapter-stellar`) continue to type-check, build, and pass their existing tests unchanged after this initiative lands — zero regressions, the capability being additive and optional at the runtime-map level.

## Assumptions _(mandatory if any defaults were taken; remove section if none)_

- **Integration is local workspace-linking, not npm publish.** There is no publish/consume step during development. The UIKit repo ships `pnpm dev:local` (backed by `oz-ui-dev use local --family adapters` in its `packages/dev-cli`) which points a consumer app at both local checkouts (`../openzeppelin-adapters` + the UIKit repo) via `.openzeppelin-dev.json` + a `.pnpmfile.cjs` hook. Both repos run their full pipelines against local-linked integration; a single joint npm publish of both packages happens only after the full UIKit stack is dev-tested end-to-end. (Settled with the dev.)
- **The conformance suite is owned by this repo**, with a proposed home of `@openzeppelin/adapter-runtime-utils`. It covers the adapter-side contract invariants the UIKit SF-1 invariants doc could not self-enforce: UIKit INV-6 (`forwardVerified` always a concrete boolean), UIKit INV-8 (expected failures return `ok: false`, never throw), UIKit INV-12 (deterministic-input-under-stable-state idempotency, including the deep-equal-under-cache-TTL semantics this repo defines), and UIKit INV-16 (user-safe `provenance.label` — this repo defines the allowlist). This is this repo's commitment back to the UIKit, making UIKit SC-004 / SC-006 enforceable against a real adapter. (Settled with the dev.)
- **ENS v1 and v2 both live in `@openzeppelin/adapter-evm-core`** — the capability file sits alongside `src/capabilities/addressing.ts`. There is definitively no new `adapter-evm-ens-v2` package. The `EnsProvenance` type and `isEnsProvenance` guard are exported from `@openzeppelin/adapter-evm-core`; the UIKit's SF-6 imports them from there. (Settled with the dev.)
- **`scopedToNetworkId` values use this repo's internal `NetworkConfig.networkId` namespace.** If a concrete case forces CAIP-2 (or a similar external namespace) instead, that is a drift note to raise at the relevant sub-feature's Design stage — not a default taken here. (Settled with the dev.)
- **`@openzeppelin/ui-types` provides the locked shape as a workspace/peer dependency (currently `^3.1.0`).** This repo implements against UIKit SF-1's exported interface, value types, and error union without modifying them; a downstream types-package minor bump (post UIKit SF-1) is consumed via the local-linking flow above, not a published release, during development.
- **ENS support targets EVM adapters only for this initiative.** Non-EVM adapters omit the capability entirely (optional at the runtime-map level) and must not break. Other name systems (SNS, Unstoppable, `.sui`, Aptos) are follow-up initiatives.
- **All sub-features are `work-type: service`.** These are headless off-chain primitives (viem / RPC / gateway integration and a test harness library), not UI. The adapter's React glue is not in scope for this initiative — UI consumption lives in the UIKit repo.
- **Stakes rationale** — SF-2, SF-3, SF-5 are High because a wrong resolution (or a mis-reported `forwardVerified`) carries fund-loss / spoofing risk; SF-4 is High because it defines novel correctness semantics and is the enforceable fund-safety gate (and a cross-adapter reusable artifact, so Docs earns its place). SF-1 is Medium — a miscoded error is observable and recoverable, not fund-loss — but above Low because it centralizes the never-throw contract every other SF relies on.

## Edge Cases _(include if any non-obvious cases exist; remove otherwise)_

- **Forward / reverse record mismatch** — a reverse record points to `alice.eth`, but `alice.eth`'s forward record points to a *different* address. The adapter must report `forwardVerified: false` (SF-3 scenario 2); it must never report `true` for a mismatch.
- **Chain-scoped v2 addresses** — an ENS v2 name resolves to an address only meaningful on an L2. The result's provenance must carry the network scope so the consumer binds it to the correct chain (SF-5 scenario 1); a chain-scoped address must never be presented as an L1 address.
- **Gateway unreachable vs name-not-found** — a v2 CCIP-Read gateway failure must map to `EXTERNAL_GATEWAY_ERROR`, distinct from `NAME_NOT_FOUND`, and must never silently fall back to a stale v1-only lookup (SF-5 scenario 2).
- **Deterministic-under-stable-state vs cache TTL** — repeated calls with identical input under stable underlying state must return structurally-equal results; the conformance harness defines what "structurally equal under a cache TTL" means so a memoizing adapter and a re-querying adapter both satisfy it (SF-4).
- **Non-EVM adapter present in the same workspace** — the additive capability must not force any non-EVM adapter to implement or stub it; omission at the runtime-map level is the supported path (SF-2 scenario 3, SC-006).
- **Non-user-safe `label`** — an adapter that emits an internal identifier or gateway URL as `provenance.label` must be caught by the conformance harness's allowlist check (SF-4 scenario 2).

## Out of Scope _(mandatory — at minimum, state "None")_

- **The capability type shape** (interface, value types, error union) — owned by the UIKit initiative (UIKit SF-1); this repo implements against it and does not modify it.
- **React hooks, input validation, address display, AddressBookWidget, v2 UX plumbing** — owned by the UIKit initiative (UIKit SF-2..SF-6).
- **Non-EVM name systems** (SNS / Solana, Unstoppable Domains, `.sui`, Aptos) — non-EVM adapters omit the capability; normalization is a follow-up initiative.
- **The adapter's React / wallet-connector glue** — this initiative delivers headless resolution primitives (`work-type: service`) only.
- **Persisted (disk / IndexedDB) resolution cache** — any caching is in-memory and adapter-internal; a persistence layer is a follow-up if integrator feedback demands it. (The UIKit owns consumer-side caching in its hooks.)
- **The `provenance.external` → v2-mechanism semantic boundary** — deliberately unresolved (see Open Questions); the UIKit dev decides it at their SF-6 Design.

## Dev Notes _(optional)_

- **Cross-repo `SF-N` disambiguation.** The two initiatives (this repo and `openzeppelin-ui`) number their sub-features **independently** — this repo's SF-2 is not the UIKit's SF-2. Throughout this artifact, a bare `SF-N` refers to *this repo's* sub-features; every reference to the sibling initiative is written explicitly as `UIKit SF-N`. Downstream stages should preserve this convention.
- **Ground truth read before decomposition:** the UIKit's `artifacts/001-ens-uikit-support/00-specify.md`, `sf-1-name-resolution-capability/02-design.md` (the exact interface/value types this repo implements against), and `.../03-invariants.md` (UIKit INV-1..INV-22; UIKit INV-6/8/12/16 are the adapter-side contract SF-4 enforces). Per pipeline convention these are input, not decisions — downstream stages should read the current UIKit artifacts directly rather than lifting type signatures or values from here.
- **Sibling repo pattern to follow:** `packages/adapter-evm-core/src/capabilities/addressing.ts` is the sibling capability (Tier-1, synchronous). Name resolution is Tier-2 (async, network-scoped, `RuntimeCapability`-extending per the UIKit design), so it will not mirror `addressing.ts` exactly — but the capability-factory + runtime-registration wiring is the pattern to reuse.
- **`viem` is already a dependency of `adapter-evm-core`**, and `@openzeppelin/adapter-runtime-utils` already houses `runtime-capability.ts` / `runtime-factories.ts` — the natural home for the SF-4 conformance harness.
- **Research directive (binds SF-2 and SF-5): prefer `viem` over reinventing ENS.** The Research stages of SF-2 (v1 forward/reverse) and SF-5 (ENS v2) MUST first evaluate `viem`'s built-in ENS support — `getEnsAddress` / `getEnsName` / `getEnsAvatar`, ENSIP-10 wildcard resolution, and CCIP-Read (offchain gateway) handling — before considering any hand-rolled resolver, registry ABI calls, or bespoke gateway client. `viem` is already a dependency, so adopting it adds no new package. Research should confirm: coverage of the v2 / Namechain / cross-chain paths this initiative needs, the shape of `viem`'s native errors (input to SF-1's error-mapping layer), and any gaps that would still require custom code. A go/no-go on "`viem` covers it" (with the specific gaps enumerated) is a required output of SF-2 and SF-5 Research; reinventing any part `viem` already provides needs an explicit justification recorded there.
- The UIKit design sketches an illustrative `EnsProvenance` / `isEnsProvenance` shape and an adapter `createNameResolution` sketch — these are *sketches* in the UIKit artifact, not delivered there; their real design is this initiative's Design stage (SF-2 for the scaffold, SF-5 for the ENS extension).

## Open Questions _(optional, max 3)_

1. **Mapping of `provenance.external: boolean` onto the v2 mechanisms (registry / CCIP-Read / Namechain)** — deliberately left unresolved. The UIKit dev decides this at their SF-6 Design; this initiative must not pin a boundary contract for it. Recorded against SF-5. If a concrete SF-5 implementation forces a provisional choice, surface it as a drift note back to the UIKit initiative rather than committing it unilaterally.

## Plan Revisions _(empty on initial run; populated on extension-mode runs)_

*Each extension-mode Specify run appends a dated entry here, leaving the original plan and prior revisions visible above.*
