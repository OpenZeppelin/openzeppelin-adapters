/**
 * `@openzeppelin/adapter-runtime-utils/conformance` — the parameterized, adapter-agnostic
 * name-resolution conformance harness.
 *
 * A runner-agnostic pure core ({@link checkConformance}) enforces the four UIKit contract
 * families only an adapter can satisfy — INV-6 (concrete-boolean `forwardVerified`), INV-8
 * (expected failures never throw), INV-12 (deterministic under stable state), INV-16
 * (user-safe `provenance.label`) — plus an optional lifecycle family, returning per-invariant
 * verdicts as data. {@link describeConformance} is a thin vitest projection of that data.
 *
 * Zero concrete-adapter dependencies: this module imports only `@openzeppelin/ui-types` (and
 * `vitest` as an optional peer, used solely by the binding). The compliant EVM run lives in
 * `adapter-evm-core`'s own tests, avoiding a dependency cycle.
 */

export { checkConformance } from './checker';
export { describeConformance } from './vitest-binding';
export { DEFAULT_LABEL_POLICY, isUserSafeLabel } from './label-policy';
export { normalizeResolutionResult, structuralEqual } from './deep-equal';
export { NAME_RESOLUTION_ERROR_CODES } from './checks/never-throws';

export {
  type CheckStatus,
  ConformanceConfigError,
  type ConformanceConfig,
  type ConformanceReport,
  type ForwardVector,
  type InvariantId,
  type InvariantResult,
  type LabelDenyRule,
  type LabelPolicy,
  type NameResolutionErrorCode,
  type ReverseVector,
  type VectorExpectation,
} from './types';
