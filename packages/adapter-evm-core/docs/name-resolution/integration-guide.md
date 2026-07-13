# Integration Guide — ENS Name Resolution (forward SF-2 · reverse SF-3 · ENS v2 SF-5 · L1 reverse SF-1)

How to wire and use the EVM name-resolution capability. A few patterns cover almost every
consumer: **register** the capability into an EVM runtime, **call** forward resolution (name →
address) from a consumer, **call** reverse resolution (address → name, for display), **read ENS v2
provenance** (SF-5), **wire the optional L1 cross-chain client**, **apply the reverse miss-fallback
ladder and chain-agnostic scope gate** (002 SF-1), and **test** against a mocked client.

> Scope: all four delivered slices — forward (SF-2), reverse + avatar (SF-3), ENS v2 (SF-5:
> `EnsProvenance` on every forward result, observed `external`, the optional `ensL1Client` for L1
> cross-chain resolution, and `coinType` / `scopedToNetworkId` scoping), and mainnet-L1 reverse
> miss-fallback (002 SF-1: bound-first, empty-only L1 consult, provenance scope via base
> `scopedToNetworkId`). Registration (Pattern 1) is shared — one capability instance, one bound
> client plus an optional L1 client, serves `resolveName` and `resolveAddress` alike.

---

## Pattern 1: Register the capability into an EVM runtime

The capability needs a viem `PublicClient`. The registration layer builds it (where
`config.viemChain` is in scope) and injects it — this is the seam that lets the capability
inherit the runtime's transport, timeout, and CCIP-Read configuration.

In `packages/adapter-evm/src/profiles/shared.ts`, a `nameResolution` slot is added to **both**
the eager and lazy capability factory maps, threading the injected bound client **and** the
optional dedicated mainnet `ensL1Client` (SF-5) that enables L1 cross-chain resolution:

```ts
import { mainnet } from 'viem/chains';
import { createNameResolution } from '../capabilities';
import { createEvmPublicClient, resolveRpcUrl } from '@openzeppelin/adapter-evm-core';
import type { NetworkConfig } from '@openzeppelin/ui-types';

// (SF-2) the bound per-network client — carries the bound chain's Universal Resolver when it has one
const ensClient = (config: TypedEvmNetworkConfig) =>
  createEvmPublicClient(resolveRpcUrl(config), config.viemChain);

// (SF-5) a dedicated MAINNET client — the ENS v2 Universal-Resolver entry point. `mainnet` always
// carries `contracts.ensUniversalResolver`. RPC precedence: reuse the configured endpoint when the
// bound network IS mainnet (honor a user's keyed RPC), else viem's default public mainnet transport
// (documented rate-limit caveat).
const resolveMainnetRpcUrl = (config: TypedEvmNetworkConfig): string =>
  config.chainId === mainnet.id ? resolveRpcUrl(config) : mainnet.rpcUrls.default.http[0];
const ensL1Client = (config: TypedEvmNetworkConfig) =>
  createEvmPublicClient(resolveMainnetRpcUrl(config), mainnet);

// in the capability factory map (both eager and lazy):
nameResolution: (config: NetworkConfig) => {
  const typed = toTypedEvmNetworkConfig(config);
  return createNameResolution(typed, {
    publicClient: ensClient(typed),     // bound client (D-A) — unchanged
    ensL1Client:  ensL1Client(typed),   // SF-5 — enables the L1 cross-chain path
  });
},
```

Notes:

- For ENS-supporting networks (mainnet and most L1/L2s viem ships), `config.viemChain` carries
  `contracts.ensUniversalResolver`, so the **bound** client resolves mainnet-bound (`coinType` 60).
- For a network whose bound chain has **no** Universal Resolver (an L2), the wired `ensL1Client`
  lets `resolveName` resolve the name **chain-scoped on L1** (`coinType = toCoinType(boundChainId)`),
  and the success provenance carries `scopedToNetworkId`. It also enables **reverse** miss-fallback
  and direct L1 reverse (002 SF-1) — same injection, no second config knob. Omit `ensL1Client` and
  that same L2-bound forward resolve returns `UNSUPPORTED_NETWORK`; reverse on non-UR chains likewise
  returns `UNSUPPORTED_NETWORK` before I/O.
