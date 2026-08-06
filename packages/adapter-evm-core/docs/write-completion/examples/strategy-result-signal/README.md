# Example: Strategy `result` completion signal

Shows the **exactly-one-signal** path used by submit-early strategies that still
nest plugin options privately. The adapter reads `result.completion` +
`relayerTxId` — not nested plugin keys (CONVENTION).

```bash
pnpm exec tsc --noEmit early-return-result.ts
```
