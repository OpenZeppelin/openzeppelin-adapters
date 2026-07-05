/**
 * Native-error → `NameResolutionError` mapping (SF-1).
 *
 * A reusable, **stateless, pure** classification layer that converts the native failures raised
 * by the underlying resolution transport (viem client / RPC / CCIP-Read gateway / timeouts) into
 * the **closed seven-code `NameResolutionError` union** owned by UIKit SF-1 and exported from
 * `@openzeppelin/ui-types`. It is the single place the "never throw for expected failures"
 * contract is centralized: the forward (SF-2), reverse (SF-3), and ENS v2 (SF-5) paths all route
 * their caught native errors through the one total function {@link mapNameResolutionError}, and
 * construct the "resolved-to-nothing" variants through the small set of typed constructors below.
 *
 * The module owns **classification and union construction only** — it holds no state, performs no
 * I/O, reads no clock, and does not implement any resolution itself (SF-1 Design § State Ownership).
 *
 * ## Totality (INV-6)
 * Every input either **returns** a member of the closed union or **re-throws** a member of the
 * programmer-error allowlist (INV-9, currently `{ RuntimeDisposedError }`). There is no third
 * outcome — an unclassifiable native error maps to `ADAPTER_ERROR` carrying the original by
 * reference on `cause` (INV-7), so no failure is silently swallowed and no invented code escapes
 * the union (INV-1).
 *
 * ## Classification (SF-1 Design § Classification strategy)
 * `instanceof`-primary with a `.name`-needle fallback, over a bounded, cycle-safe walk of the
 * error `cause` chain (INV-15). `instanceof` is exact but brittle when two copies of `viem` /
 * `@openzeppelin/ui-types` coexist (duplicate-copy / bundling), so a `.name` backstop mirrors the
 * defense-in-depth `erc4626/error-mapping.ts` already applies.
 *
 * @remarks
 * The class → code table below is pinned to `viem@2.44.4` (the workspace-pinned version). A `viem`
 * major bump requires re-validating it. ENS Universal-Resolver reverts (`ResolverNotFound`,
 * `ResolverNotContract`, `UnsupportedResolverProfile`) and the UTS-46 `normalize()`-throw are **not**
 * mapper rows: SF-2 Design pre-classifies them on the resolution control path via the typed
 * constructors here (preserving INV-11), so this module maps only the transport-generic failures
 * (timeout / gateway / offchain / chain-unsupported) and provides the total `ADAPTER_ERROR` fallback.
 *
 * @module name-resolution/error-mapping
 */

import { BaseError, ChainDoesNotSupportContract, HttpRequestError, TimeoutError } from 'viem';

// Runtime import (not `import type`): INV-9 detects the programmer-error carve-out
// `instanceof`-primary, so the class identity is needed at runtime. `@openzeppelin/ui-types` is
// already a runtime dependency of this package (see `erc4626/error-mapping.ts`) and of
// `@openzeppelin/adapter-runtime-utils` (`runtime-capability.ts`), so this adds no new coupling.
// The `NameResolutionError` union itself is imported type-only (erased at build) per INV-18.
import { RuntimeDisposedError } from '@openzeppelin/ui-types';
import type { NameResolutionError } from '@openzeppelin/ui-types';

import { extractRevertInfo } from '../shared/revert-info';

/**
 * The closed seven-code taxonomy this module maps INTO, owned by UIKit SF-1 and imported
 * type-only from `@openzeppelin/ui-types`. Reproduced here as documentation ONLY — the
 * authoritative definition lives upstream and is never redefined or modified here.
 *
 * ```ts
 * type NameResolutionError =
 *   | { readonly code: 'NAME_NOT_FOUND';         readonly name: string }
 *   | { readonly code: 'ADDRESS_NOT_FOUND';      readonly address: string }
 *   | { readonly code: 'UNSUPPORTED_NETWORK';    readonly networkId: string }
 *   | { readonly code: 'UNSUPPORTED_NAME';       readonly name: string;    readonly reason: string }
 *   | { readonly code: 'RESOLUTION_TIMEOUT';     readonly elapsedMs: number }
 *   | { readonly code: 'EXTERNAL_GATEWAY_ERROR'; readonly detail: string }
 *   | { readonly code: 'ADAPTER_ERROR';          readonly message: string; readonly cause?: unknown };
 * ```
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * `RESOLUTION_TIMEOUT.elapsedMs` sentinel for "not measured" (INV-12). Chosen over `0` because it
 * is not a physically-realizable elapsed time, so a consumer can distinguish an unmeasured timeout
 * from a genuine sub-millisecond `0`. A `-1` reaching a consumer means a caller omitted its
 * required `ctx.elapsedMs` measurement (cross-SF caller obligation — SF-2/SF-3/SF-5).
 */
