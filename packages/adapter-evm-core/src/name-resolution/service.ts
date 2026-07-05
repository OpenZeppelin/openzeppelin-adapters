/**
 * EVM name-resolution service — forward path (SF-2).
 *
 * Implements the `NameResolutionCapability` forward surface (`isValidName` + `resolveName`), sans the
 * `RuntimeCapability` mixin the factory adds via `guardRuntimeCapability`. A thin service over viem's
 * `getEnsAddress` (Universal Resolver — ENSIP-10 wildcard + CCIP-Read built in); it constructs no
 * on-chain reader / ABI of its own (Design: "viem's `getEnsAddress` IS the on-chain reader").
 *
 * ## The load-bearing choices
 *
 * - **`strict: true`** on the one `getEnsAddress` call (INV-7, G1 — fund safety): distinct failure
 *   classes surface as typed reverts instead of collapsing into `null`. Under `strict: true` only a
 *   genuine empty-record decode returns `null`; every resolver/gateway/transport failure throws.
 * - **Never throw for expected failures** (INV-6): every anticipated outcome resolves to a
 *   discriminated `{ ok: false, error }`. The sole sanctioned throw is `RuntimeDisposedError`, raised
 *   by the factory's guard proxy *before* this body runs — so it is never observed here.
 * - **Deterministic, total, closed classification** (INV-10/INV-12): a fixed precedence — sync
 *   support-gate → shape gate → normalize → the network call → an ordered `catch` — maps every
 *   outcome onto exactly one member of the closed seven-code `NameResolutionError` union. SF-2 owns
 *   the not-found / unsupported-name / unsupported-network codes on its control path (Part A);
 *   everything else is delegated to SF-1's total `mapNameResolutionError` (Part B).
 *
 * The forward-path native-error → code table (Design D-E) is pinned to **viem@2.44.4**: the UR revert
 * `errorName`s (`ResolverNotFound`, `ResolverNotContract`, `UnsupportedResolverProfile`) are reached
 * via `extractRevertInfo(err).errorName` and pre-classified here; a viem major bump requires
 * re-validating this table and SF-1's mapper.
 *
 * @module name-resolution/service
 */

import {
  BaseError,
  ccipRequest,
  createPublicClient,
  custom,
  type Address,
  type CcipRequestParameters,
  type Hex,
  type PublicClient,
} from 'viem';

import type { ResolutionResult, ResolvedAddress, ResolvedName } from '@openzeppelin/ui-types';
import { logger } from '@openzeppelin/ui-utils';

import { extractRevertInfo } from '../shared/revert-info';
import type { TypedEvmNetworkConfig } from '../types';
import { isValidEvmAddress } from '../utils/validation';
import { buildEnsProvenance, deriveCoinType } from './ens-provenance';
import {
  addressNotFound,
  mapNameResolutionError,
  nameNotFound,
  unsupportedName,
  unsupportedNetwork,
} from './error-mapping';
import { isValidName as isValidEnsName, normalizeName } from './name-validation';
import { baseEnsProvenance } from './provenance';

/** The ENSIP-9 coinType for ETH / Ethereum mainnet — a mainnet-bound (unscoped) resolution (D-V1). */
const ETH_COIN_TYPE = 60n;

/**
 * Mint a **per-call** observing client that reports whether an `OffchainLookup` (ERC-3668 CCIP-Read)
 * was actually followed during a single resolution (INV-9, D-V5), without mutating the borrowed source
 * client (INV-21) and without opening a new RPC connection (INV-23).
 *
 * The offchain traversal is observed by wrapping the client-level `ccipRead.request` hook: viem's
 * `offchainLookup` reads `client.ccipRead.request` from the client the action runs on, so a client
 * carrying our wrapper — which flips a **call-local** flag then delegates to the source client's own
 * hook (or viem's default {@link ccipRequest}) — sees every real gateway hop and none of another
 * concurrent call's (each call gets its own client + flag, so `sawOffchain` never cross-contaminates —
 * INV-18).
 *
 * viem pre-binds a client's actions to that client, so overriding `ccipRead` on a shallow clone would
 * be ignored by the source's pre-bound `getEnsAddress`. When the source exposes a reusable transport
 * (`client.request` + `chain` — every real viem client), we therefore build a fresh client over
 * `custom(client)` (which delegates transport requests back to the borrowed client — no new
 * connection, borrowed client untouched) with our `ccipRead` installed. A transport-less client (e.g.
 * a hand-rolled unit-test double that stubs `getEnsAddress` directly and performs no real offchain
 * lookup) is reused as-is with `ccipRead` overridden — there is no gateway hop to observe there.
 */
