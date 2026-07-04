# ENS Name Resolution — EVM Adapter

> Turn an ENS name (`alice.eth`) into a checksummed address, and turn an address back into the
> name it **verifiably** owns — through the EVM adapter's `NameResolutionCapability`. A typed
> result on success, a distinct typed error code on failure, and **no thrown exceptions on any
> expected failure path**.

This is the EVM **name-resolution** capability delivered in `@openzeppelin/adapter-evm-core`,
covering both directions plus ENS v2:

- **Forward** (name → address), SF-2 — backs the UIKit's address-input path so a dapp can accept
  ENS names without any bespoke ENS code.
- **Reverse** (address → name + avatar), SF-3 — backs the UIKit's display path so a dapp can show
  `alice.eth` instead of `0xd8dA…`, **without ever rendering a spoofed name as trusted**.
- **ENS v2** (L1-only: CCIP-Read / offchain gateways + cross-chain via `coinType`), SF-5 — every
  forward result now carries an EVM-specific `EnsProvenance` with **observed** offchain facts you
  narrow to via `isEnsProvenance`, and an L2-bound runtime can resolve chain-scoped names on L1.

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
- No **avatar image fetching, caching, sanitization, or SSRF / mixed-content hardening** — the
  reverse path returns the avatar *URL* verbatim; fetching and safely rendering it is the
  consumer's responsibility (see Safety).
- No **`EnsProvenance` on reverse results** — `resolveAddress` (SF-3) still carries the base
  `ResolutionProvenance`, so `isEnsProvenance` narrows `false` on a reverse result. The v2
  provenance upgrade is forward-path only.
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
// Feature-detect the reverse method specifically — it may be absent on older adapters.
if (!cap.resolveAddress) return; // show truncated hex

const rev = await cap.resolveAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
if (rev.ok) {
  // rev.value.name is SAFE to render as-is: forwardVerified is always true here.
  display(rev.value.name);                       // e.g. 'vitalik.eth'
  if (rev.value.avatarUrl) showAvatar(rev.value.avatarUrl); // optional, best-effort
} else if (rev.error.code === 'ADDRESS_NOT_FOUND') {
  display(truncate('0xd8dA6BF…'));               // no verified name → show hex
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
- **Gateway failure is never a silent fallback.** A v2 resolution is a **single** strict
  `getEnsAddress` call. If the CCIP-Read gateway fails, you get `EXTERNAL_GATEWAY_ERROR` — distinct
  from `NAME_NOT_FOUND`, and never a quiet retry that returns a stale on-chain result.

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
- **Avatar URL is untrusted, name-owner-controlled content.** `avatarUrl`, when present, is
  returned verbatim from the ENS `avatar` text record — the adapter does not fetch, validate, or
  sanitize the asset. Treat it as untrusted: fetch it with SSRF-safe egress rules, guard against
  mixed content, and sandbox rendering. Fetching/rendering safety is the consumer's job (UIKit).
- **ENS resolution starts on L1.** The forward path uses the bound client when the bound chain
  carries an ENS Universal Resolver (mainnet-bound, `coinType` 60); otherwise, **iff** the runtime
  wired an `ensL1Client`, it resolves the name chain-scoped on L1 (`coinType = toCoinType(boundChainId)`)
  and stamps `scopedToNetworkId`. A bound network with no Universal Resolver **and** no `ensL1Client`
  returns `UNSUPPORTED_NETWORK` **before any I/O** — there is never a silent cross-chain fallback.
  The reverse path (`resolveAddress`) remains mainnet-style L1 only.
- **Chain-scoped addresses must be bound to their network.** When `provenance.scopedToNetworkId` is
  present (a `coinType !== 60` result), the resolved address is meaningful **only** on that network —
  treat it as scoped, not as a plain mainnet address. When absent, the result is an unscoped mainnet
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
