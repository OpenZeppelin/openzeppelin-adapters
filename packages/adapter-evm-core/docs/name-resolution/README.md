# ENS Name Resolution — EVM Adapter

> Turn an ENS name (`alice.eth`) into a checksummed address, and turn an address back into the
> name it **verifiably** owns — through the EVM adapter's `NameResolutionCapability`. A typed
> result on success, a distinct typed error code on failure, and **no thrown exceptions on any
> expected failure path**.

This is the EVM **name-resolution** capability delivered in `@openzeppelin/adapter-evm-core`,
covering both directions plus ENS v2 and mainnet-L1 reverse:

- **Forward** (name → address), SF-2 — backs the UIKit's address-input path so a dapp can accept
  ENS names without any bespoke ENS code.
- **Reverse** (address → name + avatar), SF-3 — backs the UIKit's display path so a dapp can show
  `alice.eth` instead of `0xd8dA…`, **without ever rendering a spoofed name as trusted**.
- **ENS v2** (L1-only: CCIP-Read / offchain gateways + cross-chain via `coinType`), SF-5 — every
  forward result now carries an EVM-specific `EnsProvenance` with **observed** offchain facts you
  narrow to via `isEnsProvenance`, and an L2-bound runtime can resolve chain-scoped names on L1.
- **Mainnet-L1 reverse miss-fallback**, SF-1 (002) — on non-mainnet-bound adapters, reverse tries
  the bound chain first; on a **definitive empty** only, consults the gated mainnet L1 client for the
  default primary name (+ avatar), with provenance that marks **global vs network-local** scope via
  base `scopedToNetworkId`.

## Overview

A UIKit or dapp integrator wiring an EVM network gets four things from this capability:

- **`isValidName(name)`** — a synchronous, no-I/O shape check to cheaply pre-filter input
  (e.g. per keystroke) before spending a network round-trip.
- **`resolveName(name)`** — the async forward resolver: `name → { address, provenance }`,
  returned as a discriminated result, never a throw.
- **`resolveAddress(address)`** — the async reverse resolver: `address → { name, forwardVerified,
  avatarUrl?, provenance }`. The returned name is **always forward-verified** (see Safety); an
  optional avatar URL rides along when the adapter can surface one.
- A **closed, typed error surface** — every expected failure comes back as
  `{ ok: false, error: { code, … } }` with a code drawn from a fixed seven-member union.

The single integration point is the factory:

```ts
import { createNameResolution } from '@openzeppelin/adapter-evm-core';
```

On a fully-wired EVM runtime you normally reach the capability through the runtime seam
(`runtime.nameResolution`) — the registration layer builds and injects the viem client for
you. See the [Integration Guide](./integration-guide.md).

**What it does not do (this capability, this release):**

- No **`version: 'v1' | 'v2'`** on provenance — that is *not* observable from viem's `Address | null`
  return (the Universal Resolver is one entry point for both), so `EnsProvenance` carries a
  `system: 'ens'` discriminant and the observed `external` flag instead, never a version claim.
- No **`provenance.external` → mechanism (registry / ccip-read) mapping** — the adapter surfaces
  only the raw observed `external`. Interpreting it into a v2 mechanism label is the consumer's
  call (UIKit SF-6), deliberately left open here.
- No **avatar image fetching, caching, sanitization, URI-scheme normalization, or SSRF / mixed-content
  hardening** — the reverse path returns the avatar *URI* verbatim on `ResolvedName.avatarUrl`
  (not in provenance); fetching, gatewaying (`ipfs://` → `https://`), and safely rendering it is the
  consumer's responsibility (see Safety).
- No **`EnsProvenance` on every reverse result** — bound-mainnet and bound-local hits carry base
  `ResolutionProvenance` only (`isEnsProvenance` → `false`). **L1 miss-fallback/direct hits** also
  attach adapter-internal `EnsProvenance` (`coinType: 60`) for EVM-aware enrichment — but chain-agnostic
  display gates must **not** use that discriminant (see Key Concepts → scope gate).
- No **Namechain / ENS-L2 resolution** — ENS v2 is **L1-only** (the Namechain L2 was cancelled in
  early 2026). Cross-chain names resolve on L1 via `coinType`, not on an ENS L2.

## Quick Start

`@openzeppelin/adapter-evm-core` and its peer `@openzeppelin/ui-types` are already part of the
adapters workspace — there is no separate install for a workspace consumer.

The capability is normally obtained from a wired EVM runtime. Once you have it:

