---
stage: design
project: ens-uikit-support
sub_feature: sf-3-reverse-resolution
repo: openzeppelin-adapters
mode: extension
extends: packages/adapter-evm-core/src
status: draft
timestamp: 2026-07-04
author: aleksandr.pasevin
previous_stage: artifacts/001-ens-uikit-support/sf-3-reverse-resolution/01-research.md
tags: [ens, name-resolution, reverse-resolution, forward-verification, avatar, viem, getEnsName, getEnsAvatar, capability, evm, adapter, service]
---

# SF-3 · Reverse resolution + forward-verification + avatar — Design Document

## Summary

Adds the reverse `resolveAddress` (address → name) path to the EVM `NameResolutionCapability` as a new
method on SF-2's existing `EvmNameResolutionService`, delivered as a thin wrapper over viem's
`getEnsName`. Per the **settled cross-repo decision (Approach A — SUPPRESS-on-mismatch)**, the design
relies on the Universal Resolver's *built-in* forward-verification (`reverseWithGateways`): `getEnsName`
returns a name only when the on-chain reverse algorithm has already confirmed `forward(name) === address`,
so every returned name is verified and `forwardVerified` is a concrete **`true`** on the success path.
A forward/reverse mismatch (`ReverseAddressMismatch`), an empty reverse record (`null`), and the
address-scoped resolver reverts all fold to a typed `ADDRESS_NOT_FOUND` on SF-3's own control path via
SF-1's existing `addressNotFound` constructor — the adapter **never surfaces a mismatched name**.
Avatar (`getEnsAvatar`) is a separate, name-keyed, best-effort lookup performed only after a successful
reverse, fully latency- and failure-isolated: any avatar failure yields `avatarUrl: undefined` and never
fails or throws the reverse result. Transport / gateway / timeout throws delegate to SF-1's
`mapNameResolutionError`. Fully additive: **no new files, no new factory, no mapper change** — a minor
release; non-EVM adapters untouched.

## Module Structure

