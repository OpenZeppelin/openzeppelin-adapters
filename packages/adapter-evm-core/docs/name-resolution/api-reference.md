# API Reference — ENS Name Resolution (forward SF-2 · reverse SF-3 · ENS v2 SF-5)

Complete typed surface for the EVM name-resolution capability, as exported from
`@openzeppelin/adapter-evm-core`. Value types (`ResolutionResult`, `ResolvedAddress`,
`ResolvedName`, `ResolutionProvenance`, `NameResolutionError`) and the `NameResolutionCapability`
interface are **owned by `@openzeppelin/ui-types`** — this package implements against them and
re-exports nothing of them; import them from `@openzeppelin/ui-types`.

> Scope: this reference covers all three delivered slices — the **forward** path (name → address,
> SF-2), the **reverse** path (`resolveAddress`, `forwardVerified`, avatar, SF-3), and **ENS v2**
> (SF-5): the `EnsProvenance` extension type + `isEnsProvenance` guard carried on every forward
> success, the observed-`external` upgrade, the optional `ensL1Client` for L1 cross-chain
> resolution, and `coinType` / `scopedToNetworkId` chain-scoping. The base `ResolutionProvenance`
> contract is **unchanged** by SF-5 (`EnsProvenance` is a strict superset).

---

## Exports at a glance

| Export | Kind | From `@openzeppelin/adapter-evm-core` |
|--------|------|----------------------------------------|
| `createNameResolution` | function (factory) | ✅ |
| `CreateNameResolutionOptions` | type | ✅ |
| `EvmNameResolutionService` | class | ✅ |
| `createEvmNameResolutionService` | function | ✅ |
| `isValidName` | function | ✅ |
| `normalizeName` | function | ✅ |
| `baseEnsProvenance` | function | ✅ (reverse-path provenance, SF-3) |
| `EnsProvenance` | type | ✅ **(SF-5)** — forward-result provenance extension |
| `isEnsProvenance` | function (type guard) | ✅ **(SF-5)** — the sole sanctioned narrowing path |
| `buildEnsProvenance` | function | ✅ **(SF-5)** — the forward provenance builder |
| `deriveCoinType` | function | ✅ **(SF-5)** — chainId → ENSIP-9/11 coinType |
| `scopedNetworkId` | function | ✅ **(SF-5)** — the "scoped iff not mainnet" rule |
| `createEvmPublicClient` | function | ✅ (used to build the injected client(s)) |
| `NameResolutionCapability`, `ResolutionResult`, `ResolvedAddress`, `ResolvedName`, `ResolutionProvenance`, `NameResolutionError` | types | from `@openzeppelin/ui-types` |

---

## `createNameResolution`

```ts
function createNameResolution(
  config: NetworkConfig,
  options: CreateNameResolutionOptions,
): NameResolutionCapability
```

Creates the EVM name-resolution capability (forward path). Narrows the network config, assembles
the service over the injected viem client, and wraps it with the runtime guard for the
`RuntimeCapability` surface: network context, idempotent `dispose()`, use-after-dispose →
`RuntimeDisposedError`, and in-flight-promise rejection on dispose.

The capability is **always constructible on EVM**: `isValidName` is network-independent, and
`resolveName` is always present — for a bound network without an ENS Universal Resolver it
reports `UNSUPPORTED_NETWORK` rather than being omitted. Whole-capability omission is reserved
for non-EVM adapters.

**Parameters:**

- `config` (`NetworkConfig`) — the adapter's network config. Must be an EVM network config
  (narrowed internally); its `id` is the `networkId` echoed on `UNSUPPORTED_NETWORK`.
- `options` (`CreateNameResolutionOptions`) — injected dependencies (see below).

**Returns:** `NameResolutionCapability` — with `isValidName` (sync), `resolveName` (async, SF-2),
and `resolveAddress` (async, SF-3) all live.

**Cleanup:** the returned capability's `dispose()` uses `cleanupStage: 'general'` — it releases
no RPC resource of its own, because it borrows the injected client (see `CreateNameResolutionOptions`).

---

## `CreateNameResolutionOptions`

```ts
interface CreateNameResolutionOptions {
  readonly publicClient: PublicClient;
  readonly ensL1Client?: PublicClient;   // SF-5, optional
}
```

Dependencies injected into `createNameResolution`.

