# Example: reverse miss-fallback + fallback triplet (003 SF-3 / SF-2)

Mocked **Sepolia-bound** reverse: bound empty → L1 primary with **`enableMainnetL1MissFallback: true`**.

## Run

```bash
pnpm tsx resolve-miss-fallback.ts
```

Expected: complete fallback triplet (`resolvedViaNetworkFallback`, `queriedOnNetworkId`,
`resolvedOnNetworkId`), absent `scopedToNetworkId`, one L1 call.

## See also

- [Integration Guide — Pattern 9](../../integration-guide.md#pattern-9-cross-network-fallback-provenance-003-sf-2)