function deriveObservingClient(client: PublicClient, onOffchain: () => void): PublicClient {
  const request = async (params: CcipRequestParameters): Promise<Hex> => {
    onOffchain();
    const delegate =
      typeof client.ccipRead === 'object' && typeof client.ccipRead?.request === 'function'
        ? client.ccipRead.request
        : ccipRequest;
    return delegate(params);
  };
  const ccipRead = { request } as const;

  if (typeof client.request === 'function' && client.chain) {
    return createPublicClient({
      chain: client.chain,
      // `retryCount: 0` makes the borrowed client the SOLE retry owner (D-A / SF-5 INV-23): viem's
      // `custom(provider)` adds its own retry layer (default `retryCount: 3`) around the borrowed
      // `client.request`, which already retries — double-retrying every retryable RPC/gateway error
      // (up to 3×N hops), inflating the `performance.now` elapsedMs behind RESOLUTION_TIMEOUT and
      // overriding the inherited runtime retry/timeout policy. `retryDelay: 0` drops this layer's
      // backoff too, so no delay is imposed on top of the borrowed transport's own policy.
      transport: custom(client, { retryCount: 0, retryDelay: 0 }),
      ccipRead,
    }) as unknown as PublicClient;
  }
  return Object.assign(Object.create(client) as PublicClient, { ccipRead });
}

const LOG_SYSTEM = 'EvmNameResolutionService';

/**
 * Curate a user-safe `UNSUPPORTED_NAME.reason` from a normalization throw (Design D-D).
 *
 * The `normalize` failure describes the *name* (a disallowed character, a bad label), never the
 * transport, so it carries no credential; the {@link unsupportedName} constructor additionally
 * redacts it defensively (SF-1 INV-16 / INV-19). We surface the underlying message when present to
 * keep the reason actionable, and never concatenate any error other than the normalize throw.
 */
function describeNormalizeFailure(error: unknown): string {
  const base = 'name failed ENS normalization';
  return error instanceof Error && error.message.length > 0 ? `${base}: ${error.message}` : base;
}

/**
 * EVM implementation of the `NameResolutionCapability` forward surface. Holds only the injected viem
 * client and the bound (read-only) network config — no resolution state, cache, or memo (INV-13):
 * repeated calls converge and concurrent calls never interfere.
 */
export class EvmNameResolutionService {
  /**
   * @param networkConfig - The bound (read-only) network config.
   * @param publicClient  - The bound per-network viem client (D-A). Borrowed, never disposed (INV-21).
   * @param ensL1Client   - SF-5, OPTIONAL. A dedicated **mainnet** viem client, used ONLY when the
   *   bound network has no Universal Resolver, to resolve chain-scoped to the bound network via L1
   *   (`coinType = toCoinType(boundChainId)`, D-V1). Also borrowed, never disposed. When absent, an
   *   L2-bound `resolveName` returns `UNSUPPORTED_NETWORK` exactly as SF-2 does today (D-B preserved).
   */
  constructor(
    private readonly networkConfig: TypedEvmNetworkConfig,
    private readonly publicClient: PublicClient,
    private readonly ensL1Client?: PublicClient
  ) {}

  /**
   * Synchronous ENSIP-15 shape check (INV-3/INV-4). No I/O; delegates to the client-free
   * {@link isValidEnsName} helper so consumers and `resolveName` share one gate.
   */
  isValidName(name: string): boolean {
    return isValidEnsName(name);
  }

