import { normalizeResolutionResult, structuralEqual } from '../deep-equal';
import type { CheckOutcome } from '../internal';
import type { AnyResolutionResult } from '../types';

/**
 * UIKit INV-12 — deterministic under stable state.
 *
 * Two results from calling the method twice on the SAME fresh instance are normalized and
 * structurally compared. Object identity is NEVER required — a memoizer returning the same
 * reference and a re-querier returning a fresh-but-equal object both PASS. `includeAvatar`
 * follows `config.stableAvatarSurface`; `error.cause` is always excluded (see `deep-equal`).
 */
export function checkDeterminism(
  first: AnyResolutionResult,
  second: AnyResolutionResult,
  includeAvatar: boolean
): CheckOutcome {
  const a = normalizeResolutionResult(first, { includeAvatar });
  const b = normalizeResolutionResult(second, { includeAvatar });

  if (structuralEqual(a, b)) {
    return { status: 'PASS', message: 'two calls on the same instance are structurally equal' };
  }

  return {
    status: 'FAIL',
    message: `two calls on the same instance differ structurally — normalized A=${safeShallowHint(a)} vs B=${safeShallowHint(b)}`,
  };
}

/**
 * A shallow, bounded diff hint for a FAIL message. Only top-level `ok` and the immediate
 * key set are surfaced — deep contents (which could carry adapter-provided strings) are not
 * serialized, keeping the message diagnostic without leaking nested payload.
 */
function safeShallowHint(normalized: unknown): string {
  if (typeof normalized !== 'object' || normalized === null) {
    return String(normalized);
  }
  const record = normalized as Record<string, unknown>;
  const inner = record.ok === true ? record.value : record.error;
  const innerKeys =
    typeof inner === 'object' && inner !== null
      ? Object.keys(inner as Record<string, unknown>).sort()
      : [];
  return `{ok:${String(record.ok)}, keys:[${innerKeys.join(',')}]}`;
}
