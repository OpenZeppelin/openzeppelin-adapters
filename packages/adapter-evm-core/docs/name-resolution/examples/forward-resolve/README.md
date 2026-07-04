# Example: forward-resolve an ENS name

Resolves an ENS name to an address through `createNameResolution`, against a real viem mainnet
client. Shows the full consumer loop — feature-detect, sync `isValidName` pre-check, async
`resolveName`, and the switch over the closed error union.

## Prerequisites

- The adapters workspace installed (`pnpm install` at the repo root). `@openzeppelin/adapter-evm-core`,
  `viem`, and `@openzeppelin/ui-types` are already present as workspace/peer dependencies.
- A mainnet RPC URL (optional but recommended — the viem default public transport is rate-limited).

## Run

```bash
# from this directory
ENS_RPC_URL=https://your-mainnet-rpc pnpm tsx resolve.ts vitalik.eth
```

Expected output for a registered name:

```
vitalik.eth → 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
  provenance: label=ENS external=false
```

Try an unregistered name (`pnpm tsx resolve.ts definitely-not-registered-xyz.eth`) to see the
`NAME_NOT_FOUND` branch, or a raw address to see the `isValidName` pre-check reject it before any
network call.

## What to copy into your own code

The three-step loop in `resolve.ts` (`isValidName` → `resolveName` → `switch (error.code)`) is the
canonical consumer pattern. In a real app the `networkConfig` and `publicClient` come from your
wired adapter runtime (`runtime.nameResolution`) rather than being hand-built — see the
[Integration Guide](../../integration-guide.md), Pattern 1.