- `publicClient` (`viem.PublicClient`) — a viem `PublicClient` whose `chain` carries
  `contracts.ensUniversalResolver` for ENS-supporting networks. It is **injected, not
  constructed here** (dependency-injection seam, D-A), so the capability inherits the runtime's
  transport / timeout / CCIP-Read configuration and stays trivially mockable in unit tests.

  The client is **owned by the composing runtime** — the capability borrows it and never
  disposes it. After the capability's `dispose()`, the same client remains fully usable by the
  runtime and any capability sharing it.

  When the bound network's chain has **no** Universal Resolver and no `ensL1Client` is wired,
  `resolveName` returns a typed `UNSUPPORTED_NETWORK` — it does not throw.

- `ensL1Client` (`viem.PublicClient`, **optional — SF-5**) — a dedicated **mainnet** viem client,
  used **only** when the bound network has no Universal Resolver, to resolve an ENS name
  **chain-scoped to the bound network** on L1 (`coinType = toCoinType(boundChainId)`, ENSIP-9/11).
  Like `publicClient`, it is **borrowed, never disposed**.

  - When **present** and the bound network is an L2 (no UR): `resolveName` resolves the name on L1
    with the bound chain's `coinType`, and the success `provenance` carries `scopedToNetworkId =
    config.id`.
  - When **absent**: an L2-bound `resolveName` returns `UNSUPPORTED_NETWORK` exactly as SF-2 did —
    the L1 cross-chain path is additive and gated on this field.
  - When the bound network **already** has a Universal Resolver (mainnet-bound), `ensL1Client` is
    **not** consulted — the bound `publicClient` wins (no redundant L1 hop) and `coinType` is `60`.

  This is the field a runtime wires to enable L1 cross-chain resolution. See the
  [Integration Guide](./integration-guide.md), Pattern 5.

---

## `EvmNameResolutionService`

```ts
class EvmNameResolutionService {
  constructor(
    networkConfig: TypedEvmNetworkConfig,
    publicClient: PublicClient,
    ensL1Client?: PublicClient,          // SF-5, optional — dedicated mainnet L1 client
  );