  /**
   * Forward resolution: name → address. Returns a discriminated {@link ResolutionResult}; **never
   * throws for an expected failure** (INV-1/INV-11). Fixed classification precedence (INV-17):
   *
   * 0. use-after-dispose → `RuntimeDisposedError` (raised by the guard proxy, before this body)
   * 1. CLIENT + coinType selection (sync, before any I/O — INV-16/INV-17):
   *      a. bound chain carries a Universal Resolver → bound client, `coinType = 60` (mainnet-bound)
   *      b. else an `ensL1Client` is wired → L1 client, `coinType = toCoinType(boundChainId)`
   *         (chain-scoped); a non-ENSIP-11 chainId throws → `UNSUPPORTED_NETWORK` (INV-16)
   *      c. else → `UNSUPPORTED_NETWORK` (D-B preserved — SF-2 parity when no L1 client is wired)
   * 2. shape gate fails → `UNSUPPORTED_NAME`
   * 3. normalize throws → `UNSUPPORTED_NAME`  (D-D backstop)
   * 4–5. delegated to {@link resolveVia}: the one `getEnsAddress` call + ordered catch.
   *
   * The selection ladder runs **before** the shape/normalize gates so an unsupported network wins
   * over a malformed name (SF-2 INV-12 precedence, preserved verbatim: a bad name on an unsupported
   * network is `UNSUPPORTED_NETWORK`, not `UNSUPPORTED_NAME`). Gates 1–3 all run before any network
   * round-trip (INV-22).
   */
  async resolveName(name: string): Promise<ResolutionResult<ResolvedAddress>> {
    // (1) Client + coinType selection (D-V1/D-V2, INV-17) — sync, before any I/O. First match wins.
    // The bound branch keeps mainnet-bound wiring semantics intact (INV-17 branch 1); the L1 branch
    // is reached ONLY when the bound network has no UR, so it never redundantly hops L1 for a
    // mainnet-bound resolve.
    let client: PublicClient;
    let coinType: bigint;
    if (this.supportsEns()) {
      client = this.publicClient; // bound client carries a Universal Resolver (mainnet-bound)
      coinType = ETH_COIN_TYPE; // ETH / mainnet — unscoped
    } else if (this.ensL1Client) {
      // deriveCoinType (viem `toCoinType`) throws `EnsInvalidChainIdError` for a non-EVM / out-of-range
      // chainId; contain it synchronously → UNSUPPORTED_NETWORK, before any I/O (INV-11/INV-16).
      try {
        coinType = deriveCoinType(this.networkConfig.chainId);
      } catch {
        return { ok: false, error: unsupportedNetwork(this.networkConfig.id) };
      }
      client = this.ensL1Client; // resolve chain-scoped via L1
    } else {
      // No UR and no L1 client wired → the D-B fallback, unchanged from SF-2.
      return { ok: false, error: unsupportedNetwork(this.networkConfig.id) };
    }

    // (2) Shape gate (INV-11) — deterministic, no I/O.
    if (!isValidEnsName(name)) {
      return { ok: false, error: unsupportedName(name, 'not a well-formed ENS name') };
    }

    // (3) Normalize up-front (D-D) — a throw here maps straight to UNSUPPORTED_NAME via the
    // constructor, off the mapper's fuzzy needle path. `isValidName` already passed, so this is the
    // rare deep-normalization backstop.
    let normalized: string;
    try {
      normalized = normalizeName(name);
    } catch (error) {
      return { ok: false, error: unsupportedName(name, describeNormalizeFailure(error)) };
    }

    // (4–5) The unified success routine — same for both client selections (INV-3).
    return this.resolveVia(client, coinType, name, normalized);
  }

