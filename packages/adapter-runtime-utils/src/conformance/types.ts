import type {
  NameResolutionCapability,
  NameResolutionError,
  ResolutionResult,
  ResolvedAddress,
  ResolvedName,
} from '@openzeppelin/ui-types';

/**
 * The closed name-resolution error-code set, derived from the `@openzeppelin/ui-types`
 * union so it can never drift from the source of truth.
 *
 * The runtime membership set lives in `checks/never-throws.ts` and is compile-time
 * pinned to this type (adding/removing a code in ui-types breaks the build), satisfying
 * the "closed 7-code union derived from `NameResolutionError['code']`" obligation.
 */
export type NameResolutionErrorCode = NameResolutionError['code'];

/**
 * What a vector expects the capability to produce for its input.
 *
 * `{ ok: true }` — expect a successful resolution; the concrete value drives the
 * UIKit INV-6 / INV-16 value checks and INV-12 determinism.
 * `{ ok: false, code }` — an EXPECTED-FAILURE vector; drives the UIKit INV-8
 * never-throw taxonomy. `code` is the declared closed-union code.
 */
export type VectorExpectation =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: NameResolutionErrorCode };

/** A forward-resolution case: an input name + expected outcome over the caller's pinned substrate. */
export interface ForwardVector {
  readonly input: string;
  readonly expect: VectorExpectation;
  /** Optional short slug for report keys / test names (defaults to a sanitized `input`). */
  readonly label?: string;
}

/** A reverse-resolution case: an input address + expected outcome. */
export interface ReverseVector {
  readonly input: string;
  readonly expect: VectorExpectation;
  readonly label?: string;
}

/** A single belt-and-braces denylist rule for {@link LabelPolicy}. */
export interface LabelDenyRule {
  /** Stable identifier surfaced in the FAIL message (e.g. `'contains-url-scheme'`). */
  readonly name: string;
  /** Returns `true` when the label trips this rule and must be rejected. */
  readonly test: (label: string) => boolean;
}

/**
 * Defense-in-depth policy for UIKit INV-16. A label is user-safe iff it fully matches
 * `allow`, is within `maxLength`, and trips no `deny` rule. Callers may override the
 * whole policy via {@link ConformanceConfig.labelPolicy} — the override is used verbatim,
 * never merged with the default.
 */
export interface LabelPolicy {
  /** Anchored allowlist the label MUST fully match. */
  readonly allow: RegExp;
  /** Inclusive maximum length in characters. */
  readonly maxLength: number;
  /** Belt-and-braces denylist; if ANY predicate returns `true`, the label is rejected. */
  readonly deny: readonly LabelDenyRule[];
}

/** Configuration for a single conformance run. */
export interface ConformanceConfig {
  /**
   * Fresh capability per case (RS-TCK `createPublisher`). MUST wrap a pinned / mocked
   * substrate — the harness constructs a new instance for every case and never disposes
   * instances used by the four required families.
   */
  readonly makeCapability: () => NameResolutionCapability;
  /** Forward cases. Omit if the adapter has no `resolveName`; provided-but-unsupported → SKIPPED. */
  readonly forwardVectors?: readonly ForwardVector[];
  /** Reverse cases. Omit if the adapter has no `resolveAddress`; provided-but-unsupported → SKIPPED. */
  readonly reverseVectors?: readonly ReverseVector[];
  /** When `true`, INV-12 also compares `avatarUrl`. Default `false` (SF-3 INV-13 carry-in). */
  readonly stableAvatarSurface?: boolean;
  /** Override the INV-16 policy. Default = {@link DEFAULT_LABEL_POLICY}. */
  readonly labelPolicy?: LabelPolicy;
  /** Human-readable suite name for report / test grouping. Default `'NameResolutionCapability'`. */
  readonly suiteName?: string;
  /**
   * Opt in to the OPTIONAL lifecycle sanctioned-throw family (INV-26). Default `false`.
   * When `true` AND the capability exposes `dispose`, the harness constructs a dedicated
   * instance, disposes it, and asserts a subsequent call throws `RuntimeDisposedError`.
   * Never touches instances used by the four required families.
   */
  readonly lifecycleProbe?: boolean;
}

/**
 * The invariant a result is keyed to.
 *
 * `INV-6` / `INV-8` / `INV-12` / `INV-16` are the four required UIKit contract families.
 * `EXPECT` is SF-4's vector-expectation-fidelity check (a declared-`ok:true` vector that
 * returns `{ ok: false }`). `INV-26` is the OPTIONAL lifecycle sanctioned-throw family.
 */
export type InvariantId = 'INV-6' | 'INV-8' | 'INV-12' | 'INV-16' | 'EXPECT' | 'INV-26';

export type CheckStatus = 'PASS' | 'FAIL' | 'SKIPPED';

/** One verdict, keyed to an invariant and a specific case. */
export interface InvariantResult {
  readonly invariant: InvariantId;
  /** Invariant-numbered, report-unique key, e.g. `inv8_reverse_ADDRESS_NOT_FOUND_neverThrows`. */
  readonly key: string;
  readonly status: CheckStatus;
  /** On FAIL: expected vs. observed. On SKIPPED: why. On PASS: brief confirmation. */
  readonly message: string;
}

/** The full run outcome — a value, not a thrown result. */
export interface ConformanceReport {
  readonly results: readonly InvariantResult[];
  /** `true` iff NO result is FAIL. SKIPPED never fails a report. */
  readonly passed: boolean;
}

/**
 * The SOLE exception `checkConformance` may throw — reserved for caller programmer-error
 * in the `config` itself (a malformed `makeCapability`, vector, or `labelPolicy`). Adapter
 * misbehavior is never thrown; it is recorded as FAIL data in the report.
 */
export class ConformanceConfigError extends Error {
  readonly code = 'CONFORMANCE_CONFIG' as const;
  constructor(message: string) {
    super(message);
    this.name = 'ConformanceConfigError';
  }
}

/**
 * Internal narrowing helper: a resolution result over either directional payload. The
 * harness treats both directions uniformly for containment, expectation, and determinism.
 */
export type AnyResolutionResult = ResolutionResult<ResolvedAddress | ResolvedName>;