  isValidName(name: string): boolean;                                        // sync, no I/O
  resolveName(name: string): Promise<ResolutionResult<ResolvedAddress>>;     // SF-2 forward + SF-5 v2
  resolveAddress(address: string): Promise<ResolutionResult<ResolvedName>>;  // SF-3 (reverse)
  dispose(): void;
}
```

The EVM implementation of the capability's forward surface, minus the `RuntimeCapability` mixin
that `createNameResolution` adds via the guard. Holds only the injected viem client and the
bound (read-only) network config — **no resolution state, cache, or memo**: repeated calls
converge, concurrent calls never interfere.

Most consumers use `createNameResolution` and never touch this class directly; it is exported
for advanced composition and testing.

### `service.isValidName(name)`

```ts
isValidName(name: string): boolean
```

Synchronous ENSIP-15 shape check. No I/O. Delegates to the standalone [`isValidName`](#isvalidname)
helper so consumers and `resolveName` share one gate. See the helper for the exact semantics.

### `service.resolveName(name)`

```ts
resolveName(name: string): Promise<ResolutionResult<ResolvedAddress>>
```

Forward resolution: name → address. Returns a discriminated `ResolutionResult`. **Never throws
for an expected failure.** The one sanctioned throw is `RuntimeDisposedError` on use-after-dispose,
raised by the guard proxy *before* this body runs.

**On success** (`{ ok: true }`) the `value` is a `ResolvedAddress`:

```ts
interface ResolvedAddress {
  readonly name: string;              // the caller's ORIGINAL input, echoed verbatim
  readonly address: string;           // forward-resolved hex, passed through byte-identical
  readonly provenance: EnsProvenance; // SF-5: always an EnsProvenance (a superset of ResolutionProvenance)
}
```

> **SF-5 provenance upgrade.** Since SF-5, the forward path builds an [`EnsProvenance`](#ensprovenance-sf-5)
> on **every** success — the mainnet-bound CCIP-Read case *and* the L1 cross-chain path — replacing
> SF-2's `baseEnsProvenance()` output of `{ label: 'ENS', external: false }`. The static type in
> `@openzeppelin/ui-types`' `ResolvedAddress` is still `ResolutionProvenance` (the base contract is
> unchanged), but the runtime value is always the `EnsProvenance` superset. It carries the
> always-present `system: 'ens'` discriminant, the observed `external`, the `coinType`, and — for a
> chain-scoped result — `scopedToNetworkId`. Narrow to it with [`isEnsProvenance`](#isensprovenance-sf-5).

The resolved `address` is passed through exactly as viem returns it (no adapter-side
re-checksum). `name` echoes the *original* argument, not the normalized form.

**Fixed classification precedence** (each gate short-circuits to a typed error). Note the
**selection-before-shape** ordering: client/network selection is evaluated **before** name-shape
validation, so an input that is *both* malformed *and* on an unsupported network returns
`UNSUPPORTED_NETWORK` (SF-2's own precedence, preserved verbatim):

| Order | Condition | Result |
|------|-----------|--------|
| 0 | Method called on a disposed capability | **throws** `RuntimeDisposedError` (guard proxy, before body) |
| 1a | Bound chain **has** a Universal Resolver | select the **bound** client, `coinType = 60` (mainnet-bound) — continue |
| 1b | No UR, but an `ensL1Client` is wired | select the **L1** client, `coinType = toCoinType(boundChainId)` (chain-scoped) — continue |
| 1c | No UR, `ensL1Client` wired, but `deriveCoinType(boundChainId)` throws (non-ENSIP-11 chainId) | `{ ok: false, error: { code: 'UNSUPPORTED_NETWORK', networkId } }` — **sync, before any I/O** |
| 1d | No UR **and** no `ensL1Client` | `{ ok: false, error: { code: 'UNSUPPORTED_NETWORK', networkId } }` — **sync, before any I/O** |
| 2 | `isValidName(name)` is `false` | `{ ok: false, error: { code: 'UNSUPPORTED_NAME', name, reason } }` |
| 3 | `normalizeName(name)` throws | `{ ok: false, error: { code: 'UNSUPPORTED_NAME', name, reason } }` |
| 4a | `getEnsAddress` returns `null` (empty record) | `{ ok: false, error: { code: 'NAME_NOT_FOUND', name } }` |
| 4b | `getEnsAddress` returns an address | `{ ok: true, value: { name, address, provenance } }` (provenance = `EnsProvenance`) |
| 5 | Revert `ResolverNotFound` / `ResolverNotContract` | `{ ok: false, error: { code: 'NAME_NOT_FOUND', name } }` |
| 5 | Revert `UnsupportedResolverProfile` | `{ ok: false, error: { code: 'UNSUPPORTED_NAME', name, reason } }` |
| 5 | Anything else (gateway / offchain / timeout / transport / unclassifiable) | mapped by the error layer → `EXTERNAL_GATEWAY_ERROR` \| `RESOLUTION_TIMEOUT` \| `ADAPTER_ERROR` |

Gates 1–3 run **before any network round-trip**. The one on-chain read uses `strict: true` on
**both** client selections. On the `default` catch arm, the error layer is fed the **observed**
offchain flag as `viaGateway` (see [`EnsProvenance`](#ensprovenance-sf-5) → observed `external`), so
a CCIP-Read gateway failure dominates to `EXTERNAL_GATEWAY_ERROR` — never a silent v2→v1 fallback.

See [Error surface](#error-surface) for every code's shape.

### `service.resolveAddress(address)`

```ts
resolveAddress(address: string): Promise<ResolutionResult<ResolvedName>>
```

Reverse resolution: address → name (SF-3). Returns a discriminated `ResolutionResult`. **Never
throws for an expected failure.** The one sanctioned throw is `RuntimeDisposedError` on
use-after-dispose, raised by the guard proxy *before* this body runs.

**On success** (`{ ok: true }`) the `value` is a `ResolvedName`:

```ts
interface ResolvedName {
  readonly address: string;                  // the caller's input, echoed byte-identical
  readonly name: string;                     // the verified primary name (e.g. 'vitalik.eth')
  readonly forwardVerified: boolean;         // ALWAYS true on this adapter (see note)
  readonly avatarUrl?: string;               // present only when an avatar was surfaced
  readonly provenance: ResolutionProvenance; // { label: 'ENS', external: false }
}
```

> **`forwardVerified` is constant `true` here (Approach A, anti-spoofing crux).** viem's
> `getEnsName` forward-verifies **inside** the Universal Resolver: it reads the reverse
> (primary-name) record, forward-resolves the claimed name, and reverts `ReverseAddressMismatch`
> if it does not match the queried address — so a name is *only* ever returned when it provably
> round-trips. A mismatch is therefore never surfaced; it folds to `ADDRESS_NOT_FOUND`. The
> `ResolvedName` type permits `forwardVerified: false` (the shared contract reserves it for
> adapters that surface unverified names), but **this EVM adapter never emits it** — the field is
> the literal `true` on every success. `rev.value.name` is safe to render directly.

The `address` is echoed exactly as supplied (no adapter-side re-checksum). `avatarUrl` is spread
conditionally — the **key is absent** when no avatar was found, never `avatarUrl: undefined`.

> **Reverse keeps base provenance (not `EnsProvenance`).** SF-5's provenance upgrade is
> **forward-path only**. `resolveAddress` still attaches `baseEnsProvenance()` =
> `{ label: 'ENS', external: false }`, which has **no** `system` field — so `isEnsProvenance(rev.value.provenance)`
> returns `false` on a reverse result. This is intentional (the reverse read has no observed offchain
> facts to substantiate); do not expect `coinType` / `scopedToNetworkId` on a reverse result.

**Avatar is best-effort and fully isolated.** After a successful reverse read, the service makes a
separate `getEnsAvatar` lookup (a second Universal-Resolver round-trip, plus a possible third hop
inside viem's `parseAvatarRecord` for NFT / IPFS / HTTP asset resolution). **Any** avatar outcome —
gateway error, unreachable host, malformed record, timeout — yields no `avatarUrl` and **never**
fails, throws, or reclassifies the reverse result. The avatar hops are deliberately **outside** the
`elapsedMs` window that a `RESOLUTION_TIMEOUT` would report.

**Fixed classification precedence** (each gate short-circuits to a typed error):

| Order | Condition | Result |
|------|-----------|--------|
| 0 | Method called on a disposed capability | **throws** `RuntimeDisposedError` (guard proxy, before body) |
| 1 | Bound chain has no ENS Universal Resolver | `{ ok: false, error: { code: 'UNSUPPORTED_NETWORK', networkId } }` — **sync, before any I/O** |
| 2 | `address` is not a well-formed EVM address | `{ ok: false, error: { code: 'ADDRESS_NOT_FOUND', address } }` — **sync, before any I/O** |
| 3a | `getEnsName` returns `null` (empty reverse record) | `{ ok: false, error: { code: 'ADDRESS_NOT_FOUND', address } }` |
| 3b | `getEnsName` returns a (forward-verified) name | `{ ok: true, value: { address, name, forwardVerified: true, avatarUrl?, provenance } }` |
| 4 | Revert `ReverseAddressMismatch` (forward-mismatch — **suppressed**) | `{ ok: false, error: { code: 'ADDRESS_NOT_FOUND', address } }` |
| 4 | Revert `ResolverNotFound` / `ResolverNotContract` / `UnsupportedResolverProfile` | `{ ok: false, error: { code: 'ADDRESS_NOT_FOUND', address } }` |
| 4 | Anything else (gateway / offchain / timeout / transport / unclassifiable) | mapped by the error layer → `EXTERNAL_GATEWAY_ERROR` \| `RESOLUTION_TIMEOUT` \| `ADAPTER_ERROR` |

Gates 1–2 run **before any network round-trip**. The one reverse read uses `strict: true`. Every
"no usable, forward-verified reverse record" outcome (empty record, mismatch, the address-scoped
resolver reverts, and a malformed-address input) deliberately collapses onto the single
`ADDRESS_NOT_FOUND` code — the adapter never distinguishes "no record" from "spoofed record" to the
caller, and never surfaces the rejected name.

> **`instanceof BaseError` gate — safe degradation (symmetric with `resolveName`).** The
> revert-classification `switch` reads the decoded `errorName` only when the caught error is a viem
> `BaseError`. If two copies of viem coexist so a `ReverseAddressMismatch` (or other UR revert)
> defeats `instanceof`, the `errorName` is not read and the error falls through to the mapping
> layer's `ADAPTER_ERROR` fallback. This is **safe** — the mismatched name is still never surfaced,
> never a throw, `cause` preserved — only *less precise* (a clean address-not-found is reported as
> an adapter fault rather than `ADDRESS_NOT_FOUND`). In the normal single-copy case the precise
> `ADDRESS_NOT_FOUND` is produced.

See [Error surface](#error-surface) for every code's shape.

### `service.dispose()`

```ts
dispose(): void
```

No-op teardown beyond a debug log. The injected `PublicClient` is **owned by the composing
runtime**; the capability borrows it and never closes its transport. After `dispose()`, the same
client remains usable by the runtime and any capability sharing it. Idempotent (the guard
early-returns on a disposed capability).

---

## `createEvmNameResolutionService`

```ts
function createEvmNameResolutionService(
  networkConfig: TypedEvmNetworkConfig,
  publicClient: PublicClient,
  ensL1Client?: PublicClient,          // SF-5, optional
): EvmNameResolutionService
```

Factory for `EvmNameResolutionService`. Both clients are injected (not constructed here) so the
service inherits the runtime's transport / timeout / CCIP-Read config and stays trivially
mockable. `ensL1Client` is optional — when omitted the service resolves mainnet-bound exactly as
SF-2 did and an L2-bound resolve returns `UNSUPPORTED_NETWORK`. `createNameResolution` calls this
internally; use it directly only for advanced composition or unit tests.

---

## `isValidName`

```ts
function isValidName(name: string): boolean
```

Whether `name` is a plausibly-resolvable ENS name — a **total, pure, synchronous** boolean
predicate that **never throws** and **never does I/O**. Safe to call on every keystroke.

Three ordered, allocation-light checks:

1. **Reject a raw EVM hex address** — an address is not a name (also lets a consumer skip a
   needless resolution round-trip on pasted addresses).
2. **Require at least one `.`** — bare single labels are rejected.
3. **Require ENSIP-15/UTS-46 normalizability** — internally runs viem's `normalize`; if it
   throws, this returns `false` (never propagates).

This is deliberately a **normalize-based check, not a TLD allowlist regex** — a
`/\.(eth|xyz|…)$/` allowlist would wrongly reject legitimate wildcard / DNS / non-`.eth` names
(`.box`, offchain names) that ENS-in-input must accept.

A `true` is **necessary but not sufficient** for resolution: it asserts shape, never the
existence of a record.

**Examples:**

```ts
isValidName('vitalik.eth');            // true
isValidName('foo.box');                // true  (not restricted to a TLD allowlist)
isValidName('0xd8dA6BF…');             // false (a hex address is not a name)
isValidName('vitalik');                // false (no dot)
isValidName('');                       // false
```

---

## `normalizeName`

```ts
function normalizeName(name: string): string
```

ENSIP-15/UTS-46 normalization of an ENS name. **Throws** on a structurally-invalid name (unlike
`isValidName`, which swallows the failure). `resolveName` calls it as a backstop *after*
`isValidName` has passed; a throw there maps to `UNSUPPORTED_NAME`.

- **Returns:** the ENSIP-15-normalized form, suitable for `getEnsAddress`.
- **Throws:** when `name` is not a normalizable ENS name.

---

## `baseEnsProvenance`

```ts
function baseEnsProvenance(): ResolutionProvenance
```

The provenance builder for the **reverse** path (`resolveAddress`, SF-3). Returns a
**freshly-allocated** base `ResolutionProvenance` on every call:

```ts
{ label: 'ENS', external: false }
```

- `label` — the fixed, user-safe literal `'ENS'`. A **display** string, not a discriminant;
  never a URL, gateway host, or keyed identifier. Do not branch on it.
- `external` — `false`. The reverse read has no observed offchain facts to report.
- `scopedToNetworkId` — deliberately **absent** (no chain-scoping on the reverse path).

> **Since SF-5, this is reverse-only.** The forward path (`resolveName`) no longer calls
> `baseEnsProvenance()` — it builds an [`EnsProvenance`](#ensprovenance-sf-5) via
> [`buildEnsProvenance`](#buildensprovenance-sf-5) instead. `baseEnsProvenance()` produces no
> `system` field, so `isEnsProvenance()` narrows `false` on a reverse result — by design.

A fresh object per call (no shared/frozen singleton), so no two success results alias one
provenance.

---

## ENS v2 provenance surface (SF-5)

The v2 layer adds one exported **type** (`EnsProvenance`), one **type guard** (`isEnsProvenance`),
and two **builders** (`buildEnsProvenance`, `deriveCoinType`) plus a small rule helper
(`scopedNetworkId`). All are exported from `@openzeppelin/adapter-evm-core`. They encode
**observable facts only** — never a `version` guess, never a mechanism the resolution can't
substantiate.

### `EnsProvenance` (SF-5)

```ts
interface EnsProvenance extends ResolutionProvenance {
  readonly system: 'ens';    // discriminant — ALWAYS present; the sole narrowing key
  readonly coinType: number; // ENSIP-9/11 coinType: 60 = mainnet/ETH; chain-specific when scoped
  // inherited from ResolutionProvenance, set on every forward result:
  //   label:  'ENS' | 'ENS via external gateway'   (curated literal, chosen from `external`)
  //   external: boolean                             (OBSERVED — true iff CCIP-Read was traversed)
  //   scopedToNetworkId?: string                    (present ONLY when coinType !== 60)
}
```

The EVM-specific provenance carried on **every** forward-resolution success (the base type's own
doc comment sanctions exactly this extension pattern). A **strict superset** of the unchanged base
`ResolutionProvenance` — all base fields are still present, so a consumer that only reads `label` /
`external` keeps working.

- `system` — always the literal `'ens'`. The **only** field `isEnsProvenance` checks. Chosen over a
  `version: 'v1' | 'v2'` field because v1/v2 is **not** observable from viem's `Address | null`
  return (the Universal Resolver is one entry point for both).
- `coinType` — the ENSIP-9/11 coinType the resolution was performed for, as a JS `number` (ENSIP-11
  EVM coinTypes are `< 2^32`, safe-integer, so `JSON.stringify(provenance)` never throws on a
  bigint). `60` for a mainnet-bound (unscoped) resolution; a chain-specific value (e.g. Base →
  `2147492101`) for a chain-scoped one.
- `external` (inherited) — **observed**, not inferred: `true` **iff** an `OffchainLookup` (ERC-3668
  CCIP-Read) was actually followed during *this* resolution. Truthful on the mainnet-bound CCIP-Read
  path too (the primary v2 case), not just the cross-chain path.
- `label` (inherited) — `'ENS'` when `external` is `false`, `'ENS via external gateway'` when
  `true`. A curated display literal — never a URL. Don't branch on it.
- `scopedToNetworkId` (inherited, optional) — present **iff** `coinType !== 60`, equal to the bound
  network's own repo `networkId`. Its presence means "this address is scoped to that network" — bind
  it there, don't treat it as a plain mainnet address.

### `isEnsProvenance` (SF-5)

```ts
function isEnsProvenance(p: ResolutionProvenance): p is EnsProvenance
```

The **sole sanctioned** way to narrow a base `ResolutionProvenance` to the EVM ENS extension. Total,
pure, and sound: it checks the always-present `system` discriminant — **never** `label`. Returns
`true` for every `resolveName` success, `false` for a `resolveAddress` (reverse) result and any
non-EVM adapter's provenance. After a `true`, `p.external` / `p.coinType` / `p.scopedToNetworkId`
are safe to read.

```ts
if (result.ok && isEnsProvenance(result.value.provenance)) {
  const { external, coinType, scopedToNetworkId } = result.value.provenance;
  // …
}
```

> **Never `provenance.label === 'ENS'`.** `label` is a display string with two possible values and
> is free to change; matching on it is a bug. `isEnsProvenance` is the contract (SC-005).

### `buildEnsProvenance` (SF-5)

```ts
function buildEnsProvenance(args: {
  readonly external: boolean;
  readonly coinType: bigint;
  readonly networkId: string;
}): EnsProvenance
```

Builds the `EnsProvenance` for a forward resolution from observed facts. `external` comes from the
per-call CCIP-Read observation; `coinType` from the selected client's coinType; `scopedToNetworkId`
is added **iff** `coinType !== 60`. `label` is chosen from `external`. Freshly allocated on every
call (never a shared/frozen singleton). The service calls this on each forward success; you rarely
call it directly (it is exported for testing and advanced composition).

### `deriveCoinType` (SF-5)

```ts
function deriveCoinType(chainId: number): bigint
```

ENSIP-9/11 forward map: a bound EVM chainId → its `coinType`. A thin wrapper over viem's
`toCoinType` (mainnet `1` → `60n`). **Throws** viem's `EnsInvalidChainIdError` for a non-EVM /
out-of-range chainId — the service catches that synchronously and returns `UNSUPPORTED_NETWORK`.
No coinType→chainId inverse exists or is needed (the target chain *is* the bound network).

- **Throws:** `EnsInvalidChainIdError` for a chainId outside the ENSIP-11 addressable range.

### `scopedNetworkId` (SF-5)

```ts
function scopedNetworkId(coinType: bigint, networkId: string): string | undefined
```

The single source of the "scoped iff not mainnet" rule: returns `networkId` when
`coinType !== 60n`, else `undefined`. `buildEnsProvenance` spreads this so a mainnet-bound result
**omits** the `scopedToNetworkId` key entirely (key-absent, not `undefined`), matching the
base-type convention.

---

## Error surface

Every expected failure is `{ ok: false, error }`, where `error` is a member of the **closed
seven-code `NameResolutionError` union** owned by `@openzeppelin/ui-types`:

```ts
type NameResolutionError =
  | { readonly code: 'NAME_NOT_FOUND';         readonly name: string }
  | { readonly code: 'ADDRESS_NOT_FOUND';      readonly address: string }
  | { readonly code: 'UNSUPPORTED_NETWORK';    readonly networkId: string }
  | { readonly code: 'UNSUPPORTED_NAME';       readonly name: string;    readonly reason: string }
  | { readonly code: 'RESOLUTION_TIMEOUT';     readonly elapsedMs: number }
  | { readonly code: 'EXTERNAL_GATEWAY_ERROR'; readonly detail: string }
  | { readonly code: 'ADAPTER_ERROR';          readonly message: string; readonly cause?: unknown };