  /**
   * The shared forward success routine, run identically for both client selections (INV-1/INV-3).
   * Performs the **one** `getEnsAddress` call under `strict: true` (INV-12) on a per-call observing
   * client (INV-9/INV-18), builds an {@link EnsProvenance} on success from the observed `external`
   * (INV-3), and classifies a caught failure through the same ordered catch as SF-2 — now feeding the
   * **observed** `sawOffchain` as `viaGateway` (INV-13) so a gateway failure on either path dominates
   * to `EXTERNAL_GATEWAY_ERROR` and never silently falls back (INV-14).
   */
  private async resolveVia(
    client: PublicClient,
    coinType: bigint,
    name: string,
    normalized: string
  ): Promise<ResolutionResult<ResolvedAddress>> {
    // Per-call observation of offchain traversal — a call-local flag captured by a per-call client's
    // ccipRead hook, so concurrent resolves never cross-contaminate `external` (INV-9/INV-18, D-V5).
    let sawOffchain = false;
    const callClient = deriveObservingClient(client, () => {
      sawOffchain = true;
    });

    // `elapsedMs` is measured around the call so a mapped RESOLUTION_TIMEOUT carries a real number,
    // not SF-1's -1 sentinel (INV-23 / SF-1 INV-12 caller obligation).
    const started = performance.now();
    try {
      // The one network call — `strict: true` is mandatory on BOTH branches (INV-12, fund-safety):
      // distinct failure classes surface as typed reverts instead of collapsing into `null`.
      const address = await callClient.getEnsAddress({ name: normalized, coinType, strict: true });
      if (address === null) {
        // Structural success, empty record — the non-throw no-record path (INV-2, case 1).
        return { ok: false, error: nameNotFound(name) };
      }
      // Success: pass the resolved hex through verbatim, echo the caller's ORIGINAL input as `name`
      // (not the normalized form), and attach a fresh EnsProvenance built from the observed facts
      // (INV-2/INV-3). A `null` can never reach here — handled above — so `value.address` is never a
      // coerced/zero placeholder.
      return {
        ok: true,
        value: {
          name,
          address,
          provenance: buildEnsProvenance({
            external: sawOffchain,
            coinType,
            networkId: this.networkConfig.id,
          }),
        },
      };
    } catch (error) {
      // Classify. ENS Universal-Resolver reverts are name-scoped and produced on THIS control path via
      // SF-1's constructors (Part A), preserving SF-1 INV-11 (the mapper never emits a not-found).
      // `error instanceof BaseError` gates the `errorName` read; a foreign-realm/bundled viem that
      // defeats `instanceof` yields `undefined` and degrades SAFELY to the mapper's ADAPTER_ERROR
      // fallback — never a wrong address, never a throw (INV-11/INV-15), just less precise.
      const errorName = error instanceof BaseError ? extractRevertInfo(error).errorName : undefined;
      switch (errorName) {
        case 'ResolverNotFound':
        case 'ResolverNotContract':
          // Name has no usable resolver on an ENS-supporting network → no record (INV-15, NAME_NOT_FOUND).
          return { ok: false, error: nameNotFound(name) };
        case 'UnsupportedResolverProfile':
          // Registered name whose resolver lacks the addr profile — a name-property failure (D-C).
          return {
            ok: false,
            error: unsupportedName(
              name,
              'the ENS resolver for this name does not implement address (addr) resolution'
            ),
          };
        default:
          // Everything else (gateway / offchain / timeout / transport / unclassifiable, incl.
          // non-Error throws) → SF-1's total, codomain-closed mapper (Part B). `viaGateway` is the
          // OBSERVED `sawOffchain` (INV-13), so an ambiguous timeout/HTTP failure after an
          // OffchainLookup dominates to EXTERNAL_GATEWAY_ERROR (SF-1 INV-10) — on both paths.
          return {
            ok: false,
            error: mapNameResolutionError(error, {
              networkId: this.networkConfig.id,
              elapsedMs: performance.now() - started,
              viaGateway: sawOffchain,
            }),
          };
      }
    }
  }

