# Example: resolve an ENS v2 name and read its provenance

Resolves an ENS name through `createNameResolution` against a real viem mainnet client, then
narrows the result's `provenance` with `isEnsProvenance` to read the **observed** ENS v2 facts —
`external` (was a CCIP-Read gateway actually traversed?), `coinType`, and `scopedToNetworkId`.

ENS v2 is **not** a separate method. v2 names resolve through the same `resolveName` call as v1
(viem's Universal Resolver has CCIP-Read built in); SF-5 only adds truthful provenance on top.

## Prerequisites

- The adapters workspace installed (`pnpm install` at the repo root). `@openzeppelin/adapter-evm-core`,
  `viem`, and `@openzeppelin/ui-types` are already present as workspace/peer dependencies.
- A mainnet RPC URL (optional but recommended — the viem default public transport is rate-limited).

## Run

```bash
# from this directory
ENS_RPC_URL=https://your-mainnet-rpc pnpm tsx resolve.ts vitalik.eth
```

Expected output for a plain on-chain name:

```
vitalik.eth → 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
  system:           ens
  external:         false
  coinType:         60
  scopedToNetworkId: (unscoped mainnet)
  label:            ENS
```

Try a name served by an **off-chain (CCIP-Read) gateway** — a wildcard / offchain name — to see
`external=true` and `label=ENS via external gateway`. The `external` value is *observed* on that
specific call (the adapter wraps viem's `ccipRead.request` hook), never inferred from the name.

## L1 cross-chain (L2-bound runtimes)

The bottom of [`resolve.ts`](./resolve.ts) shows how to wire the optional **`ensL1Client`** so an
L2-bound runtime (e.g. Base) resolves ENS names chain-scoped on L1. The success provenance then
carries `coinType` (the bound chain's ENSIP-11 coinType) and `scopedToNetworkId` (bind the address
to that chain). Without `ensL1Client`, an L2-bound resolve returns `UNSUPPORTED_NETWORK` — the L1
path is additive and gated.

## What to copy into your own code

The narrowing block (`isEnsProvenance(provenance)` → read `external` / `coinType` /
`scopedToNetworkId`) is the canonical v2 consumer pattern — see the
[Integration Guide](../../integration-guide.md), Pattern 5 (provenance) and Pattern 6 (L1
cross-chain). In a real app the `networkConfig` and clients come from your wired adapter runtime
(`runtime.nameResolution`) rather than being hand-built.

**Never** narrow by matching `provenance.label` — it is a display string with two values
(`'ENS'` / `'ENS via external gateway'`). `isEnsProvenance` (the `system: 'ens'` discriminant) is
the contract.
