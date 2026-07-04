/**
 * Synchronous ENS name shape validation (SF-2).
 *
 * A **pure, synchronous, client-free** shape gate: is a string plausibly a resolvable ENS name?
 * `isValidName` is the UIKit's per-keystroke hot-path predicate (INV-21) and `resolveName`'s own
 * step-2 gate (INV-4) — so it lives here, with no dependency on the service or the injected viem
 * client, and never performs I/O (INV-3, INV-13).
 *
 * The check is **ENSIP-15/UTS-46 `normalize`-based, not a TLD allowlist regex** (Design D-`isValidName`):
 * a `/\.(eth|xyz|…)$/` allowlist would wrongly reject legitimate wildcard / DNS / non-`.eth` names
 * (`.box`, offchain names) — exactly the resolvable inputs ENS-in-input must accept. A `true` is
 * **necessary but not sufficient** for resolution: it asserts shape, never existence of a record.
 *
 * @module name-resolution/name-validation
 */

import { normalize } from 'viem/ens';

import { isValidEvmAddress } from '../utils/validation';

/**
 * Whether `name` is a plausibly-resolvable ENS name — a total, pure, synchronous boolean predicate
 * that **never throws** (INV-3). Three ordered, allocation-light checks (INV-4):
 *
 * 1. **Reject a raw EVM hex address** — an address is not a name; resolving it is a category error
 *    (and lets the UIKit skip a needless resolution round-trip on pasted addresses).
 * 2. **Require at least one `.`** — bare single labels are rejected (Design Open Q3 / INV-4). Cheap
 *    structural pre-filter before the (heavier) normalization step.
 * 3. **Require ENSIP-15/UTS-46 normalizability** — `normalize` throwing is caught and reported as
 *    `false`, never propagated (INV-3): the UIKit calls this inside a render path with no `try/catch`.
 *
 * @param name - Arbitrary user input.
 * @returns `true` iff all three checks pass. Never throws, never does I/O.
 */
export function isValidName(name: string): boolean {
  if (isValidEvmAddress(name)) return false;
  if (!name.includes('.')) return false;
  try {
    normalize(name);
    return true;
  } catch {
    return false;
  }
}

/**
 * ENSIP-15/UTS-46 normalization of an ENS name.
 *
 * **Throws** on a structurally-invalid name (viem/@adraffy `ens-normalize`) — unlike {@link isValidName}
 * it does not swallow the failure. `resolveName` calls it as a backstop *after* `isValidName` has
 * already passed, so a throw here is the rare case a name survives the shape gate yet fails deep
 * normalization; the caller maps that throw to `UNSUPPORTED_NAME` (Design D-D), never to the mapper's
 * fuzzy needle path.
 *
 * @param name - A name that has (typically) already passed {@link isValidName}.
 * @returns The ENSIP-15-normalized form, suitable for `getEnsAddress`.
 * @throws When `name` is not a normalizable ENS name.
 */
export function normalizeName(name: string): string {
  return normalize(name);
}