  /**
   * Reverse resolution: address → name (SF-3). Returns a discriminated {@link ResolutionResult};
   * **never throws for an expected failure** (INV-6). The sole sanctioned throw is
   * `RuntimeDisposedError`, raised by the factory's guard proxy *before* this body runs.
   *
   * Delegates the reverse read AND forward-verification to viem's `getEnsName` (`strict: true`,
   * INV-7): the Universal Resolver's `reverseWithGateways` reads the reverse record, forward-resolves
   * the claimed name, and verifies it matches `address` — reverting `ReverseAddressMismatch` on a
   * mismatch. So a returned name is ALWAYS forward-verified ⇒ `forwardVerified: true` (Approach A,
   * D-R3 / INV-3). A mismatch, an empty record, an address-scoped resolver revert, or a malformed
   * address all fold to `ADDRESS_NOT_FOUND` on this control path via SF-1's `addressNotFound`
   * (INV-8/INV-9/INV-11) — the adapter **never surfaces a mismatched name**, and SF-1's mapper stays
   * untouched (no reverse-path mapper row).
   *
   * Fixed classification precedence (INV-12):
   *
   * 0. use-after-dispose → `RuntimeDisposedError` (raised by the guard proxy, before this body)
   * 1. no Universal Resolver on the bound chain → `UNSUPPORTED_NETWORK`  (sync, before any I/O — D-B)
   * 2. malformed address (`!isValidEvmAddress`) → `ADDRESS_NOT_FOUND`     (sync, before any I/O — D-R1)
   * 3. the one `getEnsName` call (`strict: true`): `null` → `ADDRESS_NOT_FOUND` (empty reverse
   *    record), else a name → success `{ forwardVerified: true, avatarUrl?, provenance }`
   * 4. `catch`: `ReverseAddressMismatch` / `ResolverNotFound` / `ResolverNotContract` /
   *    `UnsupportedResolverProfile` → `ADDRESS_NOT_FOUND` (D-R2/D-R4); `default` → SF-1 mapper (Part B)
   *
   * Gates 1–2 run before any network round-trip (INV-16). Avatar (`tryGetAvatar`) runs only after a
   * successful reverse and is failure/latency-isolated — it can only add or omit `avatarUrl`, never
   * fail the result (INV-17).
   *
   * The reverse-path revert `errorName` table is pinned to **viem@2.44.4** (same as `resolveName` /
   * SF-1's mapper): a viem major bump requires re-validating `ReverseAddressMismatch`'s membership in
   * `isNullUniversalResolverError` and the UR revert `errorName` strings.
   *
   * @throws {RuntimeDisposedError} on use-after-dispose (guard proxy, before this body) — the sole throw.
   */
  async resolveAddress(address: string): Promise<ResolutionResult<ResolvedName>> {
    // (1) Network-scope gate (D-B) — sync, before any I/O. Past this point the network is known to
    // support ENS, so every resolver-level revert below is address-scoped, never network-scoped: this
    // is what makes the `ADDRESS_NOT_FOUND` classification in the catch correct (INV-8/INV-16).
    if (!this.supportsEns()) {
      return { ok: false, error: unsupportedNetwork(this.networkConfig.id) };
    }

    // (2) Address-shape gate (D-R1) — malformed input maps to ADDRESS_NOT_FOUND, never-throw, before
    // any I/O (INV-8/INV-12/INV-16). The closed union has no "invalid address" code; ADDRESS_NOT_FOUND
    // is the deliberate never-throw fit, mirroring how the forward path routes a malformed name to
    // UNSUPPORTED_NAME. The input `address` is echoed on the error (INV-19: caller's own data only).
    if (!isValidEvmAddress(address)) {
      return { ok: false, error: addressNotFound(address) };
    }

    // (3) The one reverse network call — `strict: true` is mandatory (INV-7, fund-safety parallel to
    // the forward `getEnsAddress`): distinct failure classes surface as typed reverts instead of
    // collapsing into `null`. `elapsedMs` is measured around it so a mapped RESOLUTION_TIMEOUT carries
    // a real number, not SF-1's -1 sentinel (INV-18 / SF-1 INV-12 caller obligation). Only this call is
    // timed — the avatar hops are deliberately outside the window (INV-17/INV-18).
    const started = performance.now();
    let name: string | null;
    try {
      name = await this.publicClient.getEnsName({ address: address as Address, strict: true });
    } catch (error) {
      // (4) Classify. The mismatch signal and the reverse-node resolver-semantic reverts are all
      // address-scoped "no usable, forward-verified reverse record" outcomes → ADDRESS_NOT_FOUND on
      // THIS control path via SF-1's `addressNotFound` (INV-9, preserving SF-1 INV-11: the mapper never
      // fabricates a not-found). Everything else → SF-1's total mapper (INV-10, Part B). `error
      // instanceof BaseError` gates the `errorName` read; a foreign-realm viem that defeats `instanceof`
      // yields `undefined` and falls to the mapper's ADAPTER_ERROR fallback — safe (never a
      // wrong/coerced name, never a throw, INV-11 still holds), just less precise. Kept symmetric with
      // the forward path's identical gate.
      const errorName = error instanceof BaseError ? extractRevertInfo(error).errorName : undefined;
      switch (errorName) {
        case 'ReverseAddressMismatch': // Approach A: SUPPRESS the mismatched name (D-R2 / INV-11).
        case 'ResolverNotFound':
        case 'ResolverNotContract':
        case 'UnsupportedResolverProfile': // reverse resolver lacks name() → no usable record (D-R4).
          return { ok: false, error: addressNotFound(address) };
        default:
          // Gateway / offchain / timeout / transport / unclassifiable (incl. non-Error throws) → SF-1's
          // total, codomain-closed mapper. `viaGateway: false` on the base v1 path; the genuinely-gateway
          // reverts classify unconditionally, SF-5 owns the explicit CCIP-Read `viaGateway: true` context.
          //
          // KNOWN LIMITATION (Finding 4, deliberate): the reverse path does NOT observe offchain
          // traversal — offchain observation is forward-only by design (SF-5 D-V5; `resolveVia` alone
          // wraps `ccipRead`), so `viaGateway` is unconditionally `false` here. Consequence: an ENSIP-19
          // L2-primary reverse resolution that fails with a gateway *timeout* mis-buckets as
          // RESOLUTION_TIMEOUT instead of EXTERNAL_GATEWAY_ERROR. OffchainLookup-*shaped* reverse
          // failures are unaffected — they classify correctly via SF-1 mapper Row 3 regardless of
          // `viaGateway`; only the timeout-shaped gateway failure loses the gateway precedence (INV-10).
          // Accepted SF-5 scope; see SF-5 06-docs.md § Known Limitations.
          return {
            ok: false,
            error: mapNameResolutionError(error, {
              networkId: this.networkConfig.id,
              elapsedMs: performance.now() - started,
              viaGateway: false,
            }),
          };
      }
    }

    // (5) Empty reverse record — a NON-throw no-record path → ADDRESS_NOT_FOUND (INV-8, never presented
    // as success, so `value.name` is never a coerced/placeholder string — INV-2).
    if (name === null) {
      return { ok: false, error: addressNotFound(address) };
    }

    // (6) Success. The UR already forward-verified the name (D-R3) ⇒ `forwardVerified` is the constant
    // literal `true`, a concrete boolean (INV-3). Avatar is fetched separately, best-effort and isolated
    // (INV-17): it can only ADD `avatarUrl` or leave it absent — it can never fail or throw this result.
    // `address` is echoed as supplied by the caller (no adapter-side re-checksum — D-R6 / INV-2), and
    // `avatarUrl` is spread conditionally so the key is absent when undefined (INV-4).
    const avatarUrl = await this.tryGetAvatar(name);
    return {
      ok: true,
      value: {
        address,
        name,
        forwardVerified: true,
        ...(avatarUrl !== undefined ? { avatarUrl } : {}),
        provenance: baseEnsProvenance(),
      },
    };
  }