```ts
import type { NameResolutionCapability } from '@openzeppelin/ui-types';

const cap: NameResolutionCapability | undefined = runtime.nameResolution;

// 1. Non-EVM adapters omit the capability entirely — always feature-detect.
if (!cap?.resolveName) {
  // this network/adapter can't resolve names — show hex only
  return;
}

// 2. Cheap synchronous pre-check — no network round-trip.
if (!cap.isValidName(userInput)) {
  return; // not a plausible ENS name; treat as raw address / idle input
}

// 3. The one async call. Never throws for an expected failure.
const result = await cap.resolveName(userInput);
if (result.ok) {
  send(result.value.address); // e.g. '0xd8dA6BF…' — checksummed hex
} else {
  switch (result.error.code) {
    case 'NAME_NOT_FOUND':      /* no record for this name */ break;
    case 'UNSUPPORTED_NETWORK': /* no ENS on this network  */ break;
    case 'UNSUPPORTED_NAME':    /* not a resolvable name    */ break;
    case 'RESOLUTION_TIMEOUT':  /* transport timed out      */ break;
    case 'EXTERNAL_GATEWAY_ERROR': /* CCIP-Read gateway failed */ break;
    case 'ADAPTER_ERROR':       /* unclassified — see .cause */ break;
  }
}
```

**Reverse** (address → name, for display) is the mirror call:

```ts
if (!cap.resolveAddress) return; // show truncated hex

const rev = await cap.resolveAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
if (rev.ok) {
  // Chain-agnostic scope gate (002 SF-1) — base field ONLY; never isEnsProvenance / coinType.
  const scope = rev.value.provenance.scopedToNetworkId;
  const showOnThisRow = scope === undefined || scope === activeNetworkId;

  if (showOnThisRow) {
    // rev.value.name is SAFE to render as-is: forwardVerified is always true here.
    display(rev.value.name);                       // e.g. 'vitalik.eth'
    if (rev.value.avatarUrl) showAvatar(rev.value.avatarUrl); // optional, best-effort
  } else {
    display(truncate('0xd8dA6BF…'));               // network-local name on wrong row → show hex
  }
} else if (rev.error.code === 'ADDRESS_NOT_FOUND') {
  display(truncate('0xd8dA6BF…'));               // no verified name → show hex
} else if (rev.error.code === 'RESOLUTION_TIMEOUT' || rev.error.code === 'EXTERNAL_GATEWAY_ERROR') {
  // Bound or L1 infrastructure failure — NOT a silent miss; do not assume L1 was tried on timeout.
  showResolutionError(rev.error);
}
```

**ENS v2** rides the *same* `resolveName` call — there is no separate v2 method. Every forward
success carries an `EnsProvenance`; narrow to it with the exported `isEnsProvenance` guard to read
the observed offchain facts:

```ts
import { isEnsProvenance } from '@openzeppelin/adapter-evm-core';

const result = await cap.resolveName('alice.eth');
if (result.ok && isEnsProvenance(result.value.provenance)) {
  const p = result.value.provenance;
  p.external;          // true iff a CCIP-Read gateway was ACTUALLY traversed on THIS call (observed)
  p.coinType;          // ENSIP-9/11 coinType: 60 for mainnet-bound, chain-specific when scoped
  p.scopedToNetworkId; // present ONLY for a chain-scoped result → bind the address to THIS network
}
```

Narrow with `isEnsProvenance` — **never** by matching `provenance.label`. The guard checks the
always-present `system: 'ens'` discriminant; `label` is a display string that is free to change
(`'ENS'` vs `'ENS via external gateway'`).

## Key Concepts

- **The capability is Tier-2 (async, network-scoped).** It extends `RuntimeCapability`: the
  network is bound at construction time, and `dispose()` releases it. Switching networks means
  disposing and recreating the capability (the runtime handles this).
- **Injected viem client (dependency injection).** The factory takes a viem `PublicClient`;
  it never builds one. The client carries the transport, timeout, and CCIP-Read config, and
  its `chain` is what tells the capability whether the network supports ENS. The capability
  **borrows** the client — it never tears it down.
- **`strict: true` under the hood.** The one on-chain read runs viem's `getEnsAddress` with
  `strict: true` so distinct failure classes surface as typed reverts instead of silently
  collapsing into a `null`. This is a fund-safety choice: a wrong address is worse than a
  clear failure.
- **Discriminated result, closed error union.** Success is `{ ok: true, value }`; every
  expected failure is `{ ok: false, error }` where `error.code` is one of a fixed set. Switch
  on `error.code`, never on `error.message`.
- **Reverse is verify-or-nothing (Approach A).** `resolveAddress` never returns an unverified or
  mismatched name. Either it returns a name that provably forward-resolves back to the queried
  address (`forwardVerified: true`), or it returns `ADDRESS_NOT_FOUND`. There is no
  `forwardVerified: false` path in this adapter — the anti-spoofing decision is made *for* you.
