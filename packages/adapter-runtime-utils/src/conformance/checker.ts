import type { NameResolutionCapability, ResolvedName } from '@openzeppelin/ui-types';

import { checkDeterminism } from './checks/determinism';
import { checkForwardVerified } from './checks/forward-verified';
import { checkLabel } from './checks/label-user-safe';
import { checkLifecycle } from './checks/lifecycle';
import {
  classifyExpectedFailure,
  neverThrewDisposedSkip,
  neverThrewViolation,
} from './checks/never-throws';

import {
  classifyResolutionResult,
  describeError,
  invoke,
  isNonNullObject,
  makeKeyDeduper,
  safeConstruct,
  safeGrade,
  sanitizeSlug,
  type InvokeOutcome,
} from './internal';
import { DEFAULT_LABEL_POLICY } from './label-policy';
import {
  ConformanceConfigError,
  type AnyResolutionResult,
  type ConformanceConfig,
  type ConformanceReport,
  type ForwardVector,
  type InvariantId,
  type InvariantResult,
  type LabelPolicy,
  type ReverseVector,
} from './types';

/**
 * The pure conformance core. Runner-agnostic — imports no test runner. Returns adapter
 * behavior as DATA (a {@link ConformanceReport}); the only exception it throws is
 * {@link ConformanceConfigError} for caller programmer-error (INV-10).
 */

type Direction = 'forward' | 'reverse';
type AnyVector = ForwardVector | ReverseVector;

/** A result before report-wide key de-duplication (INV-3). */
interface RawResult {
  readonly invariant: InvariantId;
  readonly key: string;
  readonly status: InvariantResult['status'];
  readonly message: string;
}

/**
 * Run the four conformance families (plus the optional lifecycle family) against
 * `config.makeCapability()` over the supplied vectors and return a structured report.
 *
 * Never throws for adapter misbehavior — a thrown expected-failure vector, a missing
 * `forwardVerified`, a non-user-safe label, or a non-deterministic result are all recorded
 * as FAIL data. Throws {@link ConformanceConfigError} only for programmer error in `config`.
 *
 * Feature-detection is structural: absent `resolveName` skips the forward family; absent
 * `resolveAddress` skips the reverse family AND UIKit INV-6. Skips are reported as SKIPPED,
 * never dropped (INV-2).
 */
export async function checkConformance(config: ConformanceConfig): Promise<ConformanceReport> {
  validateConfig(config); // INV-10: sole throw, before any capability call.

  const includeAvatar = config.stableAvatarSurface === true;
  const policy = config.labelPolicy ?? DEFAULT_LABEL_POLICY;
  const forwardVectors = config.forwardVectors ?? [];
  const reverseVectors = config.reverseVectors ?? [];

  // INV-9-contained probe, used only to feature-detect method presence, then discarded and
  // never disposed (INV-17). If construction itself throws, the substrate is broken — let each
  // per-vector construction surface that as FAIL data by treating both methods as present.
  const probe = safeConstruct(config.makeCapability);
  const hasResolveName = probe.threw || typeof probe.instance.resolveName === 'function';
  const hasResolveAddress = probe.threw || typeof probe.instance.resolveAddress === 'function';

  const raw: RawResult[] = [];

  // Ordering is fixed for self-determinism (INV-16): forward vectors, then reverse, in
  // caller-supplied order; then the optional lifecycle family.
  for (const vector of forwardVectors) {
    raw.push(
      ...(hasResolveName
        ? await runVector(config.makeCapability, 'forward', vector, includeAvatar, policy)
        : absentMethodResults('forward', vector))
    );
  }
  for (const vector of reverseVectors) {
    raw.push(
      ...(hasResolveAddress
        ? await runVector(config.makeCapability, 'reverse', vector, includeAvatar, policy)
        : absentMethodResults('reverse', vector))
    );
  }

  if (config.lifecycleProbe === true) {
    const leaf = await checkLifecycle(config.makeCapability);
    raw.push({
      invariant: 'INV-26',
      key: 'inv26_lifecycle_disposedThrows',
      status: leaf.status,
      message: leaf.message,
    });
  }

  // INV-3: enforce report-unique keys. INV-1: `passed` is COMPUTED from results, never a
  // separate mutable flag, so it can never disagree with the result set.
  const dedupe = makeKeyDeduper();
  const results: InvariantResult[] = raw.map((r) => ({
    invariant: r.invariant,
    key: dedupe(r.key),
    status: r.status,
    message: r.message,
  }));
  const passed = results.every((r) => r.status !== 'FAIL');

  return { results, passed };
}

