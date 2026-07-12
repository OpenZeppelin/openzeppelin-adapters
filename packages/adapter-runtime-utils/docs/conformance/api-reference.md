# API Reference — `@openzeppelin/adapter-runtime-utils/conformance`

Every public member of the `./conformance` subpath, with its full TypeScript signature. Import
everything from the subpath entry:

```ts
import {
  checkConformance,
  describeConformance,
  isUserSafeLabel,
  DEFAULT_LABEL_POLICY,
  normalizeResolutionResult,
  structuralEqual,
  NAME_RESOLUTION_ERROR_CODES,
  ConformanceConfigError,
  type ConformanceConfig,
  type ConformanceReport,
  type InvariantResult,
  type InvariantId,
  type CheckStatus,
  type ForwardVector,
  type ReverseVector,
  type VectorExpectation,
  type LabelPolicy,
  type LabelDenyRule,
  type NameResolutionErrorCode,
} from '@openzeppelin/adapter-runtime-utils/conformance';
```

---

## Functions

### `checkConformance(config: ConformanceConfig): Promise<ConformanceReport>`

The pure, runner-agnostic core. Runs the four required UIKit families (plus the optional lifecycle
family when opted in) against `config.makeCapability()` over the supplied vectors and resolves to a
structured report. **Async** — always `await` it.

**Behavior:**
- **Feature-detects structurally.** Absent `resolveName` → the forward family is `SKIPPED`. Absent
  `resolveAddress` → the reverse family **and** INV-6 are `SKIPPED`. Skips are reported as results,
  never dropped.
- **Never throws for adapter misbehavior.** A thrown/rejected expected-failure vector becomes an
  INV-8 `FAIL`; a missing `forwardVerified` becomes an INV-6 `FAIL`; a non-deterministic result
  becomes an INV-12 `FAIL`; an unsafe label becomes an INV-16 `FAIL`. The report resolves in all
  these cases.
- **Deterministic & side-effect-free.** No clock, no RNG, no environment reads, no logging. Two runs
  over the same config and observably-identical capability return structurally-equal reports.
- **Fresh instance per case.** `makeCapability()` is called once per case; instances are never reused
  across cases and are never disposed by the required families.

**Throws:** `ConformanceConfigError` **only** — for programmer error in `config` itself (see below).
Validation runs *before* any capability call, so a config error can never be mistaken for an adapter
FAIL. It throws nothing else.

```ts
const report = await checkConformance({
  makeCapability: () => makeMyCapability(),
  forwardVectors: [{ input: 'name.eth', expect: { ok: true } }],
});
report.passed; // boolean
```

---

### `describeConformance(config: ConformanceConfig): Promise<void>`

Thin vitest binding. Runs `checkConformance(config)` **once** at collection time, captures the
report, then projects each `InvariantResult` onto exactly one test, **in report order**:

| Result status | Emits |
|---------------|-------|
| `PASS` | `it(key, () => {})` — a green test documenting the satisfied invariant/case |
| `FAIL` | `it(key, () => expect.fail(message))` — a red test naming the violation |
| `SKIPPED` | `it.skip(key)` — a visibly skipped test |

**Must be `await`ed at the top level of the test file** — the capability calls run over the pinned
substrate before the `it()`s are emitted. vitest supports top-level await.

