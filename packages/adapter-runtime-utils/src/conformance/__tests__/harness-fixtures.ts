import type {
  NameResolutionCapability,
  ResolutionResult,
  ResolvedName,
} from '@openzeppelin/ui-types';
import { RuntimeDisposedError } from '@openzeppelin/ui-types';

import { compliantForward, makeStub } from './fixtures';

/**
 * SF-4 Tests-stage helpers — instrumented stubs the Code-stage `fixtures.ts` did not need.
 *
 * These exist to prove the harness's *observable* hygiene invariants — INV-17 (one fresh
 * instance per case, zero dispose calls on required families), INV-20 (bounded call count,
 * no retries), INV-13 (identity-vs-equality determinism), INV-21 (cause-blind determinism) —
 * none of which can be asserted with a plain behavioral stub. Kept out of `fixtures.ts` so
 * the Code-stage substrate stays exactly as shipped (clean stage attribution).
 *
 * Zero concrete-adapter deps: builds on the abstract `makeStub` substrate only (INV-23).
 */

const VITALIK_NAME = 'vitalik.eth';
const VITALIK_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

/** Live counters mutated by {@link spyOnFactory} as the harness drives the instrumented stub. */
export interface CapabilitySpy {
  /** `makeCapability()` invocations — the feature-detect probe plus one per case (INV-17). */
  constructions: number;
  /** `dispose()` invocations — MUST stay 0 across a required-only run (INV-17). */
  disposes: number;
  /** `resolveName` invocations across all instances (INV-20). */
  resolveNameCalls: number;
  /** `resolveAddress` invocations across all instances (INV-20). */
  resolveAddressCalls: number;
}

/**
 * Wrap a NON-guarded base factory so every construction, dispose, and resolution call is
 * counted. The wrapper reassigns the plain stub's own methods, so it must NOT be given a
 * guard-Proxy instance (whose traps would reject the reassignment). Returns the shared
 * mutable {@link CapabilitySpy} plus the instrumented factory to hand to `checkConformance`.
 */
export function spyOnFactory(base: () => NameResolutionCapability): {
  readonly spy: CapabilitySpy;
  readonly factory: () => NameResolutionCapability;
} {
  const spy: CapabilitySpy = {
    constructions: 0,
    disposes: 0,
    resolveNameCalls: 0,
    resolveAddressCalls: 0,
  };
  const factory = (): NameResolutionCapability => {
    spy.constructions += 1;
    const inst = base();

    const origResolveName = inst.resolveName;
    if (origResolveName) {
      inst.resolveName = (name) => {
        spy.resolveNameCalls += 1;
        return origResolveName.call(inst, name);
      };
    }
    const origResolveAddress = inst.resolveAddress;
    if (origResolveAddress) {
      inst.resolveAddress = (address) => {
        spy.resolveAddressCalls += 1;
        return origResolveAddress.call(inst, address);
      };
    }
    const origDispose = inst.dispose;
    inst.dispose = () => {
      spy.disposes += 1;
      origDispose.call(inst);
    };

    return inst;
  };
  return { spy, factory };
}

/**
 * A reverse capability that MEMOIZES: both determinism calls return the SAME object
 * reference. Proves INV-13 accepts identity (Object.is short-circuit) — object identity is
 * sufficient but never *required* (the compliant re-querier proves fresh-but-equal also PASSes).
 */
export function makeMemoizingReverse(): NameResolutionCapability {
  const cached: ResolutionResult<ResolvedName> = {
    ok: true,
    value: {
      address: VITALIK_ADDRESS,
      name: VITALIK_NAME,
      forwardVerified: true,
      provenance: { label: 'ENS', external: false },
    },
  };
  return makeStub({ resolveAddress: () => cached });
}

/**
 * A reverse capability whose payload is otherwise stable but whose `avatarUrl` FLAPS across
 * calls. Determinism PASSes by default (avatar dropped from the compare) and FAILs only when
 * the caller opts into `stableAvatarSurface: true` (SF-3 INV-13 carry-in / INV-13).
 */
export function makeFlappingAvatarReverse(): NameResolutionCapability {
  let n = 0;
  return makeStub({
    resolveAddress: (input) => {
      n += 1;
      return {
        ok: true,
        value: {
          address: input,
          name: VITALIK_NAME,
          forwardVerified: true,
          avatarUrl: `https://cdn.example/${n}.png`,
          provenance: { label: 'ENS', external: false },
        },
      };
    },
  });
}

/**
 * A forward capability that succeeds on call #1 and THROWS on call #2 — isolates the INV-9
 * containment of the second (determinism) call: the throw becomes an INV-12 FAIL, never a
 * double-counted INV-8 FAIL and never a harness rejection.
 */
export function makeThrowOnSecondCallForward(): NameResolutionCapability {
  let n = 0;
  return makeStub({
    resolveName: (input) => {
      n += 1;
      if (n >= 2) {
        throw new Error('second-call-boom');
      }
      return compliantForward(input);
    },
  });
}

/**
 * An expected-failure reverse capability whose typed `detail` field FLAPS across the two
 * determinism calls — a genuine non-determinism on the `{ok:false}` arm. INV-13 grades
 * failure vectors too, so this FAILs INV-12.
 */
export function makeFlappingErrorDetailReverse(): NameResolutionCapability {
  let n = 0;
  return makeStub({
    resolveAddress: () => {
      n += 1;
      return { ok: false, error: { code: 'EXTERNAL_GATEWAY_ERROR', detail: `attempt-${n}` } };
    },
  });
}

/**
 * An expected-failure reverse capability whose only cross-call difference is a fresh native
 * `error.cause` each time. Because `cause` is dropped before the compare (INV-21), this
 * PASSes INV-12 — proving the harness is cause-blind, not cause-sensitive.
 */
export function makeFlappingCauseReverse(): NameResolutionCapability {
  return makeStub({
    resolveAddress: () => ({
      ok: false,
      error: { code: 'ADAPTER_ERROR', message: 'stable-message', cause: new Error('fresh-native') },
    }),
  });
}

/**
 * A capability whose resolution call throws a genuine `RuntimeDisposedError` — the ONE
 * sanctioned throw. On the INV-8 surface this must route to SKIPPED (lifecycle, not the
 * name-resolution contract), never a FAIL, via the single INV-11 predicate.
 */
export function makeDisposedThrowerForward(): NameResolutionCapability {
  return makeStub({
    resolveName: () => {
      throw new RuntimeDisposedError('name-resolution');
    },
  });
}