/** Report-key set for one vector — a pure function of (family, direction, label, code) (INV-3). */
interface VectorKeys {
  readonly inv8: string;
  readonly inv6: string;
  readonly inv16: string;
  readonly inv12: string;
  readonly expect: string;
}

function deriveKeys(direction: Direction, vector: AnyVector): VectorKeys {
  const label = vector.label ?? sanitizeSlug(vector.input);
  const codeOrLabel = vector.expect.ok ? label : vector.expect.code;
  return {
    inv8: `inv8_${direction}_${codeOrLabel}_neverThrows`,
    inv6: `inv6_${label}_forwardVerifiedConcreteBoolean`,
    inv16: `inv16_${direction}_${label}_labelUserSafe`,
    inv12: `inv12_${direction}_${label}_deterministic`,
    expect: `inv_expect_${direction}_${label}_expectedSuccessGotFailure`,
  };
}

/**
 * Grade a single vector on a FRESH instance (INV-17). Performs at most two calls (INV-20):
 * call #1 drives INV-8 / expectation / UIKit INV-6 / UIKit INV-16; call #2 drives INV-12.
 * Every call is routed through the shared {@link invoke} wrapper, so no throw escapes (INV-9).
 */
async function runVector(
  makeCapability: () => NameResolutionCapability,
  direction: Direction,
  vector: AnyVector,
  includeAvatar: boolean,
  policy: LabelPolicy
): Promise<RawResult[]> {
  const keys = deriveKeys(direction, vector);
  const isSuccessVector = vector.expect.ok;

  const construct = safeConstruct(makeCapability);
  if (construct.threw) {
    // Construction failed — treat as a call that could not proceed (INV-9 containment).
    return construct.disposed
      ? skippedForFailedCall(direction, vector, keys, 'construction threw RuntimeDisposedError')
      : failedForThrow(direction, vector, keys, `construction threw — ${construct.description}`);
  }

  const instance = construct.instance;
  const method = direction === 'forward' ? instance.resolveName : instance.resolveAddress;
  if (typeof method !== 'function') {
    return absentMethodResults(direction, vector); // defensive; feature-detect should preclude this
  }
  const call = (): unknown => method.call(instance, vector.input);

  const outcome1 = await invoke(call);
  const outcome2 = await invoke(call); // INV-12 second call on the SAME instance

  // --- Exception containment (INV-9 / INV-8) on the first call ---
  if (outcome1.threw) {
    return outcome1.disposed
      ? skippedForFailedCall(direction, vector, keys, 'call threw RuntimeDisposedError')
      : failedForThrow(direction, vector, keys, `call threw/rejected — ${outcome1.description}`);
  }

  // --- Shape containment (INV-9): grade the RETURNED value through a runtime guard, never the
  // adapter's compile-time type. A return that is not a discriminable `{ ok: true | false }`
  // envelope is FAIL data, not a thrown TypeError from an unguarded dereference downstream.
  const shape = classifyResolutionResult(outcome1.result);
  if (shape.kind === 'malformed') {
    return failedForMalformedResult(direction, vector, keys, shape.reason);
  }
  const r1 = shape.result;
  const out: RawResult[] = [];

  if (isSuccessVector) {
    if (r1.ok) {
      // Realized success — the value checks apply, but only once the value payload is itself a
      // dereferenceable object. Reading `.value` is contained (INV-9): a hostile getter is graded
      // as a value-inspection FAIL, never an uncontained throw — mirroring the missing-value shape
      // below so the report's row count / order stay stable.
      let value: unknown;
      try {
        value = r1.value;
      } catch (err) {
        const reason = `reading the ok:true result value threw — ${describeError(err)}`;
        if (direction === 'reverse') {
          out.push({ invariant: 'INV-6', key: keys.inv6, status: 'FAIL', message: reason });
        }
        out.push({ invariant: 'INV-16', key: keys.inv16, status: 'FAIL', message: reason });
        out.push(skip('INV-12', keys.inv12, 'no inspectable value — value read threw'));
        return out;
      }
      if (!isNonNullObject(value)) {
        const reason = 'ok:true result has no value object to inspect';
        if (direction === 'reverse') {
          out.push({ invariant: 'INV-6', key: keys.inv6, status: 'FAIL', message: reason });
        }
        out.push({ invariant: 'INV-16', key: keys.inv16, status: 'FAIL', message: reason });
        out.push(skip('INV-12', keys.inv12, 'no value object to compare'));
        return out;
      }
      if (direction === 'reverse') {
        // Each leaf is grade-contained (INV-9): a throwing nested getter, a bigint, or a deep /
        // circular payload becomes THIS invariant's FAIL, not a throw out of the grading phase.
        const leaf = safeGrade(() => checkForwardVerified(value as unknown as ResolvedName)); // UIKit INV-6
        out.push({
          invariant: 'INV-6',
          key: keys.inv6,
          status: leaf.status,
          message: leaf.message,
        });
      }
      const labelLeaf = safeGrade(() =>
        checkLabel((value as unknown as ResolvedName).provenance, policy)
      ); // UIKit INV-16
      out.push({ invariant: 'INV-16', key: keys.inv16, ...labelLeaf });
      out.push(determinismResult(keys.inv12, r1, outcome2, includeAvatar));
    } else {
      // INV-6 (vector-expectation fidelity): declared ok:true but returned {ok:false}. The code
      // hint is read defensively so a malformed error payload cannot turn this FAIL into a throw.
      out.push({
        invariant: 'EXPECT',
        key: keys.expect,
        status: 'FAIL',
        message: `expected {ok:true}, but the call returned {ok:false} with code ${safeErrorCodeHint(r1)} (no throw) — an unexpected typed failure`,
      });
      // Dependent value checks are not evaluable — SKIPPED, never silently passed.
      if (direction === 'reverse') {
        out.push(skip('INV-6', keys.inv6, 'no value to inspect — see expectation FAIL'));
      }
      out.push(skip('INV-16', keys.inv16, 'no value to inspect — see expectation FAIL'));
      out.push(skip('INV-12', keys.inv12, 'no value to inspect — see expectation FAIL'));
    }
  } else {
    // Expected-failure vector: INV-8 decision table on the returned result. Grade-contained
    // (INV-9) so a hostile `.error` / `.code` getter on the returned payload becomes an INV-8
    // FAIL, never a throw out of the grading phase. `code` is read here, where the discriminant
    // narrowing holds, then captured — the narrowing does not survive into the closure.
    const declaredCode = vector.expect.code;
    const leaf = safeGrade(() => classifyExpectedFailure(declaredCode, r1));
    out.push({ invariant: 'INV-8', key: keys.inv8, ...leaf });
    // Determinism still applies to expected-failure vectors (INV-13).
    out.push(determinismResult(keys.inv12, r1, outcome2, includeAvatar));
  }

  return out;
}

