# Write Completion — Examples

Self-contained TypeScript snippets for SF-1 completion-signal propagation.

| Example | Pattern |
|---------|---------|
| [relayer-submit-only/](./relayer-submit-only/) | Top-level `WriteCompletionOptions` on Relayer config |
| [strategy-result-signal/](./strategy-result-signal/) | Strategy early-return with `result.completion` + `relayerTxId` |

**Requirements:** TypeScript 5.x, `@openzeppelin/ui-types@3.5.0` (linked / local until
published). These examples are type-shape demos — they do not send Relayer traffic.

```bash
# from openzeppelin-ui (vocabulary branch) + adapters workspace linked via dev:local
pnpm exec tsc --noEmit path/to/example.ts
```
