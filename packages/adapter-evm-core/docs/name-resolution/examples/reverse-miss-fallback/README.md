# Example: reverse miss-fallback + scope gate (002 SF-1)

Mocked **Sepolia-bound** reverse resolution: bound `getEnsName` returns empty, gated mainnet L1
returns `vitalik.eth`. No live RPC required.

## Run

```bash
# from this directory
pnpm tsx resolve-miss-fallback.ts
```

Expected highlights:

- One L1 `getEnsName` call after bound empty (miss-fallback).
- `scopedToNetworkId` **absent** → global / mainnet identity (chain-agnostic gate shows on any row).
- `isEnsProvenance === true` with `coinType: 60` → adapter-internal enrichment, **not** the gate.

## What to copy

1. **Scope gate** — `visibleOnRow(provenance.scopedToNetworkId, rowNetworkId)` using base field only.
2. **Do not** branch display safety on `isEnsProvenance` / `coinType` (Principle II / INV-28).
3. **Bound failure ≠ L1** — if bound `getEnsName` throws a transport error, the adapter returns a
   typed error and L1 is never called (not demonstrated here; see Integration Guide Pattern 8).

## See also

- [Integration Guide — Pattern 8](../../integration-guide.md#pattern-8-reverse-miss-fallback-ladder--chain-agnostic-scope-gate-002-sf-1)
- [reverse-resolve](../reverse-resolve/) — live mainnet-bound reverse example