export const ELAPSED_UNMEASURED = -1 as const;

/** Stable fallback used when a native error yields no usable message string (INV-5). */
const FALLBACK_MESSAGE = 'unknown error';

/** Depth cap for the `cause`-chain walk — a totality guard against adversarially deep chains (INV-15). */
const MAX_CAUSE_CHAIN_DEPTH = 32;

/**
 * Closed programmer-error allowlist (INV-9). Membership is by class identity, never a structural
 * "looks like a bug" heuristic. Growth is an explicit, reviewable edit here — adding a member
 * NARROWS the never-throw guarantee (INV-6) that UIKit INV-8 and the SF-4 conformance harness
 * depend on, so treat additions as API-visible.
 */
const PROGRAMMER_ERROR_CLASSES = [RuntimeDisposedError] as const;
const PROGRAMMER_ERROR_NAMES: ReadonlySet<string> = new Set(['RuntimeDisposedError']);

/** viem timeout error `.name`s (fallback for the `instanceof TimeoutError` primary check). */
const TIMEOUT_ERROR_NAMES: ReadonlySet<string> = new Set(['TimeoutError']);

/**
 * CCIP-Read / offchain-lookup error `.name`s. The `OffchainLookup*` classes are NOT publicly
 * exported from `viem` (only their types are), so these are detected by `.name` only — exactly the
 * defense-in-depth fallback the classification strategy anticipates.
 */
const OFFCHAIN_GATEWAY_ERROR_NAMES: ReadonlySet<string> = new Set([
  'OffchainLookupError',
  'OffchainLookupResponseMalformedError',
  'OffchainLookupSenderMismatchError',
]);

/** viem HTTP transport error `.name`s (fallback for the `instanceof HttpRequestError` primary check). */
const HTTP_REQUEST_ERROR_NAMES: ReadonlySet<string> = new Set(['HttpRequestError']);

/**
 * ENS Universal-Resolver **decoded revert** `errorName`s that denote an offchain-gateway HTTP
 * failure (cross-SF drift D3, from SF-2 Code). Unlike the transport classes above, `HttpError` is not
 * a thrown viem class — it is the decoded `ContractFunctionRevertedError.data.errorName` (the thrown
 * error's own `.name` is `ContractFunctionRevertedError`), so it is matched via `extractRevertInfo`,
 * not the `.name` needle. It belongs in the same `EXTERNAL_GATEWAY_ERROR` bucket as `OffchainLookup*`
 * (D-E Part B). The resolution-*semantic* UR reverts (`ResolverNotFound` / `ResolverNotContract` /
 * `UnsupportedResolverProfile`) are deliberately absent — SF-2 pre-classifies those on its control
 * path via the constructors (INV-11); only the gateway-transport failure is a mapper row.
 */
const ENS_GATEWAY_REVERT_ERROR_NAMES: ReadonlySet<string> = new Set(['HttpError']);

/**
 * "This chain has no ENS Universal Resolver" error `.name`s (SF-2 Research G2 drift): the real
 * forward-path `UNSUPPORTED_NETWORK` signal is viem `ChainDoesNotSupportContract`, NOT
 * `EnsInvalidChainIdError` (that is an ENSIP-11 `coinType` case — SF-5) nor
 * `ClientChainNotConfiguredError` (a no-chain-at-all case SF-2 pre-empts at capability
 * construction, so here it falls to `ADAPTER_ERROR`).
 */
const CHAIN_UNSUPPORTED_ERROR_NAMES: ReadonlySet<string> = new Set(['ChainDoesNotSupportContract']);

