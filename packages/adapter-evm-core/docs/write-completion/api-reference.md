# Write Completion — API Reference

Public vocabulary lives in `@openzeppelin/ui-types`. Detection helpers live in
`@openzeppelin/adapter-evm-core` (`shared/completion` / re-exported from
`capabilities/helpers` for tests). They are **core-internal** in SF-1 — not
promoted to the `@openzeppelin/adapter-evm` top-level barrel.

---

## `@openzeppelin/ui-types` (vocabulary — 3.5.0)

### `type WriteCompletion`

```ts
type WriteCompletion = 'submitted' | 'confirmed';
```

How far a write must progress before the capability call resolves.

- `'confirmed'` — submit → confirm → verify (default when absent).
- `'submitted'` — resolve as soon as submission is known.

### `interface WriteCompletionOptions`

```ts
interface WriteCompletionOptions {
  completion?: WriteCompletion;
  onSubmitted?: (relayerTxId: string) => void | Promise<void>;
}
```

| Field | Type | Notes |
|-------|------|-------|
| `completion` | `WriteCompletion \| undefined` | Absent ≡ confirmed |
| `onSubmitted` | `(relayerTxId: string) => void \| Promise<void>` | Strategy / consumer hook; **adapter never invokes** (CONVENTION) |

### `RelayerExecutionConfig.transactionOptions`

```ts
transactionOptions?: WriteCompletionOptions & Record<string, unknown>;
```

Known keys are compile-checked; residual keys (e.g. gas settings) remain passthrough
so existing callers keep compiling (**MECHANISM** for known keys).

**Import:**

```ts
import type {
  WriteCompletion,
  WriteCompletionOptions,
  RelayerExecutionConfig,
} from '@openzeppelin/ui-types';
```

---

## `@openzeppelin/adapter-evm-core` (mechanics)

### `interface WriteExecutionResult`

```ts
interface WriteExecutionResult extends OperationResult {
  readonly completion: WriteCompletion;
}
```

Executor-facing write result. `completion` is always set. Structural subtype of
`{ id: string }` for confirmed-path `.id` readers.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | Submit-only: preferred `relayerTxId` when present; else `txHash` |
| `completion` | `WriteCompletion` | Never undefined after a successful adapt |

### `interface SignAndBroadcastResultMeta`

```ts
interface SignAndBroadcastResultMeta {
  readonly completion?: WriteCompletion;
  readonly relayerTxId?: string;
}
```

Parsed from `SignAndBroadcast`’s `result`. Only field name `relayerTxId` is
accepted (no `id` / `transactionId` aliases in SF-1).

### `class WriteCompletionDisagreementError`

```ts
class WriteCompletionDisagreementError extends Error {
  readonly code: 'WRITE_COMPLETION_DISAGREEMENT';
  readonly optionsCompletion: WriteCompletion | undefined;
  readonly resultCompletion: WriteCompletion | undefined;
  constructor(
    optionsCompletion: WriteCompletion | undefined,
    resultCompletion: WriteCompletion | undefined,
  );
}
```

Thrown when options and result disagree in **either** direction. Shared across
write capabilities — **not** `IdentityOperationFailed`.
`runCapabilityWrite` rethrows this unchanged so IRS (and other) mappers cannot
wrap it.

### `resolveWriteCompletion(input): WriteCompletion`

```ts
function resolveWriteCompletion(input: {
  readonly optionsCompletion?: WriteCompletion;
  readonly resultCompletion?: WriteCompletion;
}): WriteCompletion;
```

Pure merge of dual signals. See [truth table](./README.md#dual-source-detection).

**Throws:** `WriteCompletionDisagreementError` when both are defined and differ.

### `readOptionsCompletion(executionConfig): WriteCompletion | undefined`

```ts
function readOptionsCompletion(
  executionConfig: ExecutionConfig,
): WriteCompletion | undefined;
```

Reads **only** top-level `executionConfig.transactionOptions.completion` when
`method === 'relayer'` and the value is `'submitted' | 'confirmed'`. Nested
plugin namespaces are never walked. Non-relayer configs → `undefined`. Invalid
strings → `undefined` (absent).

### `parseSignAndBroadcastResult(result): SignAndBroadcastResultMeta`

```ts
function parseSignAndBroadcastResult(
  result: unknown,
): SignAndBroadcastResultMeta;
```

Narrows unknown strategy `result`. Non-objects → `{}`. Invalid `completion`
strings → omitted. Empty-string `relayerTxId` → omitted.

### `preferSubmissionId(params): string`

```ts
function preferSubmissionId(params: {
  completion: WriteCompletion;
  txHash: string;
  relayerTxId?: string;
}): string;
```

Returns `relayerTxId` when `completion === 'submitted'` and `relayerTxId` is a
non-empty string; otherwise returns `txHash`.

### `adaptSignAndBroadcast(signAndBroadcast): CapabilityExecutor`

```ts
type SignAndBroadcast = (
  transactionData: unknown,
  executionConfig: ExecutionConfig,
  onStatusChange: (status: TxStatus, details: TransactionStatusUpdate) => void,
  runtimeApiKey?: string,
) => Promise<{ txHash: string; result?: unknown }>;

function adaptSignAndBroadcast(
  signAndBroadcast: SignAndBroadcast,
): CapabilityExecutor;
```

**Algorithm:**

1. `sab = await signAndBroadcast(...)`
2. `optionsCompletion = readOptionsCompletion(executionConfig)`
3. `meta = parseSignAndBroadcastResult(sab.result)`
4. `completion = resolveWriteCompletion({ optionsCompletion, resultCompletion: meta.completion })` — may THROW
5. `id = preferSubmissionId({ completion, txHash: sab.txHash, relayerTxId: meta.relayerTxId })`
6. `return { id, completion }`

Does **not** call `onSubmitted`.

**Throws:** `WriteCompletionDisagreementError` on signal disagreement.

### `CapabilityExecutor` / `runCapabilityWrite`

```ts
type CapabilityExecutor = (
  txData: WriteContractParameters,
  executionConfig: ExecutionConfig,
  onStatusChange?: (status: TxStatus, details: TransactionStatusUpdate) => void,
  runtimeApiKey?: string,
) => Promise<WriteExecutionResult>;

function runCapabilityWrite(
  params: {
    operation: string;
    action: WriteContractParameters;
    executor: CapabilityExecutor;
    executionConfig: ExecutionConfig;
    onStatusChange?: (status: TxStatus, details: TransactionStatusUpdate) => void;
    runtimeApiKey?: string;
  },
  mapError: WriteErrorMapper,
): Promise<WriteExecutionResult>;
```

On failure, `WriteCompletionDisagreementError` is rethrown **before** `mapError`
runs. Ordinary errors still go through `mapError`.

---

## Import paths (SF-1)

```ts
// Vocabulary (public — published / linked ui-types 3.5.0)
import type { WriteCompletion, WriteCompletionOptions } from '@openzeppelin/ui-types';

// Factories (public barrel)
import { createIRS } from '@openzeppelin/adapter-evm-core';

// Mechanics — CORE-INTERNAL in SF-1 (Design OQ-2): not on the package root barrel.
// Workspace / vitest:
//   import { … } from '../../shared/completion'
//   import { … } from '../../capabilities/helpers'
// Consumer catch: switch on error.code === 'WRITE_COMPLETION_DISAGREEMENT'
```
