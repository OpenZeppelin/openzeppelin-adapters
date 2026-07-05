import { RuntimeDisposedError } from '@openzeppelin/ui-types';

import type { AnyResolutionResult, CheckStatus } from './types';

/**
 * A per-family leaf verdict. `checks/*` return this pure shape; the checker attaches the
 * invariant id and the deduped report `key` (INV-3 key derivation is centralized).
 */
export interface CheckOutcome {
  readonly status: CheckStatus;
  readonly message: string;
}

/**
 * Shared internals for the pure conformance core: the single exception-containment
 * wrapper (INV-9), the single `RuntimeDisposedError` predicate (INV-11), the no-leak
 * error describer (INV-12), and the report-key helpers (INV-3 / INV-24).
 *
 * Runner-free — imports only `@openzeppelin/ui-types`.
 */

/**
 * Outcome of a single contained capability invocation. A non-throwing call yields `result`
 * as `unknown` — the adapter's compile-time signature is DELIBERATELY not trusted at runtime,
 * so every grader must narrow through {@link classifyResolutionResult} before dereferencing.
 */
export type InvokeOutcome =
  | { readonly threw: false; readonly result: unknown }
  | { readonly threw: true; readonly disposed: boolean; readonly description: string };

/**
 * INV-11: the SINGLE canonical `RuntimeDisposedError` predicate, used by INV-8 (route a
 * caught throw to SKIPPED) and INV-26 (require it). `instanceof` with a `name` fallback for
 * cross-realm robustness (a duplicated-bundle class copy). Total — never throws on a
 * non-object `e`.
 */
export function isRuntimeDisposedError(e: unknown): boolean {
  return (
    e instanceof RuntimeDisposedError ||
    (typeof e === 'object' &&
      e !== null &&
      (e as { name?: unknown }).name === 'RuntimeDisposedError')
  );
}

/**
 * `String(value)` that can NEVER throw. A hostile `toString` / `Symbol.toPrimitive` / `valueOf`
 * on an adapter-controlled value would otherwise propagate out of a diagnostic and defeat
 * containment, so a throwing coercion degrades to a marker (SC-004 totality).
 */
export function safeToString(value: unknown): string {
  try {
    return String(value);
  } catch {
    return '<unstringifiable value>';
  }
}

/**
 * A diagnostic stringifier for FAIL messages that NEVER throws. `JSON.stringify` throws on a
 * `bigint` and on a circular structure, and a hostile `toJSON` / getter can throw mid-serialize;
 * every such case degrades to a safe hint so a diagnostic can never turn a grading FAIL into an
 * uncontained throw. A `bigint` is rendered as `<value>n` via a replacer.
 */
export function safeJsonHint(value: unknown): string {
  try {
    const json = JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? `${v}n` : v));
    return json ?? safeToString(value);
  } catch {
    return safeToString(value);
  }
}

/**
 * INV-12: a diagnostic string for a caught error — `<constructorName>: <safeToString(err)>` —
 * with the raw error object deliberately NOT retained, so no live native `Error` (unstable
 * stack, embedded paths) or adapter-internal handle ever escapes into the report. Reading the
 * constructor name and stringifying are both guarded, so `describeError` is itself total.
 */
export function describeError(err: unknown): string {
  let name: string;
  try {
    if (typeof err === 'object' && err !== null) {
      const ctor = (err as { constructor?: { name?: unknown } }).constructor;
      name = typeof ctor?.name === 'string' ? ctor.name : 'Object';
    } else {
      name = typeof err;
    }
  } catch {
    name = 'Object'; // a hostile `constructor` getter must not defeat containment
  }
  return `${name}: ${safeToString(err)}`;
}

/**
 * INV-9 grading containment. The value-grading phase runs AFTER the {@link invoke} call-
 * containment boundary, inspecting the adapter's RETURNED payload; without this wrapper a
 * hostile getter, a `bigint` tripping a naive stringify, or a pathologically deep / circular
 * structure would escape that phase as an uncontained throw and break SC-004 totality. Any
 * throw becomes a FAIL, attributed by the caller to the specific invariant whose grader threw.
 */
export function safeGrade(grade: () => CheckOutcome): CheckOutcome {
  try {
    return grade();
  } catch (err) {
    return {
      status: 'FAIL',
      message: `grading threw while inspecting the returned value — ${describeError(err)}`,
    };
  }
}