```

### Codes the forward path (`resolveName`) can produce

| Code | Payload | When |
|------|---------|------|
| `NAME_NOT_FOUND` | `{ name }` | Empty forward record (`getEnsAddress` → `null`), **or** a `ResolverNotFound` / `ResolverNotContract` revert on an ENS-supporting network. |
| `UNSUPPORTED_NETWORK` | `{ networkId }` | Bound chain has no ENS Universal Resolver. Determined **synchronously, before any I/O**. |
| `UNSUPPORTED_NAME` | `{ name, reason }` | Input fails the shape gate; `normalize` throws; or a `UnsupportedResolverProfile` revert (resolver doesn't implement `addr`). `reason` is a curated, user-safe string. |
| `RESOLUTION_TIMEOUT` | `{ elapsedMs }` | Transport timed out (not via a gateway). `elapsedMs` is a real measurement (a `-1` sentinel would mean a caller omitted its measurement — never the case here). |
| `EXTERNAL_GATEWAY_ERROR` | `{ detail }` | A CCIP-Read / offchain-gateway failure (`OffchainLookup*`, the UR `HttpError` revert, or a gateway timeout). |
| `ADAPTER_ERROR` | `{ message, cause? }` | Any unclassifiable native error — plain RPC transport errors, a resolver-returned `ResolverError`, non-`Error` throws, or a foreign-realm revert that defeats `instanceof` (see note). `message` is redacted of credential-shaped content; `cause` preserves the original by reference for your own logging. |

Note: `ADDRESS_NOT_FOUND` is **not** produced by `resolveName` (it is reverse-only — see below).
`NAME_NOT_FOUND` / `UNSUPPORTED_NAME` are, conversely, not produced by `resolveAddress`. Both are
members of the same shared closed union; which subset a given method can emit is fixed.

> **`instanceof BaseError` gate — safe degradation.** The revert-classification `switch` reads
> the decoded `errorName` only when the caught error is a viem `BaseError` (`error instanceof
> BaseError`). If two copies of viem coexist (duplicate-copy / bundling) so a resolver revert
> defeats `instanceof`, the `errorName` is not read and the error falls through to the mapping
> layer's `ADAPTER_ERROR` fallback. This is **safe** — never a wrong or coerced address/name,
> never a thrown exception, `cause` preserved — only *less precise* than the exact
> `NAME_NOT_FOUND` / `UNSUPPORTED_NAME` / `ADDRESS_NOT_FOUND` classification. In the normal
> single-copy case the precise code is produced. (Both `resolveName` and `resolveAddress` use the
> identical gate.)

### Codes the reverse path (`resolveAddress`) can produce

| Code | Payload | When |
|------|---------|------|
| `ADDRESS_NOT_FOUND` | `{ address }` | The single "no usable, forward-verified reverse record" outcome — covers **all** of: empty reverse record (`getEnsName` → `null`); a `ReverseAddressMismatch` revert (forward-mismatch — **the spoofed name is suppressed, never surfaced**); a `ResolverNotFound` / `ResolverNotContract` / `UnsupportedResolverProfile` revert; and a malformed-address input (rejected synchronously, before any I/O). `address` echoes the caller's own input. |
| `UNSUPPORTED_NETWORK` | `{ networkId }` | Bound chain has no ENS Universal Resolver. Determined **synchronously, before any I/O**. |
| `RESOLUTION_TIMEOUT` | `{ elapsedMs }` | The reverse read timed out (not via a gateway). `elapsedMs` times the `getEnsName` call only — the avatar hops are outside the window. |
| `EXTERNAL_GATEWAY_ERROR` | `{ detail }` | A CCIP-Read / offchain-gateway failure during the reverse read. |
| `ADAPTER_ERROR` | `{ message, cause? }` | Any unclassifiable native error from the reverse read (plain transport error, non-`Error` throw, or a foreign-realm revert that defeats `instanceof` — see note). `message` redacted; `cause` preserves the original by reference. |

The reverse path does **not** produce `NAME_NOT_FOUND` or `UNSUPPORTED_NAME` (those are
name-input codes). Avatar failures never produce any code — they are swallowed to "no `avatarUrl`".

### Handling pattern

Always switch on `error.code`, never on `error.message`:

```ts
// forward
const result = await cap.resolveName(input);
if (!result.ok) {
  switch (result.error.code) {
    case 'NAME_NOT_FOUND':         /* result.error.name */ break;
    case 'UNSUPPORTED_NETWORK':    /* result.error.networkId */ break;
    case 'UNSUPPORTED_NAME':       /* result.error.reason */ break;
    case 'RESOLUTION_TIMEOUT':     /* result.error.elapsedMs */ break;
    case 'EXTERNAL_GATEWAY_ERROR': /* result.error.detail */ break;
    case 'ADAPTER_ERROR':          /* log result.error.cause */ break;
    // 'ADDRESS_NOT_FOUND' is unreachable from resolveName (reverse-only)
  }
}