/** INV-12 verdict, containing a throw on the second call (INV-9). */
function determinismResult(
  key: string,
  first: AnyResolutionResult,
  outcome2: InvokeOutcome,
  includeAvatar: boolean
): RawResult {
  if (outcome2.threw) {
    return outcome2.disposed
      ? skip('INV-12', key, 'second determinism call threw RuntimeDisposedError')
      : {
          invariant: 'INV-12',
          key,
          status: 'FAIL',
          message: `second determinism call threw/rejected — ${outcome2.description}`,
        };
  }
  // Shape-contain the second call too (INV-9): a malformed second result is an INV-12 FAIL, not
  // a TypeError from `normalizeResolutionResult` dereferencing `result.ok` on a non-object.
  const secondShape = classifyResolutionResult(outcome2.result);
  if (secondShape.kind === 'malformed') {
    return {
      invariant: 'INV-12',
      key,
      status: 'FAIL',
      message: `second determinism call returned a malformed result — ${secondShape.reason}`,
    };
  }
  // Grade-contained (INV-9): normalization spreads the returned `value`/`error` and the
  // structural walk recurses it — a hostile getter, a bigint, or a deep / circular payload
  // becomes an INV-12 FAIL, never a throw out of the grading phase.
  const leaf = safeGrade(() => checkDeterminism(first, secondShape.result, includeAvatar));
  return { invariant: 'INV-12', key, status: leaf.status, message: leaf.message };
}

