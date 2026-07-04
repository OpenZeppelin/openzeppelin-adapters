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

/** Outcome of a single contained capability invocation. */
export type InvokeOutcome =
  | { readonly threw: false; readonly result: AnyResolutionResult }
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
 * INV-12: a diagnostic string for a caught error — `<constructorName>: <String(err)>` — with
 * the raw error object deliberately NOT retained, so no live native `Error` (unstable stack,
 * embedded paths) or adapter-internal handle ever escapes into the report.
 */
export function describeError(err: unknown): string {
  let name: string;
  if (typeof err === 'object' && err !== null) {
    const ctor = (err as { constructor?: { name?: unknown } }).constructor;
    name = typeof ctor?.name === 'string' ? ctor.name : 'Object';
  } else {
    name = typeof err;
  }
  return `${name}: ${String(err)}`;
}

/**
 * INV-9: contain a single capability invocation. `await fn()` handles a sync-throw and a
 * promise-rejection identically; neither ever propagates. A non-`RuntimeDisposedError`
 * throw is reported for the caller to classify as a FAIL; a `RuntimeDisposedError` is flagged
 * so the caller can route it to SKIPPED (lifecycle, not the name-resolution contract).
 */
export async function invoke(fn: () => unknown): Promise<InvokeOutcome> {
  try {
    const result = (await fn()) as AnyResolutionResult;
    return { threw: false, result };
  } catch (err) {
    return { threw: true, disposed: isRuntimeDisposedError(err), description: describeError(err) };
  }
}

/** Outcome of constructing a fresh capability instance (INV-9 containment for `makeCapability`). */
export type ConstructOutcome<T> =
  | { readonly threw: false; readonly instance: T }
  | { readonly threw: true; readonly disposed: boolean; readonly description: string };

/**
 * INV-9: contain `makeCapability()`. Construction is synchronous on the interface, but a
 * fixture bug could still throw — that becomes classifiable data, never a harness crash.
 */
export function safeConstruct<T>(make: () => T): ConstructOutcome<T> {
  try {
    return { threw: false, instance: make() };
  } catch (err) {
    return { threw: true, disposed: isRuntimeDisposedError(err), description: describeError(err) };
  }
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