SF-3 is the smallest possible extension of the `name-resolution/` domain SF-1 and SF-2 built. Under
Approach A there is **no** raw reverse-record read, **no** `name(bytes32)` ABI fragment, and **no**
`reverse-record.ts` (all of which Research's Approaches B/C would have required) — viem's `getEnsName`
*is* the reverse reader, exactly as `getEnsAddress` is the forward reader. `resolveAddress` therefore
lands as a method on the existing service; nothing else in the tree moves.

```
packages/adapter-evm-core/src/
├── name-resolution/
│   ├── error-mapping.ts     ← SF-1 (exists): mapNameResolutionError + addressNotFound  [UNCHANGED — reused]
│   ├── name-validation.ts   ← SF-2 (exists): isValidName + normalizeName               [UNCHANGED]
│   ├── provenance.ts        ← SF-2 (exists): baseEnsProvenance()                        [UNCHANGED — reused]
│   ├── service.ts           ← MODIFIED (SF-3): add resolveAddress() + private tryGetAvatar()
│   └── index.ts             ← UNCHANGED (service already re-exported by SF-2 barrel)
├── capabilities/
│   ├── name-resolution.ts   ← UNCHANGED — the guard Proxy already surfaces every service method
│   └── index.ts             ← UNCHANGED
└── (registration in adapter-evm/profiles/shared.ts — UNCHANGED: the nameResolution slot already exists)
```

**Rationale:**

- **`resolveAddress` is a method on `EvmNameResolutionService`, not a new module.** The reverse path
  shares the same injected `PublicClient` (D-A), the same sync UR support-gate (D-B), the same base
  provenance builder, and the same never-throw discipline as `resolveName`. A separate module would
  duplicate all of that seam. Research confirmed the natural shape: *"the `EvmNameResolutionService`
  gains a `resolveAddress` method."*
- **The factory (`capabilities/name-resolution.ts`) needs no change.** `createNameResolution` wraps the
  service in `guardRuntimeCapability`, a **Proxy** that guards *every* method apply (use-after-dispose →
  `RuntimeDisposedError`) without enumerating a method allowlist. Adding `resolveAddress` to the service
  surfaces it through the capability automatically, and the interface's optional `resolveAddress?` is
  satisfied by the cast the factory already performs.
- **SF-1's `error-mapping.ts` needs no change.** `addressNotFound(address)` already exists
  (`error-mapping.ts` L206) and is the reverse analog of `nameNotFound`. Under Approach A no reverse
  signal requires a new mapper row (see § Error Handling), so — unlike SF-2, which fed SF-1 a Part-B
  drift note — **SF-3 raises no drift to SF-1**.
- **No new files** distinguishes this design decisively from Research's B/C contingency. The
  raw-reverse-read primitive (Research R2) is *not built*: it exists only to recover an *unverified*
  name, which Approach A deliberately never surfaces.

## Core Types

SF-3 introduces **no** new types. The reverse success value type `ResolvedName` is owned by UIKit SF-1
and imported from `@openzeppelin/ui-types`; the error union and constructors are SF-1's; the factory
options (`CreateNameResolutionOptions`) are SF-2's and unchanged.

### Imported from `@openzeppelin/ui-types` (owned by UIKit SF-1 — not modified here)

```ts
import type { ResolutionResult, ResolvedName } from '@openzeppelin/ui-types';
```

Reproduced for reference (authoritative definition lives in `@openzeppelin/ui-types`):

```ts
interface ResolvedName {
  readonly address: string;          // the address the caller asked about (echoed)
  readonly name: string;             // the name it reverse-resolves to
  readonly forwardVerified: boolean; // "Always a concrete boolean — never undefined" (UIKit INV-6)
  readonly avatarUrl?: string;       // optional; present only when getEnsAvatar surfaced one
  readonly provenance: ResolutionProvenance;
}
```

`ResolvedName.forwardVerified` doc (UIKit SF-1): *"`false` means the reverse record exists but
forward-verification failed or was skipped … Downstream display code uses this to suppress bare-name
rendering."* Under Approach A the adapter never returns a name it could not verify, so on the SF-3
success path this field is the constant literal **`true`** — a value that is honest (the UR *did* verify)
and a concrete boolean (satisfies UIKit INV-6 / SC-003). The `false` branch the type permits is simply
never emitted by this adapter (see D-R3, and the Step-Back Suggestion for the scenario-2 reconciliation).

### Reused from SF-1 (`./error-mapping`) and SF-2 (`./provenance`, `./name-validation`)

```ts
import { addressNotFound, unsupportedNetwork, mapNameResolutionError } from './error-mapping';
import { baseEnsProvenance } from './provenance';
import { isValidEvmAddress } from '../utils/validation';   // same helper name-validation.ts uses for the hex check
```

## Public API

### New method on `EvmNameResolutionService` — `src/name-resolution/service.ts`

```ts
/**
 * Reverse resolution: address → name (SF-3). Returns a discriminated {@link ResolutionResult};
 * **never throws for an expected failure** (INV parallel to SF-2 INV-6). The sole sanctioned throw is
 * `RuntimeDisposedError`, raised by the factory's guard proxy before this body runs.
 *
 * Delegates the reverse read AND forward-verification to viem's `getEnsName` (`strict: true`): the
 * Universal Resolver's `reverseWithGateways` reads the reverse record, forward-resolves the claimed
 * name, and verifies it matches `address` — reverting `ReverseAddressMismatch` on a mismatch. So a
 * returned name is ALWAYS forward-verified ⇒ `forwardVerified: true` (Approach A / D-R3). A mismatch,
 * an empty record, or an address-scoped resolver revert all fold to `ADDRESS_NOT_FOUND` on this control
 * path — the adapter never surfaces a mismatched name.
 *
 * Fixed classification precedence (INV parallel to SF-2 INV-12):
 *   0. use-after-dispose → RuntimeDisposedError (guard proxy, before this body)
 *   1. no Universal Resolver on the bound chain → UNSUPPORTED_NETWORK  (sync, before any I/O — D-B)
 *   2. malformed address (!isValidEvmAddress) → ADDRESS_NOT_FOUND      (sync, before any I/O — D-R1)
 *   3. the one getEnsName call (strict:true):
 *        null → ADDRESS_NOT_FOUND (empty reverse record, non-throw path)
 *        name → success { forwardVerified: true, avatarUrl?, provenance }
 *   4. catch: ReverseAddressMismatch / ResolverNotFound / ResolverNotContract /
 *             UnsupportedResolverProfile → ADDRESS_NOT_FOUND (D-R2/D-R4);  default → SF-1 mapper
 */
resolveAddress(address: string): Promise<ResolutionResult<ResolvedName>>;
```

### `resolveAddress` algorithm (the correctness core)

```ts
async resolveAddress(address: string): Promise<ResolutionResult<ResolvedName>> {
  // (1) Network-scope gate — sync, before any I/O (D-B, reused verbatim from resolveName). Past this
  //     point the network is known to support ENS, so every resolver-level revert below is
  //     address-scoped, never network-scoped — this is what makes the ADDRESS_NOT_FOUND classification
  //     in the catch correct.
  if (!this.supportsEns()) {
    return { ok: false, error: unsupportedNetwork(this.networkConfig.id) };
  }

  // (2) Address shape gate (D-R1) — malformed input maps to ADDRESS_NOT_FOUND, never-throw, before any
  //     I/O. The closed union has no "invalid address" code; ADDRESS_NOT_FOUND is the deliberate
  //     never-throw fit for a malformed address, mirroring how the forward path routes a malformed
  //     name to UNSUPPORTED_NAME rather than throwing. The address is echoed back on the error.
  if (!isValidEvmAddress(address)) {
    return { ok: false, error: addressNotFound(address) };
  }

  // (3) The one reverse network call — strict:true (fund-safety parallel to SF-2 INV-7): distinct
  //     failure classes surface as typed reverts instead of collapsing into null. `elapsedMs` is
  //     measured around it so a mapped RESOLUTION_TIMEOUT carries a real number (SF-1 INV-12).
  const started = performance.now();
  let name: string | null;
  try {
    name = await this.publicClient.getEnsName({ address: address as Address, strict: true });
  } catch (error) {
    // (4) Classify. The mismatch signal and the reverse-node resolver-semantic reverts are all
    //     address-scoped "no usable reverse record" outcomes → ADDRESS_NOT_FOUND on THIS control path
    //     via SF-1's addressNotFound (preserving SF-1 INV-11: the mapper never fabricates a not-found).
    //     Everything else → SF-1's total mapper. `error instanceof BaseError` gates the errorName read;
    //     a foreign-realm viem that defeats instanceof yields undefined and falls to the mapper's
    //     ADAPTER_ERROR fallback — safe (never a wrong/coerced name, never a throw), just less precise.
    const errorName = error instanceof BaseError ? extractRevertInfo(error).errorName : undefined;
    switch (errorName) {
      case 'ReverseAddressMismatch':   // Approach A: SUPPRESS the mismatched name (D-R2)
      case 'ResolverNotFound':
      case 'ResolverNotContract':
      case 'UnsupportedResolverProfile': // reverse resolver lacks name() → no usable record (D-R4)
        return { ok: false, error: addressNotFound(address) };
      default:
        return {
          ok: false,
          error: mapNameResolutionError(error, {
            networkId: this.networkConfig.id,
            elapsedMs: performance.now() - started,
            viaGateway: false, // base v1 path; SF-5 owns explicit CCIP-Read context
          }),
        };
    }
  }

  // (5) Empty reverse record — a NON-throw no-record path → ADDRESS_NOT_FOUND.
  if (name === null) {
    return { ok: false, error: addressNotFound(address) };
  }

  // (6) Success. The UR already forward-verified the name (D-R3) ⇒ forwardVerified: true, a concrete
  //     boolean. Avatar is fetched separately, best-effort and isolated (D-R5): it can only ADD an
  //     avatarUrl or leave it absent — it can never fail or throw this result. `address` is echoed as
  //     supplied by the caller (no adapter-side re-checksum — D-R6).
  const avatarUrl = await this.tryGetAvatar(name);
  return {
    ok: true,
    value: {
      address,
      name,
      forwardVerified: true,
      ...(avatarUrl !== undefined ? { avatarUrl } : {}),
      provenance: baseEnsProvenance(),
    },
  };
}
```

### New private helper — avatar isolation

```ts
/**
 * Best-effort, name-keyed avatar lookup (D-R5). A SECOND UR round-trip (getEnsAvatar → getEnsText
 * key='avatar') plus a possible THIRD network hop inside viem's parseAvatarRecord (NFT/IPFS/HTTP asset
 * resolution). Fully isolated: ANY failure — gateway error, unreachable asset host, malformed avatar
 * record, timeout — yields `undefined`, never widening the reverse call's never-throw surface. viem
 * itself swallows parseAvatarRecord errors → null; the try/catch here additionally absorbs the UR/text
 * lookup throws that `strict: true` would otherwise raise. `avatarUrl` is untrusted, name-owner-set
 * content (R7) passed through verbatim — the adapter neither fetches nor sanitizes the asset beyond
 * what getEnsAvatar already did.
 */
private async tryGetAvatar(name: string): Promise<string | undefined> {
  try {
    const avatar = await this.publicClient.getEnsAvatar({ name, strict: true });
    return avatar ?? undefined;
  } catch {
    return undefined;
  }
}
```

`supportsEns()`, the constructor, `isValidName`, `resolveName`, and `dispose()` are **unchanged** from
SF-2.

## State Ownership & Boundaries

SF-3 introduces **no new state**. It reuses SF-2's ownership model exactly.

| Entity | Owner | Lifecycle | Where it lives |
|--------|-------|-----------|----------------|
| `EvmNameResolutionService` instance (now with `resolveAddress`) | Adapter capability | Created per capability instance by `createNameResolution`; disposed via the guard's `dispose()`. | `src/name-resolution/service.ts` |
| viem `PublicClient` | **Composing runtime** (`adapter-evm/profiles/shared.ts`) | Built at factory-invocation time; **borrowed** by the service for both `resolveName` and `resolveAddress`; **not** disposed by the capability. | `adapter-evm` registration layer |
| `NameResolutionErrorContext` value (reverse catch site) | this service | Assembled per call, discarded after mapping. | Caller (SF-3) |
| The mapper + `addressNotFound` / `unsupportedNetwork` constructors | **SF-1** | Imported; pure; not modified. | `src/name-resolution/error-mapping.ts` |
| `ResolvedName` value type + error union | **UIKit SF-1** (`@openzeppelin/ui-types`) | Imported; never modified. | Sibling `openzeppelin-ui` repo |

### Boundary invariants (all inherited from SF-2, extended to the reverse path)

- **Stateless resolution — no verify cache, no avatar cache.** `resolveAddress` and `tryGetAvatar` add
  **no** mutable field to the service (SF-2 INV-13). This keeps SF-3 trivially deterministic-under-stable-
  state so the SF-4 conformance harness's determinism check holds across both directions. Consumer-side
  caching remains the UIKit's (its SF-2 hooks).
- **The capability borrows the client; it does not own it.** `dispose()` is unchanged — a no-op with
  respect to the injected `PublicClient` (INV-15). The reverse path releases no RPC resource of its own.
- **Never throws for expected failures.** Every reverse failure path returns `{ ok: false }`; every
  avatar failure yields `avatarUrl: undefined`. The sole sanctioned throw is `RuntimeDisposedError`,
  raised by the guard proxy before the method body.
- **Avatar I/O is failure- and latency-isolated (D-R5).** The avatar round-trip(s) run in a dedicated
  `try/catch` *after* the reverse has already succeeded. A slow or failing avatar asset host can only
  suppress `avatarUrl`; it can never turn a good `{ ok: true, forwardVerified: true }` into an error or
  a throw, and it never contributes to the reverse call's error classification.

### Dependency injection seams

- **Client injection** (D-A, reused): the same borrowed `PublicClient` backs `getEnsName` and
  `getEnsAvatar`. Unit tests supply a mock `{ getEnsName, getEnsAvatar, chain }` with zero network I/O.
- **SF-1 mapper + `addressNotFound`**: imported directly (leaf utilities, no injection).

## Integration Patterns

### Registration into the EVM runtime — **UNCHANGED**

The `nameResolution` capability slot already exists in `packages/adapter-evm/src/profiles/shared.ts`
(SF-2), threading the injected client into `createNameResolution`. `resolveAddress` rides on the same
capability instance; no registration change is needed.

### Consumer (UIKit SF-4 display hook — sketch, not delivered here)

```ts
const cap = runtime?.nameResolution;                 // present on EVM; absent on non-EVM (SC-006)
if (!cap?.resolveAddress) return { status: 'unsupported' };
const result = await cap.resolveAddress(address);
if (result.ok) {
  const { name, forwardVerified, avatarUrl } = result.value;
  // Under this adapter, forwardVerified is always true on a returned name — a bare name is safe to
  // render. A forward-mismatched address never reaches here: it returns ADDRESS_NOT_FOUND, and the
  // UIKit SF-4 display layer renders truncated hex for that miss (the anti-spoofing guarantee).
  render(forwardVerified ? name : truncateHex(address), avatarUrl);
} else {
  switch (result.error.code) {
    case 'ADDRESS_NOT_FOUND':    return truncateHex(address);   // no name / mismatch / bad input
    case 'UNSUPPORTED_NETWORK':  /* … */ break;
    case 'RESOLUTION_TIMEOUT':
    case 'EXTERNAL_GATEWAY_ERROR':
    case 'ADAPTER_ERROR':        /* … */ break;
  }
}
```

Note: the consumer must still treat `forwardVerified === false` defensively (suppress bare-name render),
because the contract permits it in general — even though *this* adapter never emits it. That is the
correct portable contract for a consumer that may run against other adapters.

## Error Handling

Style: **discriminated `ResolutionResult`** (never-throw for expected failures) — dictated by the UIKit
contract; SF-3 constructs no error classes of its own. All `ADDRESS_NOT_FOUND` production is on SF-3's
control path via the `addressNotFound` constructor — **never inside the mapper** — preserving SF-1
INV-11 (the mapper never fabricates a not-found; `ADDRESS_NOT_FOUND` is a not-found too).

### Reverse-path native-error → code classification (D-R7 — authoritative, `viem@2.44.4`, `strict: true`)

Mirrors SF-2's D-E Part-A / Part-B split. **Part A** = SF-3-owned control-path constructors; **Part B**
= the SF-1 mapper's existing table (SF-3 delegates via `mapNameResolutionError`, adds no row).

#### Part A — SF-3-owned control-path classification (NOT mapper rows)

| Signal | Code | Construction site | Note |
|--------|------|-------------------|------|
| `getEnsName` returns `null` (empty reverse record) | `ADDRESS_NOT_FOUND` | `addressNotFound(address)` | non-throw no-record path |
| `!isValidEvmAddress(address)` (malformed input) | `ADDRESS_NOT_FOUND` | `addressNotFound(address)` | **D-R1** — never-throw; sync, before I/O; union has no invalid-address code |
| `supportsEns()` false (no Universal Resolver on chain) | `UNSUPPORTED_NETWORK` | `unsupportedNetwork(networkId)` | **D-B** reuse — sync, before I/O |
| revert `ReverseAddressMismatch` | `ADDRESS_NOT_FOUND` | `addressNotFound(address)` | **D-R2 / Approach A** — SUPPRESS the mismatched name; the crux of R1 |
| revert `ResolverNotFound` / `ResolverNotContract` (reverse node has no usable resolver) | `ADDRESS_NOT_FOUND` | `addressNotFound(address)` | address-scoped no-record |
| revert `UnsupportedResolverProfile` (reverse resolver lacks `name()`) | `ADDRESS_NOT_FOUND` | `addressNotFound(address)` | **D-R4** — no usable reverse record |

#### Part B — SF-1 mapper table (`mapNameResolutionError`) — the rows SF-3 delegates (UNCHANGED from SF-1)

| `viem` signal | Code | Note |
|---|---|---|
| revert `HttpError` / `OffchainLookup*` | `EXTERNAL_GATEWAY_ERROR` | reverse can be offchain (ENSIP-19) — unconditional |
| `TimeoutError` with `ctx.viaGateway` falsy | `RESOLUTION_TIMEOUT` | `elapsedMs` from ctx (SF-1 INV-12) |
| `HttpRequestError` with `ctx.viaGateway` falsy | `ADAPTER_ERROR` (cause) | plain RPC transport error |
| `ChainDoesNotSupportContract` | `UNSUPPORTED_NETWORK` | backstop — D-B pre-empts normally |
| revert `ResolverError`, plain `Error('client chain…')`, anything else | `ADAPTER_ERROR` (cause preserved) | closed-union guarantee |

**No new mapper row for the reverse path.** `ReverseAddressMismatch` — which SF-2's Part B routed to
`ADAPTER_ERROR` as an *unexpected-on-forward* signal — is handled on SF-3's control path (Part A) *before*
the mapper is reached, so the mapper never classifies it on the reverse path. `addressNotFound` already
exists in SF-1. Therefore **SF-3 raises no drift note to SF-1** (contrast SF-2's Part-B drift).

#### Avatar failures — never classified

`tryGetAvatar` failures are **not** mapped to any `NameResolutionError`. They are absorbed to
`avatarUrl: undefined`. Avatar I/O is deliberately outside the reverse call's error surface (D-R5).

### Production sites, by code

| Code | Produced by | Trigger |
|------|-------------|---------|
| `UNSUPPORTED_NETWORK` | `unsupportedNetwork()` (SF-3 control path) | `supportsEns()` false — sync, before I/O (D-B) |
| `ADDRESS_NOT_FOUND` | `addressNotFound()` (SF-3 control path) | malformed address (D-R1); `getEnsName` `null`; `ReverseAddressMismatch` (D-R2); `ResolverNotFound`/`ResolverNotContract`; `UnsupportedResolverProfile` (D-R4) |
| `EXTERNAL_GATEWAY_ERROR` | `mapNameResolutionError` (SF-1) | `HttpError` / `OffchainLookup*` reverts (offchain reverse) |
| `RESOLUTION_TIMEOUT` | `mapNameResolutionError` (SF-1) | transport `TimeoutError`, `viaGateway` falsy — `elapsedMs` from ctx |
| `ADAPTER_ERROR` | `mapNameResolutionError` (SF-1) | `ResolverError`, `HttpRequestError`, unclassified — `cause` preserved |

## Events / Observability

**None at the SF-3 layer beyond debug logging** — identical to SF-2. The reverse path emits no
metrics/events; per-resolution latency/success telemetry is the consumer's (UIKit). `dispose()` is
unchanged. Ops wanting unclassified-error visibility reads `ADAPTER_ERROR.cause`. Avatar failures are
intentionally silent (best-effort) — a debug log inside the `tryGetAvatar` catch is permissible but not
required, and must never carry the (untrusted) avatar record content.

## Change Plan (Extension Mode)

- **New files:** **None.**
- **Modified files:**
  - `packages/adapter-evm-core/src/name-resolution/service.ts` — add the public `resolveAddress` method
    and the private `tryGetAvatar` helper to `EvmNameResolutionService`. Add imports: `getEnsName` /
    `getEnsAvatar` are called via the injected `publicClient` (viem `PublicClient` methods — no new
    import); add `addressNotFound` to the existing `./error-mapping` import; add `isValidEvmAddress`
    from `../utils/validation`; add `type Address` to the existing `viem` import. `BaseError`,
    `extractRevertInfo`, `unsupportedNetwork`, `mapNameResolutionError`, `baseEnsProvenance` are already
    imported by SF-2.
- **Unchanged (explicitly):**
  - `src/name-resolution/error-mapping.ts` (SF-1) — `addressNotFound` reused as-is; **no new row**.
  - `src/name-resolution/name-validation.ts`, `src/name-resolution/provenance.ts` (SF-2) — reused as-is.
  - `src/name-resolution/index.ts` barrel — the service is already re-exported (SF-2).
  - `src/capabilities/name-resolution.ts` + `capabilities/index.ts` — the guard Proxy already surfaces
    `resolveAddress`; the factory signature and wiring are unchanged.
  - `packages/adapter-evm/src/profiles/shared.ts` — the `nameResolution` slot already exists (SF-2).
  - Every non-EVM adapter (SC-006).
- **API compatibility:** Fully additive — an already-optional interface method (`resolveAddress?`)
  becomes present on the EVM capability. Nothing removed/renamed/re-signed. Minor release of
  `adapter-evm-core` (and no functional change to `adapter-evm` beyond the transitively-richer capability).
- **Migration:** None. `NameResolutionCapability.resolveAddress?` is already optional (UIKit SF-1).
- **`viem`:** already a dependency (`^2.33.3`, resolved `2.44.4`); no dependency change. The reverse UR
  ABI / `isNullUniversalResolverError` behavior (incl. `ReverseAddressMismatch` in the null-error set) is
  `viem >= 2.x`; a `viem` major bump requires re-validating the Part-A reverse table (add the
  version-tying comment, as SF-2 did for the forward table).

## Design Decisions Log

- **D-R2 — Approach A (SUPPRESS-on-mismatch); rely on the UR's built-in forward-verification.**
  `resolveAddress` = a thin wrapper over `getEnsName({ strict: true })`. viem's `reverseWithGateways`
  performs the entire reverse algorithm on-chain (read reverse record → forward-resolve → verify match),
  reverting `ReverseAddressMismatch` on a mismatch. SF-3 treats that revert — and `null`, and the
  address-scoped resolver reverts — as `ADDRESS_NOT_FOUND`. *Why:* it is the settled cross-repo decision;
  it is the minimal, viem-native path (zero new dependency, no hand-rolled reverse read); and it is safe
  (the adapter never surfaces a spoofable name). *Rejected:* Research's Approach B (raw reverse-record
  read + own `resolveName` verify) and Approach C (hybrid) — both build an unverified-name primitive whose
  only purpose is to surface the mismatched name, which Approach A deliberately suppresses. (Settled with
  the dev / Orchestrator; supersedes Research's recommendation of C.)
- **D-R3 — `forwardVerified` is the constant literal `true` on the success path.** Because `getEnsName`
  returns a name only after the UR verified it, every returned name is forward-verified. The field is a
  concrete boolean (UIKit INV-6 / SC-003 satisfied) that is honest for this adapter. The `false` branch
  the type permits (skipped-for-latency) is never emitted here — see D-R... below and the Step-Back
  Suggestion. (Dev-confirmed, Q2.)
- **D-R1 — Malformed address input → `ADDRESS_NOT_FOUND`, sync, before any I/O.** `!isValidEvmAddress`
  returns `{ ok: false, error: addressNotFound(address) }` echoing the input, never a throw and never a
  construction-time guard. *Why:* the closed union has no "invalid address" code; `ADDRESS_NOT_FOUND` is
  the deliberate never-throw fit for malformed input, mirroring how the forward path maps a malformed
  name to `UNSUPPORTED_NAME`. A construction-time guard would break the uniform never-throw surface the
  SF-4 conformance harness relies on. (Dev-confirmed, Q1; the dev asked this be explicitly noted as a
  slight semantic stretch — recorded here and in the table.)
- **D-R4 — `UnsupportedResolverProfile` on the reverse path → `ADDRESS_NOT_FOUND`.** A reverse resolver
  that lacks the `name()` profile has no usable reverse record for this address — an address-scoped
  no-record outcome, not an adapter bug. Lean per Research R-table; consistent with treating all
  "no usable reverse record" reverts as `ADDRESS_NOT_FOUND`. (Dev-confirmed, Q-set.)
- **D-R5 — Avatar is a separate, name-keyed, best-effort, failure-isolated lookup.** `getEnsAvatar` is
  called (viem defaults, no custom deadline) only after a successful reverse, inside a dedicated
  `try/catch` that converts any outcome to `avatarUrl?: string | undefined`. Avatar I/O never fails, never
  throws, and never gates the reverse result; it never participates in error classification. *Why:*
  avatar is a second (and possibly third) round-trip over untrusted, name-owner-controlled content
  (R4/R7); letting it sink a good reverse result would be a correctness bug. A per-avatar deadline is a
  possible SF-5/future add, not built here. (Dev-confirmed, Q3.)
- **D-R6 — Echo the caller's `address` as supplied; no adapter-side re-checksum.** `ResolvedName.address`
  echoes the input verbatim (it passed `isValidEvmAddress`). Research R5 (checksum-safe compare)
  **dissolves under Approach A**: SF-3 performs no own-verify comparison — the UR does verification
  internally — so there is no compare to normalize. (Consequence of D-R2.)
- **`coinType` stays the default `60n` (ETH mainnet).** SF-3 v1 reverse targets the default ETH coin
  type. Chain-scoped / non-60 / ENSIP-19 chain-scoped reverse and `scopedToNetworkId` are **SF-5**.
  (Dev-confirmed, Q4.)
- **`strict: true` on `getEnsName`** (fund-safety parallel to SF-2's `getEnsAddress` `strict: true`): so
  distinct reverse failure classes surface as typed reverts instead of collapsing into `null`. Corollary
  (to become an invariant): `ADDRESS_NOT_FOUND` arises from **both** the `null`-return path *and* the
  classified reverts (`ReverseAddressMismatch` / `ResolverNotFound` / `ResolverNotContract` /
  `UnsupportedResolverProfile`).
- **D-R7 — SF-3 owns the finalized reverse-path class→code table** (§ Error Handling). Part A = SF-3
  control-path constructors; Part B = SF-1's existing mapper rows. **No new mapper row; no SF-1 drift.**

## Out of Scope

- **Surfacing a forward-mismatched name with `forwardVerified: false`** — deliberately **not built**
  (Approach A / D-R2). A mismatch folds to `ADDRESS_NOT_FOUND`; the anti-spoofing guarantee is preserved
  at the UIKit display layer (their SF-4 renders truncated hex). This is the reconciliation captured in
  the Step-Back Suggestion.
- **Raw reverse-record read / `name(bytes32)` ABI fragment / own forward-verify (`resolveName` re-call)
  / `reverse-record.ts`** — Research Approaches B/C only; not built under Approach A. The UR verifies
  internally; SF-3 does **not** call `resolveName`.
- **Chain-scoped reverse / non-60 `coinType` / ENSIP-19 chain-scoped primary names / `scopedToNetworkId`
  / `EnsProvenance` / `isEnsProvenance` / `viaGateway: true`** — SF-5. SF-3 emits `baseEnsProvenance()`
  (`external: false`, no scope), the same seam SF-2 established, and uses the UR's built-in CCIP-Read only
  incidentally (an offchain primary name resolves through it).
- **Avatar image fetching / caching / rendering / SSRF & mixed-content hardening** — UIKit (consumer).
  SF-3 returns the `avatarUrl` string `getEnsAvatar` produces; it neither fetches nor sanitizes the asset
  beyond viem's own `parseAvatarRecord`. (R7 flag forwarded to UIKit SF-4: `avatarUrl` is untrusted,
  name-owner-controlled content to be rendered defensively.)
- **The `NameResolutionError` union / `ResolvedName` value type** — owned by UIKit SF-1
  (`@openzeppelin/ui-types`); imported, never modified.
- **The error-mapper internals** — SF-1; SF-3 consumes `mapNameResolutionError` + `addressNotFound`
  unchanged.
- **The conformance harness** — SF-4; SF-3 defines the `forwardVerified` concrete-boolean / never-throw /
  determinism properties on the reverse path; SF-4 enforces them.
- **`@ensdomains/ensjs` as a dependency** — not adopted.
- **Non-EVM name systems** (SNS, Unstoppable, `.sui`, Aptos) — follow-up initiative; non-EVM adapters omit
  the capability.

## Step-Back Suggestion (Optional)

**Target stage:** Specify (`00-specify.md`) — SF-3 acceptance scenario 2
**Severity:** Recommended — improves consistency (not Critical — behavior is settled and safe)
**Issue:** SF-3 acceptance scenario 2, as literally written, states: *"the capability still returns the
name but with `forwardVerified: false` — the field is always a concrete boolean, never `undefined` —
leaving the render decision to the consumer."* Under the settled Approach A (SUPPRESS-on-mismatch), a
forward/reverse mismatch instead folds to `ADDRESS_NOT_FOUND` and **no name is surfaced** — the adapter
never returns a mismatched name. `forwardVerified` is a concrete boolean (always `true` on the success
path), but the "return the mismatched name with `forwardVerified: false`" outcome is not produced.
**Current workaround:** This design implements Approach A as ratified and documents the divergence here
and in D-R2/D-R3. The anti-spoofing guarantee scenario 2 was protecting is preserved — relocated from the
adapter to the UIKit display layer (UIKit SF-4 renders truncated hex on a miss / on `forwardVerified:false`).
**Why step-back would be better:** Reconciling the scenario-2 wording in `00-specify.md` (and the Edge
Case "Forward / reverse record mismatch") to describe the fold-to-`ADDRESS_NOT_FOUND` behavior keeps the
spec and the implementation in agreement, so downstream SF-4 test authoring reads a scenario that matches
reality.
**Ownership note:** The Orchestrator has explicitly taken this reconciliation — it will fold the SF-3
scenario-2 wording update into a queued Specify extension (alongside the SF-5 Namechain reframe). SF-3
Design does **not** edit `00-specify.md`; this suggestion is the record of the divergence per protocol.

## Dev Notes

- **Supersession of Research's scope phrase.** SF-3 Research (and the earlier Orchestrator scope note)
  stated "forward-verification reuses the SF-2 `resolveName` path." Under the settled **Approach A** this
  is **superseded**: the Universal Resolver performs forward-verification *internally* inside
  `getEnsName`/`reverseWithGateways`, so SF-3 does **not** call `resolveName` and does not build a
  self-verify compare. The "reuse `resolveName`" direction was specific to Research's Approaches B/C,
  which Approach A does not adopt. Recorded so the Invariants/Code stages do not re-introduce a
  `resolveName` sub-call.
- **`forwardVerified: false` is never emitted by this adapter, but consumers must still handle it.** The
  UIKit contract keeps `forwardVerified` as a general boolean because a *different* adapter might skip
  verify for latency and set `false`. A consumer that only runs against this EVM adapter would observe a
  constant `true`, but portable consumer code (UIKit SF-4) must still suppress bare-name rendering on
  `false`. This is not a contradiction — it is the difference between what the contract permits and what
  this implementation emits.
- **Reverse offchain (ENSIP-19) is possible.** A primary name whose reverse resolution traverses a
  CCIP-Read gateway can raise `HttpError` / `OffchainLookup*` on the reverse path; the SF-1 mapper's
  existing unconditional `EXTERNAL_GATEWAY_ERROR` rows cover it. `viaGateway: false` on the base v1 path
  is correct (those gateway reverts classify unconditionally; `viaGateway` only disambiguates a bare
  `TimeoutError`/`HttpRequestError`). SF-5 owns explicit `viaGateway: true` context.
- **`performance.now()`** is the `elapsedMs` clock at the reverse catch site (SF-1 INV-12 caller
  obligation), identical to SF-2. Only the single `getEnsName` call is timed; `tryGetAvatar` runs after a
  successful reverse and is not part of the error-timing window.
- **Class→code table pinned to `viem@2.44.4`** — add a version-tying code comment (as SF-2 did). A `viem`
  major bump re-validates the reverse UR error surface, especially `ReverseAddressMismatch`'s membership
  in `isNullUniversalResolverError` and the `errorName` strings.
- **Cross-repo HOLD (same as SF-1/SF-2):** the local `@openzeppelin/ui-types` checkout already carries
  `ResolvedName` / `resolveAddress?`; the published baseline lagged. Typecheck is green against the
  materialized `@openzeppelin/ui-types@3.1.1` dev:local link (SF-1/SF-2 confirmed). Do not locally
  redefine any UIKit-owned type.
- **`getEnsAvatar` `strict` is immaterial to the result** because `tryGetAvatar` swallows every outcome
  to `undefined`. `strict: true` is chosen for posture-consistency with the reverse call; `strict: false`
  would produce the same observable behavior (a `null` → `undefined`). Either is acceptable at Code stage.

## Open Questions

1. **`UnsupportedResolverProfile` on the reverse path (D-R4) — confirm at Tests.** This design leans
   `ADDRESS_NOT_FOUND` (no usable reverse record). A mainnet-fork test against an address whose reverse
   resolver lacks `name()` should pin it; if a case argues for `ADAPTER_ERROR` (resolver-capability gap),
   revisit this one row. Mirrors SF-2's D-C open question.
2. **`ReverseAddressMismatch` fork coverage.** The suppress path (D-R2) should be pinned by a mainnet-fork
   (or fixture) test against a known forward-mismatched address, asserting `ADDRESS_NOT_FOUND` (not a
   thrown error, not a surfaced name). Requires a real viem `ContractFunctionRevertedError`
   `ReverseAddressMismatch` fixture — deferred to Tests, as SF-2's revert-classification cases were.
3. **`forwardVerified` constant-true — should Invariants encode it as an invariant?** Recommend the
   Invariants stage state explicitly: "on the SF-3 success path `forwardVerified === true`," so SF-4's
   concrete-boolean check has a precise expected value for this adapter while remaining compatible with
   the general contract. Flagged for Invariants.