  /**
   * No-op teardown beyond a debug log. The injected `PublicClient` is owned by the composing runtime
   * (D-A / INV-15): the capability BORROWS it and never closes its transport — after dispose the same
   * client remains fully usable by the runtime and any capability sharing it. `cleanupStage` is
   * `'general'` (not `'rpc'`) precisely because SF-2 releases no RPC resource of its own.
   */
  dispose(): void {
    logger.debug(LOG_SYSTEM, 'Name-resolution service disposed (borrowed client left intact).');
  }

  /**
   * Whether the bound chain carries an ENS Universal Resolver — mirrors what viem's
   * `getChainContractAddress` reads. Purely synchronous; the pre-I/O basis of D-B (INV-16) that
   * pre-empts viem's own `ChainDoesNotSupportContract`/no-chain throws before the network call.
   */
  private supportsEns(): boolean {
    return Boolean(this.publicClient.chain?.contracts?.ensUniversalResolver?.address);
  }

  /**
   * Best-effort, name-keyed avatar lookup (D-R5). Runs ONLY after a successful reverse and is fully
   * failure- and latency-isolated (INV-17): a SECOND UR round-trip (`getEnsAvatar` → text `avatar`
   * key) plus a possible THIRD hop inside viem's `parseAvatarRecord` (NFT/IPFS/HTTP asset resolution).
   * ANY outcome — gateway error, unreachable asset host, malformed avatar record, timeout — yields
   * `undefined`, never widening the reverse call's never-throw surface (INV-6) and never participating
   * in error classification (INV-8/INV-10). viem itself swallows `parseAvatarRecord` errors → `null`;
   * the `try/catch` here additionally absorbs the UR/text-lookup throws `strict: true` would raise, and
   * `?? undefined` normalizes a `null` so the caller's conditional spread never emits `avatarUrl: null`
   * (INV-4).
   *
   * The returned URL is untrusted, name-owner-controlled content (INV-19): passed through verbatim —
   * the adapter neither fetches nor sanitizes the asset beyond what `getEnsAvatar` already did — and it
   * (and the avatar record) is never logged. viem defaults are used; no custom gateway/host or deadline
   * is hardcoded (INV-18/INV-20). No retry loop — a single bounded `await` (INV-18).
   */
  private async tryGetAvatar(name: string): Promise<string | undefined> {
    try {
      const avatar = await this.publicClient.getEnsAvatar({ name, strict: true });
      return avatar ?? undefined;
    } catch {
      return undefined;
    }
  }
}

/**
 * Factory for {@link EvmNameResolutionService}. Both clients are injected (not constructed here) so the
 * service inherits the runtime's transport / timeout / CCIP-Read config and stays trivially mockable
 * (D-A / INV-25). `ensL1Client` is optional: when omitted the service resolves mainnet-bound exactly
 * as SF-2 does, and an L2-bound resolve returns `UNSUPPORTED_NETWORK` (D-B preserved).
 */
export function createEvmNameResolutionService(
  networkConfig: TypedEvmNetworkConfig,
  publicClient: PublicClient,
  ensL1Client?: PublicClient
): EvmNameResolutionService {
  return new EvmNameResolutionService(networkConfig, publicClient, ensL1Client);
}