/** A never-throw FAIL on the first call, with all dependent value/determinism checks SKIPPED. */
function failedForThrow(
  direction: Direction,
  vector: AnyVector,
  keys: VectorKeys,
  description: string
): RawResult[] {
  const out: RawResult[] = [
    { invariant: 'INV-8', key: keys.inv8, ...neverThrewViolation(description) },
  ];
  const reason = 'not evaluable — call threw; see INV-8';
  if (vector.expect.ok) {
    if (direction === 'reverse') {
      out.push(skip('INV-6', keys.inv6, reason));
    }
    out.push(skip('INV-16', keys.inv16, reason));
  }
  out.push(skip('INV-12', keys.inv12, reason));
  return out;
}

/**
 * A structurally-malformed first result — the adapter neither threw nor returned a
 * discriminable `{ ok: true | false }` envelope. Recorded as an INV-8 FAIL (the never-throw
 * contract implies a well-formed typed result), with dependent value/determinism checks
 * SKIPPED — mirroring {@link failedForThrow} so the report shape stays uniform.
 */
function failedForMalformedResult(
  direction: Direction,
  vector: AnyVector,
  keys: VectorKeys,
  reason: string
): RawResult[] {
  const out: RawResult[] = [
    {
      invariant: 'INV-8',
      key: keys.inv8,
      status: 'FAIL',
      message: `expected a well-formed {ok:true|false} ResolutionResult, but the call returned a malformed result — ${reason}`,
    },
  ];
  const skipReason = 'not evaluable — result was malformed; see INV-8';
  if (vector.expect.ok) {
    if (direction === 'reverse') {
      out.push(skip('INV-6', keys.inv6, skipReason));
    }
    out.push(skip('INV-16', keys.inv16, skipReason));
  }
  out.push(skip('INV-12', keys.inv12, skipReason));
  return out;
}

/**
 * Read a returned result's `error.code` hint for a FAIL message with TOTAL containment (INV-9):
 * both the `.error` read off the result and the `.code` read inside {@link errorCodeHint} may hit
 * a hostile getter, so the whole access is guarded and degrades to a marker rather than throwing.
 */
function safeErrorCodeHint(result: AnyResolutionResult): string {
  try {
    return errorCodeHint((result as { error?: unknown }).error);
  } catch (err) {
    return `<error payload read threw: ${describeError(err)}>`;
  }
}