/**
 * INV-9: contain a single capability invocation. `await fn()` handles a sync-throw and a
 * promise-rejection identically; neither ever propagates. A non-`RuntimeDisposedError`
 * throw is reported for the caller to classify as a FAIL; a `RuntimeDisposedError` is flagged
 * so the caller can route it to SKIPPED (lifecycle, not the name-resolution contract).
 */
export async function invoke(fn: () => unknown): Promise<InvokeOutcome> {
  try {
    // Held as `unknown`, NOT cast to `AnyResolutionResult`: a malformed return must be graded
    // as FAIL data by the caller (via `classifyResolutionResult`), never trusted from its type.
    const result = await fn();
    return { threw: false, result };
  } catch (err) {
    return { threw: true, disposed: isRuntimeDisposedError(err), description: describeError(err) };
  }
}

/** True iff `v` is a non-null, non-array object — safe to dereference own properties on. */
export function isNonNullObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * The runtime shape of a RETURNED (non-thrown) capability result, discriminated at the
 * containment boundary. `ok` / `err` carry the envelope-validated result (a non-null object
 * with a boolean `ok`); `malformed` carries a human-readable reason for a return that cannot
 * even be discriminated as `{ ok: true | false }`. Inner payload shape (`value`, `error`,
 * `provenance`, `label`, `code`) is guarded by the individual graders, so that a specific
 * defect maps to a specific invariant's FAIL rather than a blanket verdict.
 */
export type ResultShape =
  | { readonly kind: 'ok' | 'err'; readonly result: AnyResolutionResult }
  | { readonly kind: 'malformed'; readonly reason: string };

/**
 * INV-9 shape guard for a returned result. The adapter contract is `{ ok: boolean, … }`; a
 * return that is not a non-null object, or whose `ok` is not a boolean, cannot be graded and
 * is reported as `malformed` for the caller to record as FAIL data — never dereferenced blind.
 */
export function classifyResolutionResult(value: unknown): ResultShape {
  if (!isNonNullObject(value)) {
    const got = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    return { kind: 'malformed', reason: `result is not an object (got ${got})` };
  }
  const ok = (value as { ok?: unknown }).ok;
  if (typeof ok !== 'boolean') {
    return { kind: 'malformed', reason: `result.ok is not a boolean (got ${typeof ok})` };
  }
  return { kind: ok ? 'ok' : 'err', result: value as AnyResolutionResult };
}

/** Outcome of constructing a fresh capability instance (INV-9 containment for `makeCapability`). */
export type ConstructOutcome<T> =
  | { readonly threw: false; readonly instance: T }
  | { readonly threw: true; readonly disposed: boolean; readonly description: string };

/**
 * INV-9: contain `makeCapability()`. Construction is synchronous on the interface, but a
 * fixture bug could still throw OR return a non-capability value (`null`, a primitive, …).
 * Both become classifiable data (a `threw: true` outcome the caller records as FAIL), never a
 * harness crash on a later `instance.resolveName` dereference.
 */
export function safeConstruct<T>(make: () => T): ConstructOutcome<T> {
  let instance: T;
  try {
    instance = make();
  } catch (err) {
    return { threw: true, disposed: isRuntimeDisposedError(err), description: describeError(err) };
  }
  if (!isNonNullObject(instance)) {
    return {
      threw: true,
      disposed: false,
      description: `makeCapability returned a non-capability value (${
        instance === null ? 'null' : typeof instance
      }) rather than throwing`,
    };
  }
  return { threw: false, instance };
}

/**
 * INV-24: default a vector's report slug from its `input` — lowercased, non-`[a-z0-9]`
 * collapsed to `_`, trimmed of leading/trailing `_`. Empty inputs fall back to `unnamed`.
 */
export function sanitizeSlug(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug.length > 0 ? slug : 'unnamed';
}

/**
 * INV-3: enforce report-key uniqueness. Keys are otherwise a pure function of
 * (family, direction, label, code); on a collision a `_2`, `_3`, … suffix is appended so a
 * red key still traces to exactly one (invariant, case) and the vitest projection never has
 * two `it()`s sharing a name.
 */
export function makeKeyDeduper(): (key: string) => string {
  const seen = new Map<string, number>();
  return (key: string): string => {
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    return count === 0 ? key : `${key}_${count + 1}`;
  };
}
