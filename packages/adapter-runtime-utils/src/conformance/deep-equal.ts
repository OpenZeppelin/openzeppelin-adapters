import type { AnyResolutionResult } from './types';

/**
 * INV-12 determinism engine — a hand-rolled, zero-third-party-dep normalize pre-pass plus
 * structural comparator. The comparator is conformance-critical (a bug here is a false
 * pass/fail in the gate itself), so it is unit-tested in `__tests__/deep-equal.test.ts`.
 */

/**
 * Is `v` a plain, JSON-ish object (prototype `Object.prototype` or `null`)?
 *
 * The normalized ui-types resolution core contains only strings, numbers, booleans, `null`,
 * arrays, and nested plain objects — no `Date` / `Map` / `Set` / `RegExp` / typed arrays.
 * A non-plain object is therefore never recursed into: `normalize` returns it verbatim and
 * `structuralEqual` falls back to identity, a conservative choice that surfaces as a
 * determinism FAIL rather than a silent false pass (INV-15).
 */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    return false;
  }
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
}

/**
 * Recursively drop every own-enumerable key whose value is `undefined`, at every depth,
 * returning a NEW structure (the input is never mutated).
 *
 * This is what makes `{ avatarUrl: undefined }` and `{}` (key absent) normalize to the
 * SAME shape and therefore compare EQUAL — consistent with SF-3 INV-4 (`avatarUrl` is
 * key-absent-when-undefined) and the closed union's optional fields (`scopedToNetworkId?`).
 */
function dropUndefinedDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(dropUndefinedDeep);
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      const child = value[key];
      if (child === undefined) {
        continue; // INV-14(a): explicit-undefined ≡ absent-key
      }
      out[key] = dropUndefinedDeep(child);
    }
    return out;
  }
  return value;
}

/**
 * Canonicalize a `ResolutionResult` for structural comparison so two runs of a *compliant*
 * adapter compare equal regardless of memoize-vs-re-query.
 *
 * 1. Recursively drop `undefined`-valued keys (INV-14a).
 * 2. On `{ ok: true }`: drop `avatarUrl` unless `includeAvatar` (SF-3 INV-13 carry-in, D-4).
 * 3. On `{ ok: false }`: drop `error.cause` — `unknown`-typed diagnostic data that may hold
 *    a live native `Error` with an unstable stack; chain-agnostic code MUST NOT narrow it,
 *    so it never participates in the determinism compare (INV-21, D-3). `code` and every
 *    typed payload field remain compared.
 *
 * Pure: returns a new plain-object structure; the input is never mutated (INV-14e).
 */
export function normalizeResolutionResult(
  result: AnyResolutionResult,
  opts: { readonly includeAvatar: boolean }
): unknown {
  if (result.ok) {
    const value: Record<string, unknown> = { ...result.value };
    if (!opts.includeAvatar) {
      delete value.avatarUrl; // operates on the shallow copy — input untouched
    }
    return dropUndefinedDeep({ ok: true, value });
  }
  const error: Record<string, unknown> = { ...result.error };
  delete error.cause; // INV-21: cause is never inspected, compared, or surfaced
  return dropUndefinedDeep({ ok: false, error });
}

/**
 * Hand-rolled structural equality over plain JSON-ish data (INV-15). Reflexive, symmetric,
 * and terminating (the normalized ui-types core is finite and acyclic).
 *
 * - Primitives (strings, numbers incl. `NaN`, booleans, `null`) via `Object.is` semantics;
 *   `undefined` never reaches here post-normalize.
 * - Arrays: equal length AND elementwise-recursive.
 * - Plain objects: identical own-enumerable key SETS (order-insensitive) AND per-key recursive.
 * - Type mismatch (array-vs-object, differing `typeof`) → `false`.
 * - Any non-plain object → identity fallback (`Object.is` already returned `false` for
 *   distinct references), a conservative FAIL rather than a silent false pass.
 */
export function structuralEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    return a.every((element, index) => structuralEqual(element, b[index]));
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) {
      return false;
    }
    return keysA.every(
      (key) => Object.prototype.hasOwnProperty.call(b, key) && structuralEqual(a[key], b[key])
    );
  }

  // Distinct references that are not both arrays / both plain objects: identity fallback.
  return false;
}