/** A defensive `error.code` hint for a FAIL message — never throws on a malformed error payload. */
function errorCodeHint(error: unknown): string {
  if (!isNonNullObject(error)) {
    return `<no error payload: ${error === null ? 'null' : typeof error}>`;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : `<non-string code: ${typeof code}>`;
}

/** A caught `RuntimeDisposedError` on the first call — everything for this vector SKIPPED. */
function skippedForFailedCall(
  direction: Direction,
  vector: AnyVector,
  keys: VectorKeys,
  reason: string
): RawResult[] {
  const out: RawResult[] = [{ invariant: 'INV-8', key: keys.inv8, ...neverThrewDisposedSkip() }];
  if (vector.expect.ok) {
    if (direction === 'reverse') {
      out.push(skip('INV-6', keys.inv6, reason));
    }
    out.push(skip('INV-16', keys.inv16, reason));
  }
  out.push(skip('INV-12', keys.inv12, reason));
  return out;
}

/** Feature-detect miss: the direction's method is absent — SKIP its applicable families (INV-2). */
function absentMethodResults(direction: Direction, vector: AnyVector): RawResult[] {
  const keys = deriveKeys(direction, vector);
  const reason = `${direction === 'forward' ? 'resolveName' : 'resolveAddress'} absent`;
  const out: RawResult[] = [];
  if (vector.expect.ok) {
    if (direction === 'reverse') {
      out.push(skip('INV-6', keys.inv6, reason));
    }
    out.push(skip('INV-16', keys.inv16, reason));
  } else {
    out.push(skip('INV-8', keys.inv8, reason));
  }
  out.push(skip('INV-12', keys.inv12, reason));
  return out;
}

function skip(invariant: InvariantId, key: string, reason: string): RawResult {
  return { invariant, key, status: 'SKIPPED', message: reason };
}

/**
 * INV-10: validate `config` up front so a config bug can never be misreported as an adapter
 * FAIL, and adapter misbehavior can never be misreported as a config error. Runs before the
 * first `makeCapability()` call.
 */
function validateConfig(config: ConformanceConfig): void {
  const c = config as unknown as Record<string, unknown>;
  if (typeof c !== 'object' || c === null) {
    throw new ConformanceConfigError('config must be an object');
  }
  if (typeof c.makeCapability !== 'function') {
    throw new ConformanceConfigError('config.makeCapability must be a function');
  }
  validateVectors('forwardVectors', c.forwardVectors);
  validateVectors('reverseVectors', c.reverseVectors);
  if (c.stableAvatarSurface !== undefined && typeof c.stableAvatarSurface !== 'boolean') {
    throw new ConformanceConfigError('config.stableAvatarSurface must be a boolean');
  }
  if (c.suiteName !== undefined && typeof c.suiteName !== 'string') {
    throw new ConformanceConfigError('config.suiteName must be a string');
  }
  if (c.lifecycleProbe !== undefined && typeof c.lifecycleProbe !== 'boolean') {
    throw new ConformanceConfigError('config.lifecycleProbe must be a boolean');
  }
  if (c.labelPolicy !== undefined) {
    validatePolicy(c.labelPolicy);
  }
}

function validateVectors(field: string, value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    throw new ConformanceConfigError(`config.${field} must be an array when provided`);
  }
  value.forEach((vector, index) => {
    const where = `config.${field}[${index}]`;
    if (typeof vector !== 'object' || vector === null) {
      throw new ConformanceConfigError(`${where} must be an object`);
    }
    const v = vector as Record<string, unknown>;
    if (typeof v.input !== 'string') {
      throw new ConformanceConfigError(`${where}.input must be a string`);
    }
    if (v.label !== undefined && typeof v.label !== 'string') {
      throw new ConformanceConfigError(`${where}.label must be a string when provided`);
    }
    if (typeof v.expect !== 'object' || v.expect === null) {
      throw new ConformanceConfigError(`${where}.expect must be an object`);
    }
    const expect = v.expect as Record<string, unknown>;
    if (typeof expect.ok !== 'boolean') {
      throw new ConformanceConfigError(`${where}.expect.ok must be a boolean`);
    }
    if (expect.ok === false && typeof expect.code !== 'string') {
      throw new ConformanceConfigError(
        `${where}.expect.code must be a string for an expected-failure vector`
      );
    }
  });
}

function validatePolicy(value: unknown): void {
  if (typeof value !== 'object' || value === null) {
    throw new ConformanceConfigError('config.labelPolicy must be an object');
  }
  const p = value as Record<string, unknown>;
  if (!(p.allow instanceof RegExp)) {
    throw new ConformanceConfigError('config.labelPolicy.allow must be a RegExp');
  }
  if (typeof p.maxLength !== 'number' || !Number.isFinite(p.maxLength)) {
    throw new ConformanceConfigError('config.labelPolicy.maxLength must be a finite number');
  }
  if (!Array.isArray(p.deny)) {
    throw new ConformanceConfigError('config.labelPolicy.deny must be an array');
  }
  p.deny.forEach((rule, index) => {
    if (typeof rule !== 'object' || rule === null) {
      throw new ConformanceConfigError(`config.labelPolicy.deny[${index}] must be an object`);
    }
    const r = rule as Record<string, unknown>;
    if (typeof r.name !== 'string') {
      throw new ConformanceConfigError(`config.labelPolicy.deny[${index}].name must be a string`);
    }
    if (typeof r.test !== 'function') {
      throw new ConformanceConfigError(`config.labelPolicy.deny[${index}].test must be a function`);
    }
  });
}