- Wiring `ensL1Client` is a one-time cost per capability instance (a borrowed client). Forward: the L1
  hop only happens when the bound chain has no UR. Reverse: L1 is consulted after a **definitive bound
  empty** on UR-carrying non-mainnet chains, or directly when the bound chain has no UR — never on bound
  gateway/transport failure, and never redundantly on mainnet-bound reverse.
- No cleanup registration is needed — a viem `http` client holds no handle requiring teardown,
  and the capability borrows (does not own) **either** client.
- Both v1 and v2 forward resolution rely on viem's **default** CCIP-Read handling (the Universal
  Resolver has ERC-3668 offchain lookup built in). No custom gateway configuration is needed.

Non-EVM adapters (`adapter-solana`, `-midnight`, `-polkadot`, `-stellar`) simply omit the
`nameResolution` slot — the capability is optional at the runtime-map level, so they continue to
type-check and run unchanged.

---

## Pattern 2: Call the capability from a consumer

The typical consumer (a UIKit hook, a dapp form) follows a three-step loop: **feature-detect →
cheap sync pre-check → the one async call**.

```ts
import type { NameResolutionCapability } from '@openzeppelin/ui-types';

async function resolveEnsInput(
  runtime: { nameResolution?: NameResolutionCapability },
  input: string,
): Promise<string | { unsupported: true } | { rejected: string }> {
  const cap = runtime.nameResolution;

  // (1) Feature-detect. Non-EVM adapters omit the capability entirely.
  if (!cap?.resolveName) return { unsupported: true };

  // (2) Cheap synchronous pre-check — no network round-trip. Ideal on every keystroke.
  if (!cap.isValidName(input)) return { rejected: 'not a resolvable ENS name' };

  // (3) The one async call. Never throws for an expected failure.
  const result = await cap.resolveName(input);
  if (result.ok) {
    // result.value.address is checksummed hex. result.value.provenance is an EnsProvenance
    // (narrow with isEnsProvenance to read external / coinType / scopedToNetworkId — see Pattern 5).
    return result.value.address;
  }

  // Switch on the CODE, not the message.
  switch (result.error.code) {
    case 'NAME_NOT_FOUND':         return { rejected: `no record for ${result.error.name}` };
    case 'UNSUPPORTED_NETWORK':    return { unsupported: true };
    case 'UNSUPPORTED_NAME':       return { rejected: result.error.reason };
    case 'RESOLUTION_TIMEOUT':     return { rejected: `timed out after ${result.error.elapsedMs}ms` };
    case 'EXTERNAL_GATEWAY_ERROR': return { rejected: `gateway error: ${result.error.detail}` };
    case 'ADAPTER_ERROR':
      console.error('unclassified resolution error', result.error.cause);
      return { rejected: result.error.message };
    // 'ADDRESS_NOT_FOUND' is unreachable from resolveName (reverse-only, SF-3)
  }
}
```

**Why the sync pre-check matters.** `isValidName` is pure and does no I/O, so a UIKit can call it
on every keystroke to gate the "resolve" affordance without spamming the RPC. A `true` means the
input is *shaped* like an ENS name — it does not mean a record exists (that's what `resolveName`
determines).

---

## Pattern 3: Reverse-resolve an address for display (address → name + avatar)

The display path is the mirror of Pattern 2: **feature-detect → the one async call**. There is no
sync pre-check (an address either is or isn't well-formed; a malformed one folds to
`ADDRESS_NOT_FOUND` inside the call). The key property to internalize: **a returned name is always
safe to render** — the adapter has already forward-verified it, so you never risk showing a spoofed
name as trusted.