// reverse
const rev = await cap.resolveAddress(addr);
if (!rev.ok) {
  switch (rev.error.code) {
    case 'ADDRESS_NOT_FOUND':      /* no verified name → render truncated hex */ break;
    case 'UNSUPPORTED_NETWORK':    /* rev.error.networkId */ break;
    case 'RESOLUTION_TIMEOUT':     /* rev.error.elapsedMs */ break;
    case 'EXTERNAL_GATEWAY_ERROR': /* rev.error.detail */ break;
    case 'ADAPTER_ERROR':          /* log rev.error.cause */ break;
    // 'NAME_NOT_FOUND' / 'UNSUPPORTED_NAME' are unreachable from resolveAddress
  }
}
```

---

## Version pin

The native-error → code classification is pinned to **viem@2.44.4**. A viem major bump requires
re-validating the revert `errorName` table against the new version:

- Forward (`resolveName`): `ResolverNotFound`, `ResolverNotContract`, `UnsupportedResolverProfile`,
  `HttpError`, `OffchainLookup*`.
- Reverse (`resolveAddress`): the same address-scoped reverts, plus **`ReverseAddressMismatch`** —
  the forward-mismatch signal viem's `getEnsName` raises from inside the Universal Resolver, which
  this path folds to `ADDRESS_NOT_FOUND`. Confirm its `errorName` string and its membership in
  viem's `isNullUniversalResolverError` are unchanged.
- **ENS v2 (SF-5):** four additional coupling points — `toCoinType` (the ENSIP-9/11 forward map and
  its `EnsInvalidChainIdError` throw), `getEnsAddress`'s `coinType` and `strict` parameters, and the
  client-level **`ccipRead.request` hook** that the per-call observing client wraps to detect
  offchain traversal. A viem major bump must re-validate all four (and the mainnet Universal-Resolver
  proxy address the `ensL1Client` relies on). The `ccipRead.request` hook is the one internal-contract
  coupling — if viem stops reading `client.ccipRead.request` in its `offchainLookup`, `external`
  observation silently regresses; an integration probe on a live CCIP-Read name is the guard.
