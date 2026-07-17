# Integration Guide — ENS Name Resolution (forward SF-2 · reverse SF-3 · ENS v2 SF-5 · L1 miss-fallback 003)

How to wire and use the EVM name-resolution capability. A few patterns cover almost every
consumer: **register** the capability into an EVM runtime, **call** forward resolution (name →
address) from a consumer, **call** reverse resolution (address → name, for display), **read ENS v2
provenance** (SF-5), **wire the optional L1 cross-chain client**, **opt in to mainnet-L1
miss-fallback** (003 SF-1), **apply the reverse miss-fallback ladder and chain-agnostic scope gate**
(003 SF-3), **read cross-network fallback provenance** (003 SF-2), **forward UR bound miss-fallback**
(003 SF-4), and **test** against a mocked client.

> Scope: forward (SF-2), reverse + avatar (SF-3), ENS v2 (SF-5), and 003 mainnet-L1 opt-in
> miss-fallback (SF-1 gate, SF-2 triplet, SF-3 reverse + SF-4 forward ladders). Registration
> (Pattern 1) is shared — one capability instance, one bound client, optional L1 client, and an
> explicit opt-in flag serve `resolveName` and `resolveAddress` alike.

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
    ensL1Client:  ensL1Client(typed),   // SF-5 + 003 — enables L1 paths when eligible
    // enableMainnetL1MissFallback: omitted → default OFF (003 SF-1 fund-safety).
    // UIKit / dapp integrators opt in explicitly when accepting cross-network namespace risk:
    // enableMainnetL1MissFallback: true,
  });
},
```

Notes:

- For ENS-supporting networks (mainnet and most L1/L2s viem ships), `config.viemChain` carries
  `contracts.ensUniversalResolver`, so the **bound** client resolves mainnet-bound (`coinType` 60).
- For a network whose bound chain has **no** Universal Resolver (an L2), the wired `ensL1Client`
  lets `resolveName` resolve the name **chain-scoped on L1** (`coinType = toCoinType(boundChainId)`)
  — the canonical `001` 1b path (**no** fallback triplet). With **`enableMainnetL1MissFallback: true`**,
  it also enables UR-bound miss-fallback on both directions. Omit `ensL1Client` and that same L2-bound
  forward resolve returns `UNSUPPORTED_NETWORK`; reverse on non-UR chains likewise returns
  `UNSUPPORTED_NETWORK` before I/O.
- **`enableMainnetL1MissFallback` defaults OFF.** Shared runtime profiles (`adapter-evm/profiles/shared.ts`)
  wire `ensL1Client` but do **not** pass `enableMainnetL1MissFallback: true` — safe posture preserved.
  Opt-in is a separate, explicit integrator decision (UIKit sibling wires the UI affordance).
- Wiring `ensL1Client` is a one-time cost per capability instance (a borrowed client). Forward 1b: L1
  hop when bound chain has no UR. Miss-fallback: L1 only after definitive bound empty / `NAME_NOT_FOUND`
  on UR-carrying non-mainnet chains when opted in — never on bound gateway/transport failure, never
  redundantly on mainnet-bound.
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
    // Chain-agnostic scope gate (003 SF-3) — see Pattern 8; triplet disclaimer Pattern 9.
    return { kind: 'name', name: result.value.name, avatarUrl: result.value.avatarUrl };
  }

  // Switch on the CODE. ADDRESS_NOT_FOUND = no verified name for display.
  // RESOLUTION_TIMEOUT / EXTERNAL_GATEWAY_ERROR = infrastructure failure — NOT an empty record;
  // on UR-carrying chains the adapter did NOT fall through to L1 (003 SF-3 INV-9).
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

## Pattern 8: Reverse miss-fallback ladder + scope gate (003 SF-3)

Requires `ensL1Client` (Pattern 1) **and** `enableMainnetL1MissFallback: true` (003 SF-1). With opt-in
**OFF** (default), bound-empty on UR chains returns `ADDRESS_NOT_FOUND` without L1 — pre-002 safe
semantics (`SC-001`).

| Bound network | Opt-in | What happens |
|---------------|--------|--------------|
| Mainnet (UR) | any | Bound only — no L1 |
| UR non-mainnet (e.g. Sepolia) | **ON** | Bound first → **definitive empty** → one L1 consult + **triplet**; bound **failure** → typed error, **no L1** |
| UR non-mainnet | **OFF** | Bound only; empty → `ADDRESS_NOT_FOUND` |
| No UR (e.g. Base) | **ON** | L1 direct — **no** fallback triplet (`001` 1b parity; not `precededByBoundMiss`) |

**Never-silent-fallback:** only definitive empty (`null`, Approach A mismatch, resolver-semantic reverts)
is L1-eligible. Bound gateway/timeout → `RESOLUTION_TIMEOUT` / `EXTERNAL_GATEWAY_ERROR` — never L1.

Show/hide: base `scopedToNetworkId` only. Cross-network disclaimer: Pattern 9 triplet only.

```ts
import type { ResolutionProvenance } from '@openzeppelin/ui-types';