```ts
import type { NameResolutionCapability } from '@openzeppelin/ui-types';

type Display =
  | { kind: 'name'; name: string; avatarUrl?: string }
  | { kind: 'hex' };  // fall back to truncated hex

async function displayForAddress(
  runtime: { nameResolution?: NameResolutionCapability },
  address: string,
): Promise<Display> {
  const cap = runtime.nameResolution;

  // (1) Feature-detect the reverse method specifically. It is optional on the interface, and a
  // non-EVM (or forward-only) adapter may not implement it.
  if (!cap?.resolveAddress) return { kind: 'hex' };

  // (2) The one async call. Never throws for an expected failure.
  const result = await cap.resolveAddress(address);
  if (result.ok) {
    // result.value.name is ALREADY forward-verified (forwardVerified === true). Render as-is.
    // Chain-agnostic scope gate (002 SF-1) — see Pattern 8 before showing on a network-scoped row.
    return { kind: 'name', name: result.value.name, avatarUrl: result.value.avatarUrl };
  }

  // Switch on the CODE. ADDRESS_NOT_FOUND = no verified name for display.
  // RESOLUTION_TIMEOUT / EXTERNAL_GATEWAY_ERROR = infrastructure failure — NOT an empty record;
  // on UR-carrying chains the adapter did NOT fall through to L1 (002 SF-1 INV-9).
  switch (result.error.code) {
    case 'ADDRESS_NOT_FOUND':      return { kind: 'hex' };
    case 'UNSUPPORTED_NETWORK':    return { kind: 'hex' };
    case 'RESOLUTION_TIMEOUT':
    case 'EXTERNAL_GATEWAY_ERROR': return { kind: 'hex' }; // consider surfacing error vs silent hex
    case 'ADAPTER_ERROR':
      console.error('unclassified reverse-resolution error', result.error.cause);
      return { kind: 'hex' };
    // 'NAME_NOT_FOUND' / 'UNSUPPORTED_NAME' are unreachable from resolveAddress
  }
}
```