/**
 * Credential-substring redaction patterns (INV-16), URL-scoped per the Invariants-stage default.
 * Applied to every free-text field derived from a raw native message (`ADAPTER_ERROR.message`,
 * `EXTERNAL_GATEWAY_ERROR.detail`) — viem/RPC errors routinely embed a provider URL carrying a key.
 * The full, unredacted original is retained ONLY on `ADAPTER_ERROR.cause` (opaque, INV-17), never
 * on a renderable string.
 *
 * The set below closes SF-1 Open Question 1 (URL-scoped redaction widened, SEC-REVIEW H1): beyond
 * the Alchemy/Infura `/vN/<key>` and userinfo/query shapes, provider keys also ship as a **bare
 * high-entropy trailing path segment** (Ankr `rpc.ankr.com/eth/<key>`, QuickNode `<host>/<key>`)
 * and under provider-specific query params (`?dkey=` for dRPC, etc.). Both leak un-redacted onto
 * `EXTERNAL_GATEWAY_ERROR.detail` / `ADAPTER_ERROR.message` under the old patterns, so they are
 * covered here. Redaction is deliberately biased toward over-scrubbing a rendered string (the
 * full value is always recoverable on `cause`); the high-entropy floor (≥32 base62url chars, incl.
 * `-`/`_` — Finding 5) and the host anchor keep it from touching legitimate short or hyphenated
 * path segments.
 */
const REDACTION_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  // scheme://user:pass@host  →  scheme://<redacted>@host  (URL userinfo)
  [/([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^/\s@]+@/gi, '$1<redacted>@'],
  // /v2/<key> , /v3/<key> …  →  /v2/<redacted>  (provider API key as a versioned path segment; 16+
  // chars so legitimate short path segments are not scrubbed — Alchemy /v2, Infura /v3)
  [/(\/v\d+\/)[A-Za-z0-9_-]{16,}/g, '$1<redacted>'],
  // …/eth/<KEY> , …/<KEY>/  →  …/<redacted>  (provider API key as a bare high-entropy trailing path
  // segment after a host — Ankr `rpc.ankr.com/eth/<key>`, QuickNode `<host>/<key>`). The class
  // includes `-`/`_` so a base64url or hyphenated key is caught (Finding 5); the floor is raised to
  // ≥32 chars — with `-`/`_` now in the class an ordinary hyphenated slug would otherwise match, and
  // a 32-char floor keeps the no-legit-segment bias while still covering real provider keys (which
  // are ≥32). The host anchor further scopes it to URL path segments.
  [/(\/\/[^/\s]+\/(?:[^/\s]+\/)*)[A-Za-z0-9_-]{32,}/g, '$1<redacted>'],
  // ?apiKey=… &key=… ?access_token=… ?dkey=… &secret=… …  →  =<redacted>  (key-bearing query params)
  [
    /([?&](?:api[-_]?key|apikey|key|dkey|access[-_]?token|token|auth|secret|client[-_]?secret|password|passwd|pass|pk)=)[^&\s]+/gi,
    '$1<redacted>',
  ],
];

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

/**
 * Payload details the mapper cannot recover from a caught error alone; the calling resolution path
 * (SF-2 / SF-3 / SF-5) supplies them at the catch site. All fields optional, so a bare
 * `mapNameResolutionError(error)` is always valid (INV-4); each field only refines the mapped
 * result when its corresponding classification fires.
 */
export interface NameResolutionErrorContext {
  /**
   * The active network id (this repo's `NetworkConfig.networkId` namespace), used to populate
   * `UNSUPPORTED_NETWORK.networkId`. Omitted → the code still maps, with an empty `networkId` the
   * caller may backfill.
   */
  readonly networkId?: string;

  /**
   * Elapsed milliseconds measured by the caller's timeout wrapper, used to populate
   * `RESOLUTION_TIMEOUT.elapsedMs`. The mapper cannot read a clock (purity, INV-14), so this is
   * caller-supplied; when absent or not a finite `≥ 0` number the mapper emits
   * {@link ELAPSED_UNMEASURED} (INV-12).
   */
  readonly elapsedMs?: number;