function reverseNameVisibleOnRow(provenance: ResolutionProvenance, rowNetworkId: string): boolean {
  const scope = provenance.scopedToNetworkId;
  if (scope === undefined) return true;
  return scope === rowNetworkId;
}
```

### Mocked snippet (Sepolia bound-empty → L1)

```ts
const service = createEvmNameResolutionService(
  { id: 'ethereum-sepolia', chainId: 11155111 } as never,
  boundClient,
  l1Client,
  { enableMainnetL1MissFallback: true },
);
// Success: scopedToNetworkId absent; triplet present — see Pattern 9
```

See [`examples/reverse-miss-fallback/`](./examples/reverse-miss-fallback/).

---

## Pattern 9: Cross-network fallback provenance (003 SF-2)

The triplet lives on base `ResolutionProvenance` in `@openzeppelin/ui-types@3.3.0` — coordinated
cross-repo contract, not adapter-invented fields:

- `resolvedViaNetworkFallback: true`
- `queriedOnNetworkId` — bound `networkConfig.id` that missed first (e.g. `ethereum-sepolia`)
- `resolvedOnNetworkId` — always `ethereum-mainnet` for 003 L1 fallback

**Emission rule (finalized):** the adapter spreads the triplet **only** when **all** hold:

1. `enableMainnetL1MissFallback === true`,
2. L1 success followed a **real bound-empty miss** on a UR-carrying chain (`precededByBoundMiss`),
3. Adapter is not mainnet-bound.

**Triplet absent:** bound-local hits; mainnet-bound hits; **non-UR direct L1** reverse/forward
(`001` SF-5 branch 1b); bound gateway/timeout failures. On L1 miss-fallback successes,
`scopedToNetworkId` stays **absent** (D-R7) — triplet carries cross-network context; scope gate and
disclaimer are orthogonal.

```ts
import type { ResolutionProvenance } from '@openzeppelin/ui-types';

function isCrossNetworkFallback(
  provenance: Pick<ResolutionProvenance, 'resolvedViaNetworkFallback'>,
): boolean {
  return provenance.resolvedViaNetworkFallback === true;
}

// After resolveAddress / resolveName success on UR bound-empty → L1:
if (isCrossNetworkFallback(provenance)) {
  // disclaimer only — do NOT use triplet for show/hide (INV-25)
  const queried = provenance.queriedOnNetworkId;   // bound network that missed
  const resolved = provenance.resolvedOnNetworkId; // ethereum-mainnet
}
```

UIKit: prefer `@openzeppelin/ui-utils` `isCrossNetworkFallback` / `getFallbackNetworks`. **Never**
infer fallback from absent `scopedToNetworkId`, `label`, or `external`.

---

## Pattern 10: Forward miss-fallback on UR bound chains (003 SF-4)

On UR-carrying **non-mainnet** bound chains, `resolveName` is bound-UR-authoritative when opt-in is
**OFF** (default): bound `NAME_NOT_FOUND` is terminal — no L1 call (`001` SF-5 fund-safety). With
`enableMainnetL1MissFallback: true` + wired `ensL1Client`:

1. Bound `resolveVia` runs first (`coinType` 60 on bound client).
2. Only **definitive** `NAME_NOT_FOUND` (empty record / resolver-semantic no-record, not gateway or
   `UNSUPPORTED_NAME`) triggers **one** L1 `resolveVia(ensL1Client, ETH_COIN_TYPE)`.
3. L1 success spreads SF-2 triplet (`precededByBoundMiss` equivalent on forward).
4. L1 empty or failure is terminal — no bound retry.

**Excluded from SF-4 (no forward miss-fallback, no triplet):** non-UR `001` 1b chain-scoped L1;
mainnet-bound; bound hit; bound gateway/timeout/`UNSUPPORTED_NAME`.

```ts
const cap = createNameResolution(sepoliaConfig, {
  publicClient: boundClient,
  ensL1Client: l1Client,
  enableMainnetL1MissFallback: true,
});

const result = await cap.resolveName('vitalik.eth');
if (result.ok && result.value.provenance.resolvedViaNetworkFallback === true) {
  // mainnet address after Sepolia bound miss — triplet carries queried/resolved network ids
}
```

Forward and reverse share the same opt-in flag and the same triplet emission rule (Pattern 9).

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
- **Expecting miss-fallback without opt-in.** Wiring `ensL1Client` does not enable L1 consult after
  bound-empty — pass `enableMainnetL1MissFallback: true` explicitly (Pattern 1 / 003 SF-1).
- **Expecting the fallback triplet on non-UR direct L1.** Canonical `001` 1b paths omit the triplet;
  only UR bound-empty → L1 emits it (Pattern 9).
- **Using the fallback triplet for show/hide.** `scopedToNetworkId` gates display; triplet drives
  disclaimer copy only (`resolvedViaNetworkFallback === true`).
- **Inferring fallback from absent `scopedToNetworkId`.** Mainnet-bound and L1-direct hits also lack
  scope — classify fallback only via `resolvedViaNetworkFallback`.
- **Assuming bound reverse timeout/gateway failure will try L1.** It will not (002 SF-1 INV-9). Surface
  `RESOLUTION_TIMEOUT` / `EXTERNAL_GATEWAY_ERROR` — do not treat it like `ADDRESS_NOT_FOUND`.
- **Expecting ENSIP-19 L2 primary on L1 reverse.** Only coinType-60 default primary is returned; L2-only
  primaries → `ADDRESS_NOT_FOUND` (Pattern 8 UX caveat).
- **Calling `isEnsProvenance` on a reverse result and expecting always `false`.** Bound hits: `false`.
  L1 miss-fallback/direct hits: **`true`** — enrichment only; scope still comes from absent
  `scopedToNetworkId`.
- **Expecting forward bound miss-fallback without opt-in.** On UR chains, bound `NAME_NOT_FOUND` is
  terminal when `enableMainnetL1MissFallback` is absent/false (003 SF-4 / `001` SF-5 default).
- **Expecting L1 forward consult after bound gateway error.** Only `NAME_NOT_FOUND` is eligible —
  `EXTERNAL_GATEWAY_ERROR` / `RESOLUTION_TIMEOUT` are terminal (never-silent-fallback).
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
- Pattern 8 (above) — reverse miss-fallback ladder + scope gate (opt-in gated).
- Pattern 9 (above) — cross-network fallback provenance triplet + emission rule.
- Pattern 10 (above) — forward UR bound miss-fallback (opt-in gated).