**Why `ADDRESS_NOT_FOUND` is the whole anti-spoofing story.** A reverse record is attacker-settable
— anyone can point their address's primary name at `vitalik.eth`. The adapter forward-verifies
every name (inside viem's Universal Resolver) and **suppresses** any that doesn't round-trip, so a
forward-mismatch is indistinguishable from "no record" at your call site: both are
`ADDRESS_NOT_FOUND`. You never receive a mismatched name to guard against. For display, treat every
non-`ok` reverse result identically: render truncated hex.

**Avatar, defensively.** `avatarUrl` is a URI from the name owner's ENS `avatar` text record,
passed through verbatim on `ResolvedName` (reverse path only — not in `EnsProvenance`). ENS avatar
records may be `https://`, `data:`, `ipfs://`, or `eip155:…` NFT references; viem's
`getEnsAvatar` / `parseAvatarRecord` may follow NFT/IPFS hops, but the adapter does not normalize
scheme. Before rendering:

- **`<img src>` / CSP-restricted UIs** that only allow `https:` and `data:image/*` must gateway
  `ipfs://` URIs to HTTPS (e.g. `https://ipfs.io/ipfs/<cid>`) — an `ipfs://` value will otherwise
  fail closed and not display.
- Fetch through SSRF-safe egress, block mixed content, and sandbox the `<img>` (or proxy it).

The adapter does none of this for you — it only surfaces the string, best-effort, and omits it on
any failure. Gatewaying `ipfs://` → `https://` inside the adapter (with an explicit, opt-in gateway
host) would be a cleaner contract for UI consumers but is **not** implemented today.

---

## Pattern 4: Test against a mocked client (no live chain)

Because the client is injected, unit tests supply a minimal structural mock — no network, no
fork. The capability reads only two things from the client: `chain.contracts.ensUniversalResolver`
(the support-gate) and `getEnsAddress` (the one call).

```ts
import { createNameResolution } from '@openzeppelin/adapter-evm-core';
import type { PublicClient } from 'viem';

const client = {
  chain: { contracts: { ensUniversalResolver: { address: '0x…' } } },
  getEnsAddress: async ({ name, strict }: { name: string; strict?: boolean }) => {
    // assert strict === true if you want to pin the fund-safety contract
    return name === 'vitalik.eth' ? '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' : null;
  },
} as unknown as PublicClient;

const cap = createNameResolution(evmNetworkConfig, { publicClient: client });

await cap.resolveName('vitalik.eth'); // { ok: true, value: { address: '0xd8dA6BF…', … } }
await cap.resolveName('nope.eth');    // { ok: false, error: { code: 'NAME_NOT_FOUND', name } }
```

To test the unsupported-network path, hand it a client whose `chain` has no
`ensUniversalResolver` — `resolveName` returns `UNSUPPORTED_NETWORK` and **never calls
`getEnsAddress`**.

Reverse resolution reads `getEnsName` (and, on success, `getEnsAvatar`) from the same client:

```ts
const client = {
  chain: { contracts: { ensUniversalResolver: { address: '0x…' } } },
  // getEnsName forward-verifies internally: a returned name is ALWAYS verified. Return null
  // (or throw a ReverseAddressMismatch/ResolverNotFound revert) to model the no-verified-name case.
  getEnsName: async ({ address, strict }: { address: string; strict?: boolean }) =>
    address === '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' ? 'vitalik.eth' : null,
  // Avatar is best-effort. Have it throw or return null to prove the reverse result is unaffected.
  getEnsAvatar: async ({ name }: { name: string }) =>
    name === 'vitalik.eth' ? 'https://example.com/vitalik.png' : null,
} as unknown as PublicClient;

const cap = createNameResolution(evmNetworkConfig, { publicClient: client });

await cap.resolveAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
// { ok: true, value: { name: 'vitalik.eth', forwardVerified: true, avatarUrl: 'https://…', … } }
await cap.resolveAddress('0x0000000000000000000000000000000000000001');
// { ok: false, error: { code: 'ADDRESS_NOT_FOUND', address } }
```

Two reverse-specific assertions worth pinning: (1) make `getEnsAvatar` **throw** and confirm the
reverse result is still `{ ok: true }` with **no** `avatarUrl` key (avatar isolation); (2) pass a
malformed address (`'0xnope'`) and confirm `ADDRESS_NOT_FOUND` is returned **without** `getEnsName`
being called (sync shape-gate, before any I/O).

---

## Pattern 5: Read ENS v2 provenance (`EnsProvenance`)

ENS v2 does not add a new method — v2 names resolve through the **same** `resolveName` call. What
SF-5 adds is richer, **truthful** provenance on every forward success. To read it, narrow the
`provenance` with the exported `isEnsProvenance` guard:

```ts
import { createNameResolution, isEnsProvenance } from '@openzeppelin/adapter-evm-core';
import type { NameResolutionCapability } from '@openzeppelin/ui-types';

async function resolveWithProvenance(
  cap: NameResolutionCapability,
  name: string,
): Promise<{ address: string; viaGateway: boolean; scopedTo?: string } | { failed: string }> {
  const result = await cap.resolveName(name);
  if (!result.ok) return { failed: result.error.code };

  const { address, provenance } = result.value;

  // Narrow on the `system` discriminant — NEVER on provenance.label.
  if (isEnsProvenance(provenance)) {
    return {
      address,
      viaGateway: provenance.external,          // OBSERVED CCIP-Read traversal on THIS call
      scopedTo:   provenance.scopedToNetworkId,  // present ⇒ address is scoped to this network
      // provenance.coinType // 60 for mainnet-bound; chain-specific (e.g. Base) when scoped
    };
  }
  // Base provenance without `system` (e.g. a future/other adapter) — still a valid address.
  return { address, viaGateway: provenance.external };
}
```

Key properties to internalize:

- **`external` is observed, not guessed.** It is `true` **iff** an off-chain CCIP-Read gateway was
  actually traversed during that call — including on the mainnet-bound path (the primary v2 case).
  You can trust it as a fact, not a heuristic.
- **`scopedToNetworkId` means "bind here".** When present, the resolved address is meaningful only
  on that network (a cross-chain / `coinType`-scoped result). Use it to tag the address with its
  chain; do not treat it as a plain mainnet address. When absent, the result is unscoped mainnet.
- **Narrow, don't string-match.** `isEnsProvenance` checks the always-present `system: 'ens'`
  discriminant. `provenance.label` is a display string with two values (`'ENS'` /
  `'ENS via external gateway'`) — matching on it is a bug.
- **Reverse results: scope via base `scopedToNetworkId` only (Pattern 8).** On L1 miss-fallback/direct
  successes, `isEnsProvenance` may return `true` (`coinType: 60`) — that is **adapter-internal
  enrichment**, not the chain-agnostic display gate. On bound-local hits (e.g. a Sepolia primary),
  `scopedToNetworkId` is present and `isEnsProvenance` is `false`. Never gate display on `coinType`.

## Pattern 6: L1 cross-chain resolution from an L2-bound runtime

ENS v2 is **L1-only** (there is no ENS L2 — Namechain was cancelled). A name scoped to another EVM
chain resolves on **mainnet** with that chain's `coinType`. If your runtime binds an L2 network and
you want ENS names to resolve, wire the optional `ensL1Client` (Pattern 1). Then:

```ts
// Runtime bound to, say, Base (chainId 8453). The bound chain has no Universal Resolver, but an
// ensL1Client (mainnet) was wired at registration.
const result = await runtime.nameResolution.resolveName('alice.eth');

if (result.ok && isEnsProvenance(result.value.provenance)) {
  const p = result.value.provenance;
  // p.coinType          === 2147492101   (Base's ENSIP-11 coinType — chain-scoped)
  // p.scopedToNetworkId === '<your Base networkId>'  (bind the address to Base)
  // p.external            reflects whether a CCIP-Read gateway was traversed
  bindAddressToNetwork(result.value.address, p.scopedToNetworkId!);
}
```

What happens under the hood, in precedence order:

1. Bound chain **has** a UR → resolve on the bound client, `coinType = 60` (mainnet-bound, unscoped).
2. Bound chain has **no** UR, `ensL1Client` wired → resolve on L1 with
   `coinType = toCoinType(boundChainId)`; result carries `scopedToNetworkId`.
3. `toCoinType(boundChainId)` throws (a non-ENSIP-11 chainId, e.g. a non-EVM chain) →
   `UNSUPPORTED_NETWORK`, synchronously, before any I/O.
4. Bound chain has **no** UR and **no** `ensL1Client` → `UNSUPPORTED_NETWORK` (SF-2 parity).

**There is never a silent v2→v1 fallback.** Each resolution is a single `strict: true`
`getEnsAddress` call; a CCIP-Read gateway failure surfaces as `EXTERNAL_GATEWAY_ERROR` (distinct
from `NAME_NOT_FOUND`), never a quiet retry that returns a stale on-chain address. "L1 path" is a
*client-selection* choice made before the call — not a fallback after one fails.

---

## Pattern 7: Re-resolve a name for the user's active network (`scopedToNetworkId` mismatch)

A forward `resolveName` result carries **network scope in provenance**, not as a call parameter.
The capability is **Tier-2 / network-bound**: `coinType` and `scopedToNetworkId` reflect the
`NetworkConfig` the capability was constructed with — there is no `resolveName(name, { networkId })`
overload.

**When to re-resolve.** If a consumer holds a prior success whose `provenance.scopedToNetworkId`
differs from the user's currently selected network, the stored address is scoped to the *old* network.
Do **not** treat it as valid on the new network, and do **not** fail-safe block indefinitely — call
`resolveName` again on a capability bound to the **target** network.

**How the adapter scopes a call** (fixed at construction; see `service.resolveName`):

| Bound network | Client used | `coinType` | `scopedToNetworkId` on success |
|---------------|-------------|------------|--------------------------------|
| Has Universal Resolver (e.g. mainnet) | bound `publicClient` | `60` (ETH / mainnet) | **absent** (unscoped mainnet address) |
| No UR, `ensL1Client` wired (e.g. Base) | mainnet `ensL1Client` | `deriveCoinType(boundChainId)` (ENSIP-11, e.g. Base → `2147492101`) | **present** = bound `networkConfig.id` |
| No UR, no `ensL1Client` | — | — | `UNSUPPORTED_NETWORK` (sync, before I/O) |

`deriveCoinType` is viem's `toCoinType(chainId)` — the ENSIP-9/11 forward map. There is no
coinType→chainId inverse in the adapter; the bound network **is** the scope target.

**Consumer contract (re-resolution loop):**

```ts
import { isEnsProvenance } from '@openzeppelin/adapter-evm-core';
import type { NameResolutionCapability } from '@openzeppelin/ui-types';

/** Capability bound to the network the user has selected (dispose-and-recreate runtime as needed). */
async function resolveForActiveNetwork(
  cap: NameResolutionCapability,
  activeNetworkId: string,
  name: string,
) {
  const result = await cap.resolveName(name);
  if (!result.ok) return result;

  if (isEnsProvenance(result.value.provenance)) {
    const scoped = result.value.provenance.scopedToNetworkId;
    // Unscoped (coinType 60) → mainnet address, valid when active network is mainnet-bound.
    // Scoped → address is meaningful ONLY on scopedToNetworkId.
    if (scoped !== undefined && scoped !== activeNetworkId) {
      // Mismatch: this capability is bound to a different network than the result's scope.
      // Re-obtain a NameResolutionCapability for `activeNetworkId` and call resolveName again.
      // Do not reuse the address from this result on the active network.
      return { needsRebind: true as const, priorScope: scoped };
    }
  }
  return result;
}
```

**What the adapter does *not* provide:**

- No per-call `networkId` / `coinType` override on `resolveName` — scope is entirely from the bound
  `NetworkConfig` + wired clients (`publicClient`, optional `ensL1Client`).
- No multi-network resolve in one capability instance — switching networks means dispose-and-recreate
  the runtime (or otherwise obtain a fresh capability for the target `NetworkConfig`).
- Reverse (`resolveAddress`) carries **provenance scope** via base `scopedToNetworkId` (002 SF-1) —
  see Pattern 8. Re-resolution for forward send paths only uses Pattern 7.

**UI-only note:** Choosing when to re-resolve (debounce, loading state, fail-safe block vs. auto
re-resolve) is consumer/UIKit policy. The adapter supplies the scoped provenance facts and a
network-bound `resolveName`; the UI wires the active-network capability and triggers the second call.

---

## Pattern 8: Reverse miss-fallback ladder + chain-agnostic scope gate (002 SF-1)

On non-mainnet-bound adapters with the standard `ensL1Client` injection (Pattern 1), `resolveAddress`
follows an **Option B miss-fallback ladder**. Forward asymmetry is preserved: `resolveName` does **not**
gain miss-fallback.

### Ladder (behavioral)

| Bound network | `ensL1Client` | What happens |
|---------------|---------------|--------------|
| Mainnet (has UR) | any | Bound reverse only — no L1 hop, even on empty |
| UR-carrying non-mainnet (e.g. Sepolia) | wired | Bound reverse first → name hit: stop with bound-local provenance → bound **empty**: one L1 consult → bound **failure** (timeout/gateway): typed error, **no L1** |
| No UR (e.g. Base) | wired | L1 reverse direct (default primary, `coinType` 60) |
| No UR | absent | `UNSUPPORTED_NETWORK` (sync, before I/O) |

**Miss-fallback discipline:** L1 fires **only** on a definitive empty/no-record from bound reverse
(`null`, Approach A mismatch, resolver-semantic reverts). Gateway/transport/timeout on bound reverse
returns `RESOLUTION_TIMEOUT` or `EXTERNAL_GATEWAY_ERROR` and **never** consults L1. This is
**distinct from** forward's single-call / no v2→v1 error-fallback rule (SF-5).

### Provenance three-row contract (D-R7 / INV-28)

Scope is keyed on **where the name resolved**, via base `scopedToNetworkId` **only**:

| Path | `scopedToNetworkId` | `isEnsProvenance` | Meaning for display gate |
|------|---------------------|-------------------|--------------------------|
| Bound hit on **mainnet** | **absent** | `false` | Global / mainnet identity — show on any row |
| Bound hit on **non-mainnet** UR chain (e.g. Sepolia local primary) | **present** = bound `networkId` | `false` | Network-local — hide on rows for other networks |
| **L1** hit (miss-fallback or direct) | **absent** | **`true`** (`coinType: 60`) | Global / mainnet identity — show on any row |

**Principle II (chain-agnostic consumers):** the UIKit `AddressNameResolutionProvider` gate (and any
chain-agnostic code) **MUST** branch on `scopedToNetworkId` only — **MUST NOT** import
`isEnsProvenance`, inspect `coinType`, or narrow to `EnsProvenance` for display safety. EVM-aware
callers may read `coinType` / `external` after narrowing as enrichment only.

```ts
import type { ResolutionProvenance } from '@openzeppelin/ui-types';

/** Chain-agnostic gate — safe in UIKit without EVM imports. */
function reverseNameVisibleOnRow(
  provenance: ResolutionProvenance,
  rowNetworkId: string,
): boolean {
  const scope = provenance.scopedToNetworkId;
  // Absent scope ⇒ global / mainnet identity — show anywhere.
  if (scope === undefined) return true;
  // Present ⇒ network-local primary — show only on matching row.
  return scope === rowNetworkId;
}

// Usage after resolveAddress success:
if (rev.ok && reverseNameVisibleOnRow(rev.value.provenance, activeNetworkId)) {
  display(rev.value.name);
}
```

**`isEnsProvenance(reverse)` on L1 hits:** after a Sepolia miss-fallback to mainnet L1, the success
provenance is an `EnsProvenance` (`system: 'ens'`, `coinType: 60`, observed `external`) with **absent**
`scopedToNetworkId`. That is intentional adapter-internal enrichment — **not** the scope signal. A
Sepolia-local bound hit has `scopedToNetworkId === 'sepolia'` (or your bound id) and `isEnsProvenance ===
false`. Do not teach "`isEnsProvenance` ⇒ global name" — use `scopedToNetworkId` absence instead.

### Default-primary vs ENSIP-19 L2-primary (UX caveat)

L1 reverse uses viem's default `coinType` 60 (Ethereum mainnet primary). It does **not** pass
`toCoinType(boundChainId)`. An address whose only reverse record is an ENSIP-19 **L2-scoped** primary
(with no coinType-60 primary) returns `ADDRESS_NOT_FOUND` after the L1 attempt — not the L2 name.
Product copy should treat that as "no ENS display name," not a resolution bug. ENSIP-19 L2-primary
reverse is deferred product scope.

### Mocked test snippet (Sepolia miss-fallback)

```ts
import { createEvmNameResolutionService } from '@openzeppelin/adapter-evm-core';
import type { PublicClient } from 'viem';

const boundClient = {
  chain: { id: 11155111, contracts: { ensUniversalResolver: { address: '0xeeee…' } } },
  getEnsName: async () => null, // definitive empty on Sepolia
  getEnsAvatar: async () => null,
} as unknown as PublicClient;

const l1Client = {
  chain: { id: 1, contracts: { ensUniversalResolver: { address: '0x…' } } },
  getEnsName: async () => 'vitalik.eth',
  getEnsAvatar: async () => 'https://example.com/avatar.png',
} as unknown as PublicClient;

const service = createEvmNameResolutionService(
  { id: 'sepolia', chainId: 11155111 /* … */ } as never,
  boundClient,
  l1Client,
);

const result = await service.resolveAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
// result.ok === true; result.value.name === 'vitalik.eth'
// result.value.provenance.scopedToNetworkId === undefined  (global — gate shows on any row)
// isEnsProvenance(result.value.provenance) === true         (enrichment only — not the gate)
```

See [`examples/reverse-miss-fallback/`](./examples/reverse-miss-fallback/) for a runnable mock.

---

## Common Mistakes

- **Switching on `error.message` instead of `error.code`.** Messages are for humans and are not
  stable; the `code` is the contract. Always `switch (result.error.code)`.
- **Skipping the feature-detect.** Non-EVM adapters omit the capability — `runtime.nameResolution`
  can be `undefined`. Guard with `cap?.resolveName` before use, and don't assume `resolveAddress`
  is present (it's SF-3).
- **Treating `isValidName === true` as "this name resolves".** It only asserts shape. You still
  need `resolveName` to know whether a record exists.
- **Expecting a thrown error on failure.** `resolveName` does not throw for expected failures —
  it resolves to `{ ok: false, error }`. The only throw is `RuntimeDisposedError` if you call a
  method on a disposed capability (a lifecycle bug, not a resolution outcome). You do not need a
  `try/catch` around normal resolution.
- **Branching on `provenance.label`.** It is a display literal — `'ENS'` **or**
  `'ENS via external gateway'` — not a discriminant. Narrow with `isEnsProvenance` and read
  `external` / `coinType` / `scopedToNetworkId`. Matching `label === 'ENS'` is a bug (it silently
  misses every gateway-resolved name).
- **Constructing the viem client inside the capability.** Don't — inject it (both `publicClient`
  and `ensL1Client`). Internal construction would lose the runtime's transport/timeout/CCIP-Read
  config and silently break ENS when `viemChain` is absent.
- **Expecting L2 → L1 resolution without wiring `ensL1Client`.** The L1 cross-chain path is
  **gated**: a bound network with no Universal Resolver resolves on L1 **only** when the runtime
  injected an `ensL1Client` (Pattern 1). Omit it and that resolve returns `UNSUPPORTED_NETWORK` —
  by design, not a bug. Wire it if you want L2-bound ENS resolution.
- **Reading `provenance.external` as a v1/v2 or registry/ccip-read label.** It is the raw observed
  offchain flag (`true` iff a gateway was traversed), nothing more. The adapter deliberately does
  **not** map it to a mechanism name — that interpretation is the consumer's (UIKit SF-6).
- **Treating a `scopedToNetworkId` address as a mainnet address.** When the key is present, the
  address is scoped to that network; binding it to mainnet (or another chain) is a fund-safety bug.
- **Calling `isEnsProvenance` on a reverse result and using it as the scope gate.** L1 miss-fallback
  successes may return `true` — that marks adapter-internal ENS enrichment (`coinType: 60`), not
  "show on every row." Chain-agnostic gates use **`scopedToNetworkId` absent vs present** only
  (Pattern 8). Sepolia-local names are `isEnsProvenance === false` but **scoped** — gating on
  `isEnsProvenance` would wrongly show them globally.
- **Assuming bound reverse timeout/gateway failure will try L1.** It will not (002 SF-1 INV-9). Surface
  `RESOLUTION_TIMEOUT` / `EXTERNAL_GATEWAY_ERROR` — do not treat it like `ADDRESS_NOT_FOUND`.
- **Expecting ENSIP-19 L2 primary on L1 reverse.** Only coinType-60 default primary is returned; L2-only
  primaries → `ADDRESS_NOT_FOUND` (Pattern 8 UX caveat).
- **Calling `isEnsProvenance` on a reverse result and expecting always `false`.** Bound hits: `false`.
  L1 miss-fallback/direct hits: **`true`** — enrichment only; scope still comes from absent
  `scopedToNetworkId`.
- **Expecting a silent fallback to a v1/on-chain result when a v2 gateway fails.** There is none —
  a CCIP-Read failure is `EXTERNAL_GATEWAY_ERROR`, distinct from `NAME_NOT_FOUND`. Don't write code
  that assumes a stale address comes back on gateway error.
- **Re-verifying, or distrusting, a reverse-resolved name.** `resolveAddress` already
  forward-verified it — `forwardVerified` is always `true` on a success. Do not build your own
  "is this name really theirs?" check; render `result.value.name` directly. Equally, do not treat
  `forwardVerified` as if it could be `false` on this adapter and add a dead "unverified name"
  branch — the mismatch case never reaches you (it is `ADDRESS_NOT_FOUND`).
- **Rendering `avatarUrl` without hardening.** It is untrusted, name-owner-controlled content. Do
  not `fetch` it from a privileged context or drop it into the DOM unsandboxed — SSRF and mixed
  content are real. The adapter passes the string through verbatim; safe fetching/rendering is
  yours.
- **Treating a missing `avatarUrl` as an error.** Avatar is best-effort — a valid, verified name
  often has no avatar, and a transient avatar failure also yields no key. Absence of `avatarUrl` is
  normal, never a signal that the name is untrustworthy.
- **Rendering an `ipfs://` or `eip155:` avatar in a CSP-restricted `<img>`.** The adapter returns
  the URI verbatim; gateway `ipfs://` to HTTPS (or proxy) before assigning `src`. Expect silent
  non-display if you only allow `https:` / `data:image/*`.
- **Blocking forever when `scopedToNetworkId` ≠ active network.** The adapter does not accept a
  target network on `resolveName` — re-resolve by calling `resolveName` on a capability bound to the
  user's selected network (Pattern 7). Fail-safe blocking without re-resolution is a UI policy, not
  an adapter limitation.
- **Expecting `NAME_NOT_FOUND` from `resolveAddress`.** The reverse path emits `ADDRESS_NOT_FOUND`
  (and never `NAME_NOT_FOUND` / `UNSUPPORTED_NAME`). Switch on the codes the method can actually
  produce.

---

## See also

- [README](./README.md) — overview, quick start, safety.
- [API Reference](./api-reference.md) — full typed surface and the seven-code error union.
- [`examples/forward-resolve`](./examples/forward-resolve) — a runnable end-to-end forward example.
- [`examples/reverse-resolve`](./examples/reverse-resolve) — a runnable end-to-end reverse example.
- [`examples/ens-v2-resolve`](./examples/ens-v2-resolve) — ENS v2 forward: `isEnsProvenance`, L1 cross-chain.
- [`examples/reverse-miss-fallback`](./examples/reverse-miss-fallback) — mocked Sepolia miss-fallback,
  scope gate, and bound-failure-no-L1 discipline (002 SF-1).
- Pattern 7 (above) — re-resolve when provenance scope and the active network diverge.
- Pattern 8 (above) — reverse miss-fallback ladder + chain-agnostic scope gate.