- **Reverse miss-fallback (002 SF-1, Option B).** On a non-mainnet-bound adapter with a wired
  `ensL1Client`: when the bound chain has a Universal Resolver, bound reverse runs first; only on a
  **definitive empty** (no usable primary — not a gateway/transport failure) does the adapter consult
  mainnet L1 for the default primary (`coinType` 60). Bound-local hits win without L1; bound failures
  surface typed errors and **never** silently fall through to L1. Non-UR + L1 → L1 direct; non-UR + no
  L1 → `UNSUPPORTED_NETWORK`; mainnet-bound → bound only.
- **Reverse provenance scope (chain-agnostic gate).** Distinguish global vs network-local using base
  `scopedToNetworkId` **only** — absent ⇒ global / mainnet identity (show on any row); present ⇒
  network-local (hide on rows scoped to a different network). **Never** use `isEnsProvenance` or
  `coinType` as the display-safety gate (Principle II). L1 reverse hits may carry `EnsProvenance`
  (`coinType: 60`) as adapter-internal enrichment; Sepolia-local hits carry `scopedToNetworkId` without
  `EnsProvenance`.
- **Avatar is best-effort and isolated.** The reverse call fetches the avatar in a separate,
  failure- and latency-isolated step. A slow, failing, or missing avatar can only omit
  `avatarUrl` — it never delays past the reverse read's error surface and never fails the result.
- **ENS v2 = observed facts, never a version guess (`EnsProvenance`).** v2 is not a separate code
  path — it is served by the same `getEnsAddress` pipeline (viem's Universal Resolver has CCIP-Read
  built in). What SF-5 adds is *truthful provenance*: `external` is set to `true` **only** when an
  offchain gateway was actually traversed on that call (detected by observing the client's
  `ccipRead.request` hook), never inferred from the name. Narrow with `isEnsProvenance`.
- **Cross-chain is L1-only, via `coinType`.** ENS v2 has no L2 (Namechain was cancelled). A name
  scoped to another EVM chain resolves on **L1 mainnet** with `coinType = toCoinType(boundChainId)`
  (ENSIP-9/11). When a runtime wires the optional **`ensL1Client`**, a bound L2 network resolves
  chain-scoped names on L1 and the result carries `scopedToNetworkId` = the bound network's id, so
  you can bind the address to the right chain. Without `ensL1Client`, an L2-bound resolve still
  returns `UNSUPPORTED_NETWORK` — the L1 path is additive and gated.
- **Gateway failure is never a silent fallback (forward or reverse).** Forward: a v2 resolution is a
  **single** strict `getEnsAddress` call — CCIP-Read gateway failure → `EXTERNAL_GATEWAY_ERROR`. Reverse:
  a bound gateway/timeout failure returns a typed error and **does not** miss-fall back to L1; only a
  definitive empty triggers L1 consultation. L1 gateway failures likewise surface typed errors — never
  silent hex or invented names.
- **Default-primary-only on L1 reverse (not ENSIP-19 L2 primary).** L1 `getEnsName` uses viem's
  default `coinType` 60 (mainnet primary). An address with only an ENSIP-19 L2-scoped primary and no
  coinType-60 primary returns `ADDRESS_NOT_FOUND` after the L1 attempt — not an L2 name. Product UX
  should treat that as "no display name," not a bug.

## API Reference

See [api-reference.md](./api-reference.md) for the full typed surface — the factory, the
service, `isValidName`, `resolveName`, `resolveAddress`, `baseEnsProvenance`, and every error code.

## Integration Guide

See [integration-guide.md](./integration-guide.md) for end-to-end patterns — runtime
registration, the consumer resolve loop, and common mistakes. Runnable examples live in
[`examples/`](./examples/).

## Safety

- **Never throws for expected failures.** `resolveName` resolves to `{ ok: false, error }`
  for every anticipated failure (no record, unsupported network/name, timeout, gateway error,
  unclassifiable transport error). The **only** exception it will ever throw is
  `RuntimeDisposedError`, raised by the runtime guard when you call a method on a disposed
  capability — a programmer error, not a resolution outcome.
- **No coerced or placeholder addresses.** A success result always carries a real
  forward-resolved address. An empty record maps to `NAME_NOT_FOUND` — it never returns
  `{ ok: true }` with a zero/placeholder address.
- **Reverse names are always forward-verified — never a spoofed name (anti-spoofing crux).** A
  reverse (primary-name) record is attacker-settable: anyone can point their address's reverse
  record at `vitalik.eth`. `resolveAddress` defends against this by **suppressing** any name that
  does not forward-resolve back to the queried address — a forward-mismatch folds to
  `ADDRESS_NOT_FOUND`, so the mismatched name is **never surfaced**. Consequently `forwardVerified`
  is a concrete boolean that is **constant `true`** on every returned name. The `ResolvedName` type
  still *permits* `forwardVerified: false` (the shared contract reserves it for adapters that
  choose to surface unverified names); **this EVM adapter never emits it.** Render `rev.value.name`
  directly; you do not need to re-verify.
