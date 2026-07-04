import type { NameResolutionCapability } from '@openzeppelin/ui-types';

import { describeError, invoke, safeConstruct, type CheckOutcome } from '../internal';

/**
 * INV-26 — OPTIONAL lifecycle sanctioned-throw family (opt-in, isolated).
 *
 * Runs ONLY on its own DEDICATED instance — never one used by the four required families —
 * so INV-17 (required families never see a disposed instance) is preserved and
 * `RuntimeDisposedError` stays off the INV-8 surface. Constructs a fresh instance, disposes
 * it, then invokes a method and asserts the call throws / rejects `RuntimeDisposedError`.
 *
 * This completes the throw taxonomy: INV-8 says "every non-`RuntimeDisposedError` throw is a
 * violation" but never positively verifies the sole *sanctioned* throw actually fires
 * post-dispose. The dev opted to ship it now; it can never affect the required-four verdict.
 */
export async function checkLifecycle(
  makeCapability: () => NameResolutionCapability
): Promise<CheckOutcome> {
  const construct = safeConstruct(makeCapability);
  if (construct.threw) {
    return {
      status: 'FAIL',
      message: `lifecycle probe could not construct a dedicated instance — ${construct.description}`,
    };
  }

  const instance = construct.instance;
  if (typeof instance.dispose !== 'function') {
    return {
      status: 'SKIPPED',
      message: 'capability exposes no dispose() — lifecycle family not applicable',
    };
  }

  // Prefer a resolution method as the post-dispose probe; fall back to the always-present
  // synchronous isValidName. References are captured pre-dispose so the guard Proxy throws at
  // call time (INV-9 contains sync-throw and rejection identically).
  const resolveName = instance.resolveName;
  const resolveAddress = instance.resolveAddress;
  let probe: () => unknown;
  if (typeof resolveName === 'function') {
    probe = () => resolveName.call(instance, 'lifecycle.probe');
  } else if (typeof resolveAddress === 'function') {
    probe = () => resolveAddress.call(instance, 'lifecycle-probe-address');
  } else {
    probe = () => instance.isValidName('lifecycle.probe');
  }

  try {
    instance.dispose();
  } catch (err) {
    return { status: 'FAIL', message: `dispose() itself threw — ${describeError(err)}` };
  }

  const outcome = await invoke(probe);
  if (!outcome.threw) {
    return {
      status: 'FAIL',
      message: 'post-dispose call did not throw — expected RuntimeDisposedError',
    };
  }
  if (outcome.disposed) {
    return { status: 'PASS', message: 'post-dispose call threw RuntimeDisposedError (sanctioned)' };
  }
  return {
    status: 'FAIL',
    message: `post-dispose call threw a non-RuntimeDisposedError — ${outcome.description}`,
  };
}
