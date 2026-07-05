import { safeJsonHint, type CheckOutcome } from '../internal';
import type { AnyResolutionResult, NameResolutionErrorCode } from '../types';

/**
 * UIKit INV-8 — the never-throw taxonomy (the decision table). Also carries the closed
 * error-code union used across the harness.
 */

/**
 * The closed 7-code union as runtime data.
 *
 * The `satisfies` clause plus the two-way `_CodesMatchUnion` assertion below pin this array
 * to `NameResolutionError['code']` at compile time: if ui-types adds, removes, or renames a
 * code, the build breaks here — the runtime set can never silently drift from the type (INV-24).
 */
const CODES = [
  'NAME_NOT_FOUND',
  'ADDRESS_NOT_FOUND',
  'UNSUPPORTED_NETWORK',
  'UNSUPPORTED_NAME',
  'RESOLUTION_TIMEOUT',
  'EXTERNAL_GATEWAY_ERROR',
  'ADAPTER_ERROR',
] as const satisfies readonly NameResolutionErrorCode[];

// Compile-time exhaustiveness: every union member is present AND no extra members exist.
type _CodesMatchUnion = NameResolutionErrorCode extends (typeof CODES)[number] ? true : never;
const _assertCodesMatchUnion: _CodesMatchUnion = true;
void _assertCodesMatchUnion;

/** The closed name-resolution error-code set (membership test for INV-8). */
export const NAME_RESOLUTION_ERROR_CODES: ReadonlySet<string> = new Set(CODES);

/** Build the never-throw FAIL verdict for a thrown / rejected (non-disposed) call. */
export function neverThrewViolation(description: string): CheckOutcome {
  return {
    status: 'FAIL',
    message: `expected a returned {ok:false}, but the call threw/rejected — ${description}`,
  };
}

/** A caught `RuntimeDisposedError` — lifecycle, out of the INV-8 family (cannot occur in a normal run). */
export function neverThrewDisposedSkip(): CheckOutcome {
  return {
    status: 'SKIPPED',
    message:
      'call threw RuntimeDisposedError — lifecycle, not the name-resolution contract (harness never disposes required-family instances)',
  };
}

/**
 * Classify a RETURNED result on an EXPECTED-FAILURE (`expect.ok:false`) vector against the
 * INV-8 decision table:
 * - `{ok:false}`, code in union, code === declared → PASS.
 * - `{ok:false}`, code in union, code !== declared → PASS + note (code precision is SC-002,
 *   the adapter's own suite's concern — not an INV-8 failure; resolves Design Open Q3).
 * - `{ok:false}`, code out of union / missing / non-string → FAIL (fabricated code).
 * - `{ok:true}` (expected failure silently succeeded) → FAIL.
 */
export function classifyExpectedFailure(
  declaredCode: NameResolutionErrorCode,
  result: AnyResolutionResult
): CheckOutcome {
  if (result.ok) {
    return {
      status: 'FAIL',
      message: `expected a typed failure (${declaredCode}), but the call returned {ok:true} — an expected-failure path silently succeeded`,
    };
  }

  const error: unknown = result.error;
  if (typeof error !== 'object' || error === null) {
    return {
      status: 'FAIL',
      message: `returned {ok:false} without a typed error object (got ${
        error === null ? 'null' : typeof error
      }) — cannot classify against the closed 7-code union`,
    };
  }

  const observed: unknown = (error as { code?: unknown }).code;
  if (typeof observed !== 'string' || !NAME_RESOLUTION_ERROR_CODES.has(observed)) {
    return {
      status: 'FAIL',
      message: `returned code ${safeJsonHint(observed)} is outside the closed 7-code union — fabricated code outside the typed contract`,
    };
  }

  if (observed === declaredCode) {
    return { status: 'PASS', message: `returned {ok:false} with code ${observed} (never threw)` };
  }

  return {
    status: 'PASS',
    message: `never threw; returned {ok:false} with in-union code ${observed} (declared ${declaredCode}) — code precision is SC-002, not INV-8`,
  };
}