- **Avatar URI is untrusted, name-owner-controlled content (reverse path only).** `avatarUrl`, when
  present on a `resolveAddress` success, is returned verbatim from the ENS `avatar` text record via
  viem's `getEnsAvatar` / `parseAvatarRecord` — the adapter does not fetch, validate, gateway, or
  sanitize the asset. ENS avatar records may use several URI schemes (`https://`, `data:`,
  `ipfs://`, `eip155:…` NFT references, etc.); viem may resolve NFT/IPFS references to a final URI,
  but the adapter still passes through whatever string viem returns without normalizing scheme. Treat
  it as untrusted: fetch with SSRF-safe egress, guard against mixed content, and sandbox rendering.
  **`<img src>` consumers** that only allow `https:` and `data:image/*` must gateway `ipfs://` URIs
  to an HTTPS URL (e.g. `https://ipfs.io/ipfs/<cid>`) before rendering — an `ipfs://` value will
  otherwise fail closed and not display. Gatewaying inside the adapter (opt-in, with an explicit
  gateway host) would be a cleaner contract for UI consumers but is **not** done today.
- **Forward provenance carries no avatar.** `EnsProvenance` (`system`, `coinType`,
  `scopedToNetworkId`, `external`) describes how the *address* was resolved, not display metadata.
  Avatars are reverse-only (`avatarUrl` on `ResolvedName`).
- **ENS resolution starts on L1 (forward); reverse may miss-fallback to L1.** The forward path uses
  the bound client when the bound chain carries an ENS Universal Resolver (mainnet-bound, `coinType` 60);
  otherwise, **iff** the runtime wired an `ensL1Client`, it resolves the name chain-scoped on L1
  (`coinType = toCoinType(boundChainId)`) and stamps `scopedToNetworkId`. A bound network with no
  Universal Resolver **and** no `ensL1Client` returns `UNSUPPORTED_NETWORK` **before any I/O** — there
  is never a silent cross-chain fallback. The reverse path (`resolveAddress`) uses the same injected
  `ensL1Client` under the Option B ladder (002 SF-1): bound-first on UR-carrying chains, L1 only after
  definitive empty or when the bound chain has no UR.
- **Chain-scoped addresses must be bound to their network.** When `provenance.scopedToNetworkId` is
  present on a **forward** result (`coinType !== 60`), the resolved address is meaningful **only** on
  that network. On **reverse**, `scopedToNetworkId` marks a **bound-local primary name** (network-local
  identity), not an address scope — use the same gate: hide when the row's network ≠ `scopedToNetworkId`.
  When absent on reverse, the name is global / mainnet identity — safe to show on any row.
- **Network scope is bound at construction — re-resolve to change it.** `resolveName(name)` has no
  target-network parameter; the `coinType` and `scopedToNetworkId` on a success reflect the
  capability's **bound** `NetworkConfig` (the network the runtime was created with). To resolve a name
  for a different network (e.g. when the user's active chain differs from a prior result's
  `scopedToNetworkId`), obtain a `NameResolutionCapability` bound to that target network and call
  `resolveName` again — typically by dispose-and-recreating the runtime with the new config. See the
  [Integration Guide](./integration-guide.md), Pattern 7. When absent, the result is an unscoped mainnet
  address.
- **Provenance `label` is a display string, not a discriminant.** `label` is a curated, user-safe
  literal — either `'ENS'` or `'ENS via external gateway'` (chosen from the observed `external`).
  Never a URL or gateway host. Do not branch program logic on it; narrow with `isEnsProvenance` and
  read `external` / `coinType` / `scopedToNetworkId`.
- **`external` is observed, not asserted.** `provenance.external` is `true` **iff** an `OffchainLookup`
  (CCIP-Read) was actually followed during that resolution — a fact the adapter substantiated, not a
  guess from the name. Concurrent resolves never cross-contaminate it (each call observes its own).
- **No secret leakage.** Error variants carry only curated, user-safe fields; an
  unclassifiable error's underlying value is preserved on `ADAPTER_ERROR.cause` by reference
  for your own logging — the human-facing `message` is redacted of credential-shaped content
  by the mapping layer.
- **Additive & optional.** The capability is optional at the runtime-map level. Non-EVM
  adapters omit it entirely — always feature-detect (`cap?.resolveName`) before use.

## License

Inherits the `@openzeppelin/adapter-evm-core` package license.