  /**
   * Whether the failing call went through an external / off-chain gateway (CCIP-Read, Namechain L2
   * path — SF-5). Biases an otherwise-ambiguous transport failure toward `EXTERNAL_GATEWAY_ERROR`
   * and resolves the timeout-vs-gateway precedence: `true` dominates a bare timeout (INV-10).
   */
  readonly viaGateway?: boolean;
}

// ---------------------------------------------------------------------------
// Typed constructors — the non-throw control paths (SF-1 Design § Typed constructors)
// ---------------------------------------------------------------------------
//
// viem returns `null` for a structurally-successful lookup that found no record — it does NOT
// throw. Those outcomes (NAME_NOT_FOUND, ADDRESS_NOT_FOUND) and the client-side rejections
// (UNSUPPORTED_NAME, UNSUPPORTED_NETWORK when the caller already knows the network is unsupported)
// are therefore built on the caller's normal control flow, not from a caught error. One tiny
// constructor per such code keeps union construction centralized and payload shapes in one place
// (INV-2). There are deliberately NO constructors for RESOLUTION_TIMEOUT / EXTERNAL_GATEWAY_ERROR /
// ADAPTER_ERROR: those three are only ever produced by classifying a caught error, so
// `mapNameResolutionError` is their sole construction site.

/** Forward lookup succeeded structurally but no record exists for this name. */
export const nameNotFound = (
  name: string
): Extract<NameResolutionError, { code: 'NAME_NOT_FOUND' }> => ({
  code: 'NAME_NOT_FOUND',
  name,
});

/** Reverse lookup succeeded structurally but no name maps back to this address. */
export const addressNotFound = (
  address: string
): Extract<NameResolutionError, { code: 'ADDRESS_NOT_FOUND' }> => ({
  code: 'ADDRESS_NOT_FOUND',
  address,
});

/** Input is syntactically not a name in this system (wrong TLD, failed UTS-46, …). */
export const unsupportedName = (
  name: string,
  reason: string
): Extract<NameResolutionError, { code: 'UNSUPPORTED_NAME' }> => ({
  code: 'UNSUPPORTED_NAME',
  name,
  reason: redactSecrets(reason), // INV-16: caller-curated text is assumed log-safe but scrubbed defensively.
});

/** The active network does not support name resolution at all. */
export const unsupportedNetwork = (
  networkId: string
): Extract<NameResolutionError, { code: 'UNSUPPORTED_NETWORK' }> => ({
  code: 'UNSUPPORTED_NETWORK',
  networkId,
});

// ---------------------------------------------------------------------------
// The mapper
// ---------------------------------------------------------------------------

/**
 * Convert a native failure raised by the resolution transport into a typed `NameResolutionError`.
 *
 * **Total over expected failures** (INV-6) — always returns a member of the closed union; never
 * throws for a transport / RPC / gateway / timeout failure. Any native error that cannot be
 * classified maps to `ADAPTER_ERROR` carrying the original value as an opaque `cause` (INV-7), so
 * no failure is silently swallowed and no invented code escapes the union (INV-1).
 *
 * The **one** exception to totality: genuine programmer / lifecycle errors on the closed allowlist
 * (INV-9, currently `RuntimeDisposedError`) are re-thrown unchanged, not classified — masking a
 * use-after-dispose bug as an expected failure code would hide a real defect. This is the
 * type-level guarantee behind UIKit INV-8.
 *
 * Pure and side-effect-free (INV-13/INV-14): reads no clock, performs no I/O, logs nothing, and
 * never mutates the caught error.
 *
 * @param error   - The caught native value, typed `unknown` (INV-4). viem's thrown values extend
 *                  `BaseError`, but any value is accepted; non-Error values fall through to
 *                  `ADAPTER_ERROR`.
 * @param context - Payload details the error itself cannot supply. Optional.
 * @returns A member of the closed seven-code `NameResolutionError` union.
 * @throws {RuntimeDisposedError} when `error` is (or wraps) a lifecycle/programmer error on the
 *   allowlist (INV-9). This is the sole `throw` in the module.
 */
