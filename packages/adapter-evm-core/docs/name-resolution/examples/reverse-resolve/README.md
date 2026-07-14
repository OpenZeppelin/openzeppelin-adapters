# Example: reverse-resolve an address to a verified ENS name

Reverse-resolves an address to the ENS name it **verifiably** owns (plus an optional avatar)
through `createNameResolution`, against a real viem mainnet client. Shows the display-path consumer
loop — feature-detect, async `resolveAddress`, and the switch over the closed error union.

## Prerequisites

- The adapters workspace installed (`pnpm install` at the repo root). `@openzeppelin/adapter-evm-core`,
  `viem`, and `@openzeppelin/ui-types` are already present as workspace/peer dependencies.
- A mainnet RPC URL (optional but recommended — the viem default public transport is rate-limited).

## Run

```bash
# from this directory
ENS_RPC_URL=https://your-mainnet-rpc pnpm tsx resolve-address.ts 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
```

Expected output for an address with a forward-consistent reverse record:

```
0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 → vitalik.eth
  forwardVerified: true
  avatarUrl: (none — best-effort, absent is normal)
  provenance: label=ENS external=false
  scopedToNetworkId: (absent — global on mainnet-bound)
```

On a **non-mainnet-bound** runtime (e.g. Sepolia with standard `ensL1Client` wiring), an address with
no bound reverse but a mainnet primary may resolve via **miss-fallback** — `scopedToNetworkId` stays
absent (global), and `isEnsProvenance` may be `true` on the L1 path. See
[`reverse-miss-fallback`](../reverse-miss-fallback/) and Integration Guide Pattern 8.

Try an address with no reverse record (e.g. `pnpm tsx resolve-address.ts 0x0000000000000000000000000000000000000001`)
to see the `ADDRESS_NOT_FOUND` branch, or a malformed address (`0xnope`) to see it rejected by the
synchronous shape gate before any network call.

## The one thing to internalize

**A returned name is always forward-verified — render it directly.** `resolveAddress` never surfaces
a mismatched (spoofed) name: it forward-verifies inside viem's Universal Resolver and folds any
mismatch to `ADDRESS_NOT_FOUND`. So `forwardVerified` is always `true` on success, and every failure
code means the same thing for display purposes — fall back to truncated hex. `avatarUrl` is
best-effort and **untrusted** name-owner content: absence is normal, and you must fetch/render it
defensively (SSRF-safe egress, no mixed content, sandboxed). Avatar URIs may be `ipfs://`, `data:`,
`https://`, or NFT (`eip155:`) forms — the adapter passes them through verbatim; gateway `ipfs://` to
HTTPS before using in a CSP-restricted `<img>` slot.

## What to copy into your own code

The loop in `resolve-address.ts` (feature-detect → `resolveAddress` → `switch (error.code)`) is the
canonical display-path pattern. In a real app the `networkConfig` and `publicClient` come from your
wired adapter runtime (`runtime.nameResolution`) rather than being hand-built — see the
[Integration Guide](../../integration-guide.md), Pattern 3.