It never classifies adapter behavior itself (that is `checkConformance`'s job) and never merges,
drops, or reorders results. The only exception it propagates is `ConformanceConfigError` — a caller
programmer-error that should fail collection loudly.

```ts
await describeConformance({
  suiteName: 'my-adapter NameResolutionCapability',
  makeCapability: () => makeMyCapability(),
  forwardVectors,
  reverseVectors,
});
```

> **Known limitation.** The binding reads `it`/`it.skip` from the immutable `vitest` ES-module
> namespace, so its exact emission (call count/order, and the FAIL→`expect.fail` branch) cannot be
> intercepted by an in-process spy. The projection is proven end-to-end for the PASS/SKIP paths and
> the config-error path; a fine-grained spy would require an additive runner-injection seam. See the
> [integration guide](./integration-guide.md#known-limitations) and the docs artifact's Open
> Questions.

---

### `isUserSafeLabel(label: string, policy?: LabelPolicy): { readonly safe: boolean; readonly reason?: string }`

The INV-16 primitive, exported for reuse and for the seeded-defect meta-suite. Returns a **structured
verdict** (not a bare boolean) so a FAIL message can name the gate that tripped. Checks, in order:
length cap → anchored allowlist → each denylist rule. The first failing gate sets `reason`.

`policy` defaults to `DEFAULT_LABEL_POLICY`.

```ts
isUserSafeLabel('ENS');                                  // { safe: true }
isUserSafeLabel('ENS via CCIP-Read');                    // { safe: true }
isUserSafeLabel('https://evil.example/x');               // { safe: false, reason: 'allow-mismatch' }
isUserSafeLabel('0xabcdef1234');                          // { safe: false, reason: 'allow-mismatch' }
isUserSafeLabel('');                                     // { safe: false, reason: 'allow-mismatch' } (empty fails the allowlist)
```

> `reason` values are: `over-length (>N)`, `allow-mismatch`, or a denylist rule `name`
> (`contains-url-scheme`, `contains-hex-run`, `contains-at-sign`, `contains-control-char`,
> `empty-or-whitespace`). Because the allowlist is primary, most adversarial labels trip
> `allow-mismatch` before any denylist rule runs — the denylist is belt-and-braces.

---

### `normalizeResolutionResult(result: AnyResolutionResult, opts: { readonly includeAvatar: boolean }): unknown`

The INV-12 engine's pre-pass, exported for reuse and unit-testing. Canonicalizes a `ResolutionResult`
so two runs of a *compliant* adapter compare equal regardless of memoize-vs-re-query. **Pure** —
returns a new structure; the input is never mutated.

1. Recursively drops every own-enumerable key whose value is `undefined`, at every depth — so
   `{ avatarUrl: undefined }` and `{}` (key absent) normalize identically.
2. On `{ ok: true }`: drops `value.avatarUrl` unless `includeAvatar` is `true` (the avatar surface may
   flap without violating determinism).
3. On `{ ok: false }`: drops `error.cause` — `unknown`-typed diagnostic data that may hold a live
   native `Error`; it is never inspected, compared, or surfaced. `code` and every typed payload field
   remain.

`includeAvatar` follows `config.stableAvatarSurface`.

`AnyResolutionResult` = `ResolutionResult<ResolvedAddress | ResolvedName>` (both directions handled
uniformly).

---

### `structuralEqual(a: unknown, b: unknown): boolean`

Hand-rolled, zero-third-party-dep structural equality over plain JSON-ish data (the shape
`normalizeResolutionResult` produces). Reflexive, symmetric, and terminating.

- Primitives (strings, numbers incl. `NaN`, booleans, `null`) via `Object.is` semantics.
- Arrays: equal length **and** elementwise-recursive.
- Plain objects: identical own-enumerable key **sets** (order-insensitive) **and** per-key recursive.
- Type mismatch (array-vs-object, differing `typeof`) → `false`.
- Any non-plain object (`Date`/`Map`/`Set`/`RegExp`/typed array — none occur in the normalized
  ui-types core) → identity fallback, a conservative FAIL rather than a silent false pass.

```ts
structuralEqual({ a: 1, b: 2 }, { b: 2, a: 1 }); // true  (order-insensitive)
structuralEqual({ a: 1 }, { a: 1, c: 2 });       // false (extra key)
structuralEqual(NaN, NaN);                        // true  (Object.is semantics)
```

---

## Constants

### `DEFAULT_LABEL_POLICY: LabelPolicy`

The default, widened, defense-in-depth label policy this package owns. **Deep-frozen** — the policy,
its `deny` array, and each rule are immutable (a mutation attempt throws in strict mode).

| Field | Value |
|-------|-------|
| `allow` | `/^[A-Za-z][A-Za-z0-9 ]*(?:[-'][A-Za-z0-9 ]+)*$/` — must start with a letter (rejects `0x…` and bare digits); allows internal single hyphen/apostrophe as prose connectors (accommodates `'ENS via CCIP-Read'`); no `:` `/` `@`. |
| `maxLength` | `64` (inclusive; checked separately from the regex to avoid catastrophic backtracking) |
| `deny` | `contains-url-scheme` (`://`), `contains-hex-run` (`/0x[0-9a-fA-F]{4,}/`), `contains-at-sign` (`@`), `contains-control-char` (`/[\x00-\x1F\x7F]/`), `empty-or-whitespace` (empty after trim) |

**Locked corpus** (frozen in the test suite): PASS = `'ENS'`, `'ENS via external gateway'`, `'SNS'`,
`'ENS via CCIP-Read'`; FAIL = a URL, a hex run, an `@`-bearing internal id, and the empty string.

Override it per-run via `config.labelPolicy`. An override is used **verbatim** — never merged with
the default.

### `NAME_RESOLUTION_ERROR_CODES: ReadonlySet<string>`

The closed error-code set INV-8 tests membership against. Compile-time pinned to
`NameResolutionError['code']` from `@openzeppelin/ui-types` (a `satisfies` clause plus a two-way
`extends` assertion), so the set can never silently drift from the type. The 7 codes:

```
NAME_NOT_FOUND · ADDRESS_NOT_FOUND · UNSUPPORTED_NETWORK · UNSUPPORTED_NAME
RESOLUTION_TIMEOUT · EXTERNAL_GATEWAY_ERROR · ADAPTER_ERROR
```

---

## Types

### `ConformanceConfig`

```ts
interface ConformanceConfig {
  /** Fresh capability per case (RS-TCK createPublisher). MUST wrap a pinned / mocked substrate. */
  readonly makeCapability: () => NameResolutionCapability;
  /** Forward cases. Omit if the adapter has no `resolveName`; provided-but-unsupported → SKIPPED. */
  readonly forwardVectors?: readonly ForwardVector[];
  /** Reverse cases. Omit if the adapter has no `resolveAddress`; provided-but-unsupported → SKIPPED. */
  readonly reverseVectors?: readonly ReverseVector[];
  /** When true, INV-12 also compares `avatarUrl`. Default false. */
  readonly stableAvatarSurface?: boolean;
  /** Override the INV-16 policy. Default = DEFAULT_LABEL_POLICY (used verbatim, not merged). */
  readonly labelPolicy?: LabelPolicy;
  /** Human-readable suite name for report / test grouping. Default 'NameResolutionCapability'. */
  readonly suiteName?: string;
  /** Opt in to the OPTIONAL lifecycle sanctioned-throw family (INV-26). Default false. */
  readonly lifecycleProbe?: boolean;
}
```

### `ForwardVector` / `ReverseVector`

```ts
interface ForwardVector {
  readonly input: string;               // a name to forward-resolve
  readonly expect: VectorExpectation;
  readonly label?: string;              // optional slug for keys/test names; defaults to a sanitized `input`
}

interface ReverseVector {
  readonly input: string;               // an address to reverse-resolve
  readonly expect: VectorExpectation;
  readonly label?: string;
}
```

### `VectorExpectation`

```ts
type VectorExpectation =
  | { readonly ok: true }                                       // success case — drives INV-6/12/16
  | { readonly ok: false; readonly code: NameResolutionErrorCode }; // expected-failure case — drives INV-8
```

### `ConformanceReport` / `InvariantResult`

```ts
interface ConformanceReport {
  readonly results: readonly InvariantResult[];
  readonly passed: boolean;             // true iff NO result is FAIL. SKIPPED never fails a report.
}

interface InvariantResult {
  readonly invariant: InvariantId;
  readonly key: string;                 // invariant-numbered, report-unique, deterministic
  readonly status: CheckStatus;         // 'PASS' | 'FAIL' | 'SKIPPED'
  readonly message: string;             // FAIL: expected-vs-observed · SKIPPED: why · PASS: confirmation
}
```

### `InvariantId` / `CheckStatus`

```ts
type InvariantId = 'INV-6' | 'INV-8' | 'INV-12' | 'INV-16' | 'EXPECT' | 'INV-26';
type CheckStatus = 'PASS' | 'FAIL' | 'SKIPPED';
```

The four required UIKit families are `INV-6`/`INV-8`/`INV-12`/`INV-16`. `EXPECT` is the harness's own
vector-expectation-fidelity check (a declared-`ok:true` vector that returned `{ ok: false }`).
`INV-26` is the OPTIONAL lifecycle family (present only when `lifecycleProbe: true`).

**Report key shapes** (a red key traces to exactly one invariant × case):

| Invariant | Key shape |
|-----------|-----------|
| `INV-6` | `inv6_<vectorLabel>_forwardVerifiedConcreteBoolean` |
| `INV-8` | `inv8_<direction>_<expectedCode>_neverThrows` |
| `INV-12` | `inv12_<direction>_<vectorLabel>_deterministic` |
| `INV-16` | `inv16_<direction>_<vectorLabel>_labelUserSafe` |
| `EXPECT` | `inv_expect_<direction>_<vectorLabel>_expectedSuccessGotFailure` |
| `INV-26` | `inv26_lifecycle_disposedThrows` |

`<direction>` is `forward` or `reverse`. Keys are deduped: two vectors that sanitize to the same slug
get a `_2` suffix so uniqueness is preserved.

### `LabelPolicy` / `LabelDenyRule`

```ts
interface LabelPolicy {
  readonly allow: RegExp;               // anchored allowlist the label MUST fully match
  readonly maxLength: number;           // inclusive max length in characters
  readonly deny: readonly LabelDenyRule[]; // reject if ANY rule trips
}

interface LabelDenyRule {
  readonly name: string;                // stable id surfaced in the FAIL message
  readonly test: (label: string) => boolean; // true → reject
}
```

### `NameResolutionErrorCode`

```ts
type NameResolutionErrorCode = NameResolutionError['code']; // the closed 7-code union, from ui-types
```

### `ConformanceConfigError`

```ts
class ConformanceConfigError extends Error {
  readonly code: 'CONFORMANCE_CONFIG';
}
```

The **sole** exception `checkConformance` may throw — reserved for caller programmer-error in `config`
itself: `makeCapability` not a function; a vector `input`/`label` not a string; `labelPolicy.allow`
not a `RegExp`; `labelPolicy.maxLength` not a finite number; `deny` not an array of `{ name, test }`;
`suiteName` not a string. It is thrown *before* any capability call, so it can never be confused with
an adapter FAIL.