export function mapNameResolutionError(
  error: unknown,
  context: NameResolutionErrorContext = {}
): NameResolutionError {
  const chain = collectErrorChain(error);

  // Row 0 (INV-9): re-throw genuine programmer/lifecycle errors — checked FIRST, before any
  // classification, so a disposed-capability error can never be mis-mapped to ADAPTER_ERROR.
  if (chainMatches(chain, PROGRAMMER_ERROR_CLASSES, PROGRAMMER_ERROR_NAMES)) {
    throw error;
  }

  const timedOut = chainMatches(chain, [TimeoutError], TIMEOUT_ERROR_NAMES);
  const offchainFailure = chainMatches(chain, [], OFFCHAIN_GATEWAY_ERROR_NAMES);
  const httpFailure = chainMatches(chain, [HttpRequestError], HTTP_REQUEST_ERROR_NAMES);
  // D3: the UR offchain-gateway failure surfaces as a decoded revert `errorName` (`HttpError`), not a
  // thrown class — reach it via the shared revert-info walk. Only meaningful for viem `BaseError`s.
  const decodedRevertName =
    error instanceof BaseError ? extractRevertInfo(error).errorName : undefined;
  const gatewayRevert =
    decodedRevertName !== undefined && ENS_GATEWAY_REVERT_ERROR_NAMES.has(decodedRevertName);

  // Row 1 (INV-10): gateway context DOMINATES a timeout/transport failure. A CCIP-Read call that
  // times out is both a timeout and a gateway failure; `viaGateway` resolves the ambiguity so a v2
  // gateway failure is never reported as a canonical RESOLUTION_TIMEOUT (spec Edge Case).
  if (
    context.viaGateway === true &&
    (timedOut || offchainFailure || httpFailure || gatewayRevert)
  ) {
    return externalGatewayError(error);
  }

  // Row 2 (INV-12): a bare RPC timeout with no gateway context.
  if (timedOut) {
    return resolutionTimeout(context.elapsedMs);
  }

  // Row 3 (INV-11): CCIP-Read / offchain-lookup transport failures — the `OffchainLookup*` classes and
  // the UR `HttpError` gateway revert (D3) — always map to gateway, never conflated with a not-found.
  // (A plain HttpRequestError WITHOUT `viaGateway` is not classified here; it falls through to
  // ADAPTER_ERROR, since a bare RPC HTTP failure is not necessarily a gateway problem.)
  if (offchainFailure || gatewayRevert) {
    return externalGatewayError(error);
  }

  // Row 4 (SF-2 Research G2 drift): the chain exposes no ENS Universal Resolver.
  if (chainMatches(chain, [ChainDoesNotSupportContract], CHAIN_UNSUPPORTED_ERROR_NAMES)) {
    return unsupportedNetwork(context.networkId ?? '');
  }

  // The resolution-*semantic* ENS reverts (ResolverNotFound / ResolverNotContract /
  // UnsupportedResolverProfile) and the UTS-46 `normalize()` throw are NOT mapper rows: SF-2 Design
  // finalized them as caller control-path outcomes, pre-classified via the typed constructors above
  // (`unsupportedNetwork`, `unsupportedName`, `nameNotFound`) — which is what preserves INV-11 (the
  // mapper never fabricates a not-found, and never needs the `name`/`address` it does not carry).
  // (The gateway-*transport* revert `HttpError` IS a mapper row — handled at Row 3 above.) A
  // resolver-semantic revert that nonetheless reaches this mapper is unclassified transport noise and
  // falls to the ADAPTER_ERROR fallback below (safe: totality + `cause` preserved).

  // Row 6 (INV-1 / INV-6 / INV-7): total fallback — never invent a code, preserve the cause by
  // reference, redact credential-bearing substrings from the renderable message (INV-16).
  return {
    code: 'ADAPTER_ERROR',
    message: redactSecrets(safeMessage(error)),
    cause: error,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers — union construction for the throw-derived codes
// ---------------------------------------------------------------------------

/** Build `EXTERNAL_GATEWAY_ERROR` from a caught error, with a redacted `detail` (INV-16). */
function externalGatewayError(
  error: unknown
): Extract<NameResolutionError, { code: 'EXTERNAL_GATEWAY_ERROR' }> {
  return { code: 'EXTERNAL_GATEWAY_ERROR', detail: redactSecrets(safeMessage(error)) };
}

/** Build `RESOLUTION_TIMEOUT`, normalizing `elapsedMs` to a finite `≥ 0` value or the sentinel (INV-12). */
function resolutionTimeout(
  elapsedMs: number | undefined
): Extract<NameResolutionError, { code: 'RESOLUTION_TIMEOUT' }> {
  const finite = typeof elapsedMs === 'number' && Number.isFinite(elapsedMs) && elapsedMs >= 0;
  return { code: 'RESOLUTION_TIMEOUT', elapsedMs: finite ? elapsedMs : ELAPSED_UNMEASURED };
}

// ---------------------------------------------------------------------------
// Internal helpers — classification primitives
// ---------------------------------------------------------------------------

/**
 * Collect the error `cause` chain, bounded and cycle-safe (INV-15). Terminates on a cyclic chain
 * (via a visited set of objects) and on an adversarially deep chain (via {@link
 * MAX_CAUSE_CHAIN_DEPTH}), so classification never infinite-loops or blows the stack. Accepts any
 * value (INV-4): primitives and `null`/`undefined` yield a one- or zero-element chain. Read-only —
 * the caught error is never mutated (INV-14).
 */
function collectErrorChain(value: unknown): unknown[] {
  const chain: unknown[] = [];
  const seen = new Set<object>();
  let current: unknown = value;
  while (current != null && chain.length < MAX_CAUSE_CHAIN_DEPTH) {
    if (typeof current === 'object') {
      if (seen.has(current)) break;
      seen.add(current);
    }
    chain.push(current);
    current = readCause(current);
  }
  return chain;
}

/** Read a `.cause` reference without mutating or asserting a type (INV-14). */
function readCause(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || !('cause' in value)) return undefined;
  return (value as { readonly cause?: unknown }).cause;
}

/** Read a `.name` string structurally — works cross-realm where `instanceof` does not. */
function nameOf(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const name = (value as { readonly name?: unknown }).name;
  return typeof name === 'string' ? name : undefined;
}

/**
 * Whether any error in the chain matches the given classes (`instanceof`-primary) or `.name`s
 * (needle fallback). The fallback backstops duplicate-copy / foreign-realm errors where
 * `instanceof` fails despite an identical class name.
 */
function chainMatches(
  chain: readonly unknown[],
  classes: ReadonlyArray<abstract new (...args: never[]) => object>,
  names: ReadonlySet<string>
): boolean {
  return chain.some((error) => {
    if (classes.some((ctor) => error instanceof ctor)) return true;
    const name = nameOf(error);
    return name !== undefined && names.has(name);
  });
}

// ---------------------------------------------------------------------------
// Internal helpers — safe free-text extraction (INV-5) and redaction (INV-16)
// ---------------------------------------------------------------------------

/**
 * Extract a non-empty display message from any value without ever throwing (INV-5). Uses
 * `error.message` when it is a non-empty string, else `String(value)`, guarding property access and
 * stringification against a hostile/broken `message`/`toString` getter; falls back to {@link
 * FALLBACK_MESSAGE} if stringification throws or yields empty. Does not touch `error.cause`.
 */
function safeMessage(value: unknown): string {
  try {
    if (value instanceof BaseError && value.message.length > 0) return value.message;
    if (typeof value === 'object' && value !== null) {
      const message = (value as { readonly message?: unknown }).message;
      if (typeof message === 'string' && message.length > 0) return message;
    }
    if (typeof value === 'string' && value.length > 0) return value;
    const stringified = String(value);
    return stringified.length > 0 ? stringified : FALLBACK_MESSAGE;
  } catch {
    return FALLBACK_MESSAGE;
  }
}

/**
 * Strip credential-bearing substrings from a display string before it lands on a renderable field
 * (INV-16): URL userinfo and provider-API-key-in-URL patterns, URL-scoped per the Invariants-stage
 * default. Pure over strings — the regexes never throw. Applied to `ADAPTER_ERROR.message`,
 * `EXTERNAL_GATEWAY_ERROR.detail`, and (defensively) `UNSUPPORTED_NAME.reason`; NEVER to
 * `ADAPTER_ERROR.cause`, which retains the full original (INV-17).
 */
function redactSecrets(text: string): string {
  let redacted = text;
  for (const [pattern, replacement] of REDACTION_PATTERNS) {
    redacted = redacted.replace(pattern, replacement);
  }
  return redacted;
}
