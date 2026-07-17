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
 * The forward-path native-error → code table (Design D-E) was validated against **viem@2.44.x** (the
 * workspace lockfile pin); the declared peer/dependency floor remains `^2.35.0` (ENS v2 readiness —
 * see `.changeset/ens-v2-viem-floor.md`). The UR revert `errorName`s (`ResolverNotFound`,
 * `ResolverNotContract`, `ResolverError`, `UnsupportedResolverProfile`) are reached via
 * `extractRevertInfo(err).errorName` and pre-classified here; a viem major bump requires
 * re-validating this table and SF-1's mapper. Unknown `errorName`s degrade safely via SF-1's
 * `ADAPTER_ERROR` fallback (so older floors in the `^2.35` range remain total).
 *
 * @module name-resolution/service
 */

import {
  BaseError,
  ccipRequest,
  createPublicClient,
  custom,
  getAddress,
  type Address,
  type CcipRequestParameters,
  type Hex,
  type PublicClient,
} from 'viem';
import { mainnet } from 'viem/chains';

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
import {
  baseEnsProvenance,
  boundReverseProvenance,
  composeNetworkFallbackProvenance,
  MAINNET_NETWORK_ID,
} from './provenance';

/** Which reverse client / provenance policy a single `attemptReverse` executes (002 SF-1). */
type ReverseAttemptKind = 'bound' | 'l1';

/**
 * Outcome of one reverse I/O attempt. Distinguishes definitive empty (miss-fallback eligible on
 * bound) from typed transport failure (never eligible — INV-9).
 */
type ReverseAttemptOutcome =
  | { readonly kind: 'success'; readonly value: ResolvedName }
  | { readonly kind: 'empty' }
  | { readonly kind: 'failure'; readonly result: ResolutionResult<ResolvedName> };

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
   * Frozen at construct time — only `=== true` enables miss-fallback (INV-2 / 003 SF-1).
   */
  private readonly enableMainnetL1MissFallback: boolean;

  /**
   * @param networkConfig - The bound (read-only) network config.
   * @param publicClient  - The bound per-network viem client (D-A). Borrowed, never disposed (INV-21).
   * @param ensL1Client   - SF-5, OPTIONAL. Mainnet client for non-UR forward chain-scoped resolution
   *   and for L1 miss-fallback when {@link enableMainnetL1MissFallback} is explicitly `true`.
   * @param enableMainnetL1MissFallback - 003 SF-1 opt-in; normalized to strict `true` only (INV-2).
   */
  constructor(
    private readonly networkConfig: TypedEvmNetworkConfig,
    private readonly publicClient: PublicClient,
    private readonly ensL1Client?: PublicClient,
    enableMainnetL1MissFallback?: boolean
  ) {
    this.enableMainnetL1MissFallback = enableMainnetL1MissFallback === true; // INV-2, INV-9
  }

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
   * 6. 003 SF-4 (UR bound only): bound `NAME_NOT_FOUND` + opt-in ON → single L1 `resolveVia` +
   *    SF-2 fallback triplet on success; bound gateway/`UNSUPPORTED_NAME` → terminal (INV-10).
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
    //
    // DESIGN RULING — the ladder is BOUND-UR-AUTHORITATIVE (do not re-litigate as a miss-fallback):
    //   (1a) a bound chain that carries its OWN Universal Resolver wins for its namespace, full stop.
    //   (1b) the mainnet-L1 `ensL1Client` path is the CANONICAL path ONLY for chains WITHOUT their own
    //        UR (L2s resolved via CCIP-Read + chain-scoped `coinType`) — it is NOT a fallback for a
    //        name that (1a) failed to find.
    // Consequence (default OFF): a testnet/chain with its own UR returns NAME_NOT_FOUND for a
    // mainnet-only name — it never silently falls back to mainnet L1 unless the integrator opted in
    // via `enableMainnetL1MissFallback: true` (003 SF-1 / SF-4 implements the forward ladder).
    const selectedBoundBranch = this.supportsEns();
    let client: PublicClient;
    let coinType: bigint;
    if (selectedBoundBranch) {
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
    const result = await this.resolveVia(client, coinType, name, normalized);

    // 003 SF-4: UR-bound definitive NAME_NOT_FOUND → single L1 resolveVia when opted in (INV-1).
    if (
      selectedBoundBranch &&
      this.isForwardBoundMissEligibleForL1(result) &&
      this.mayConsultL1ForMissFallback()
    ) {
      const l1Result = await this.resolveVia(this.ensL1Client!, ETH_COIN_TYPE, name, normalized);
      if (!l1Result.ok) {
        return l1Result; // INV-12 — L1 terminal; no bound retry
      }
      return {
        ok: true,
        value: {
          ...l1Result.value,
          provenance: composeNetworkFallbackProvenance(l1Result.value.provenance, {
            queriedOnNetworkId: this.networkConfig.id,
            resolvedOnNetworkId: MAINNET_NETWORK_ID,
          }),
        },
      };
    }

    return result;
  }

  /**
   * True iff the bound-tier forward attempt is a definitive empty / no-record miss eligible for L1
   * consult — NOT transport failure, NOT UNSUPPORTED_NAME (SF-4 INV-11 / D-S4-1).
   */
  private isForwardBoundMissEligibleForL1(result: ResolutionResult<ResolvedAddress>): boolean {
    return !result.ok && result.error.code === 'NAME_NOT_FOUND';
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
      //
      // coinType policy (L1 + M1):
      //   - Unscoped mainnet (`coinType === 60`): OMIT explicit `coinType` so viem uses its default
      //     `getEnsAddress` path. That path returns an EIP-55 checksummed address AND is legacy
      //     `addr(bytes32)`-compatible — forcing `coinType: 60n` would select the ENSIP-9 multicoin
      //     `addr(bytes32,uint256)` profile and make legacy-only resolvers revert
      //     `UnsupportedResolverProfile` → `UNSUPPORTED_NAME`.
      //   - Chain-scoped (`coinType !== 60`): pass `coinType` explicitly (ENS v2 L1 cross-chain).
      //     That path returns raw decoded multicoin bytes — validated + EIP-55-checksummed below.
      const address = await callClient.getEnsAddress({
        name: normalized,
        ...(coinType !== ETH_COIN_TYPE ? { coinType } : {}),
        strict: true,
      });
      if (address === null) {
        // Structural success, empty record — the non-throw no-record path (INV-2, case 1).
        return { ok: false, error: nameNotFound(name) };
      }
      // Fund-safety (M1): an ENSIP-9 multicoin record is arbitrary user-set bytes. Never surface
      // `ok: true` with a non-EVM / malformed address — fold to NAME_NOT_FOUND (no usable addr).
      if (!isValidEvmAddress(address)) {
        return { ok: false, error: nameNotFound(name) };
      }
      // EIP-55 checksum via viem `getAddress` — matches the default (no-coinType) resolver path and
      // every other viem address surface. Idempotent when the default path already checksummed.
      const checksummed = getAddress(address);
      // Success: echo the caller's ORIGINAL input as `name` (not the normalized form), and attach a
      // fresh EnsProvenance built from the observed facts (INV-2/INV-3). A `null` / invalid address
      // can never reach here — handled above — so `value.address` is never a coerced/zero placeholder.
      return {
        ok: true,
        value: {
          name,
          address: checksummed,
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
        case 'ResolverError':
          // Name has no usable resolver / resolver returned a null-equivalent error on an
          // ENS-supporting network → no record (INV-15, NAME_NOT_FOUND). `ResolverError` is in
          // viem's `isNullUniversalResolverError` set alongside the NotFound/NotContract variants.
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
   * Reverse resolution: address → name (002 SF-1 / 003 SF-3 Option B miss-fallback). Returns a
   * discriminated {@link ResolutionResult}; **never throws for an expected failure** (INV-7). The
   * sole sanctioned throw is `RuntimeDisposedError`, raised by the factory's guard proxy *before*
   * this body runs.
   *
   * 003 SF-3 ladder (inherits 002 Option B; L1 tiers gated by SF-1 `mayConsultL1ForMissFallback()`):
   *
   * 0. use-after-dispose → `RuntimeDisposedError` (guard proxy)
   * 1. malformed address → `ADDRESS_NOT_FOUND` (sync, before I/O)
   * 2. `supportsEns()` → bound `attemptReverse` first
   *      - success → bound provenance per D-R7; stop (no L1)
   *      - failure → typed error; stop (**no** miss-fallback — INV-9)
   *      - empty + `mayConsultL1ForMissFallback()` → L1 `attemptReverse` (003 SF-1)
   *      - empty + gate false → `ADDRESS_NOT_FOUND`
   * 3. else `mayConsultL1ForMissFallback()` → L1 direct (non-UR)
   * 4. else → `UNSUPPORTED_NETWORK` (sync, before I/O)
   *
   * L1 success after bound-empty miss: `buildEnsProvenance` + SF-2 fallback triplet
   * (`precededByBoundMiss`). Non-UR direct L1: `buildEnsProvenance` only (001-1b parity).
   * `scopedToNetworkId` absent on all L1 hits (002 D-R7). Opt-in OFF: bound-empty / non-UR
   * terminate without L1 (SF-1 SC-001).
   *
   * Bound and L1 attempts use `strict: true`, Approach A suppress-on-mismatch, observing clients
   * for truthful `viaGateway`, and selected-client avatar affinity (INV-18).
   *
   * @throws {RuntimeDisposedError} on use-after-dispose (guard proxy, before this body) — the sole throw.
   */
  async resolveAddress(address: string): Promise<ResolutionResult<ResolvedName>> {
    // (1) Address-shape gate (D-R1) — malformed input maps to ADDRESS_NOT_FOUND, never-throw, before
    // any I/O (INV-8/INV-12/INV-21). The input `address` is echoed on the error (INV-23).
    if (!isValidEvmAddress(address)) {
      return { ok: false, error: addressNotFound(address) };
    }

    // (2) UR-carrying bound chain — bound reverse first (INV-6).
    if (this.supportsEns()) {
      const boundOutcome = await this.attemptReverse(this.publicClient, address, 'bound');
      if (boundOutcome.kind === 'success') {
        return { ok: true, value: boundOutcome.value };
      }
      // INV-9 KEY: bound gateway/transport/timeout failure must NOT fall through to L1.
      if (boundOutcome.kind === 'failure') {
        return boundOutcome.result;
      }
      // Definitive bound empty — L1 miss-fallback only when integrator opted in (INV-5 / INV-6).
      if (this.mayConsultL1ForMissFallback()) {
        return this.finishL1Attempt(address, true);
      }
      return { ok: false, error: addressNotFound(address) };
    }

    // (3) Non-UR + opted-in L1 → L1 direct (INV-7) — canonical path, not bound miss-fallback.
    if (this.mayConsultL1ForMissFallback()) {
      return this.finishL1Attempt(address, false);
    }

    // (4) No UR and no L1 client — pre-I/O unsupported (INV-21).
    return { ok: false, error: unsupportedNetwork(this.networkConfig.id) };
  }

  /**
   * Terminal handling for an L1 reverse attempt (direct or miss-fallback). No further client exists
   * after L1 — empty and failure both terminate here (INV-10).
   *
   * @param precededByBoundMiss - When true, bound UR tier returned definitive empty before this L1
   *   consult — SF-2 triplet is emitted on success. False for non-UR direct L1 (001-1b parity).
   */
  private async finishL1Attempt(
    address: string,
    precededByBoundMiss: boolean
  ): Promise<ResolutionResult<ResolvedName>> {
    const l1Outcome = await this.attemptReverse(
      this.ensL1Client!,
      address,
      'l1',
      precededByBoundMiss
    );
    if (l1Outcome.kind === 'success') {
      return { ok: true, value: l1Outcome.value };
    }
    if (l1Outcome.kind === 'failure') {
      return l1Outcome.result;
    }
    return { ok: false, error: addressNotFound(address) };
  }

  /**
   * One reverse I/O against `client`: observing wrapper, strict `getEnsName`, Approach A catch table,
   * avatar on success via the **same** client (D-R8 / INV-18). Returns success | empty | failure so
   * the ladder can distinguish miss-fallback eligibility from typed transport failure (INV-9).
   */
  private async attemptReverse(
    client: PublicClient,
    address: string,
    kind: ReverseAttemptKind,
    precededByBoundMiss = false
  ): Promise<ReverseAttemptOutcome> {
    let sawOffchain = false;
    const callClient = deriveObservingClient(client, () => {
      sawOffchain = true;
    });

    const started = performance.now();
    let name: string | null;
    try {
      // INV-13 / INV-27: `strict: true` mandatory; L1 omits `coinType` (default 60 — mainnet primary).
      name = await callClient.getEnsName({ address: address as Address, strict: true });
    } catch (error) {
      // INV-8: Approach A + resolver-semantic reverts → empty (miss-fallback-eligible on bound).
      const errorName = error instanceof BaseError ? extractRevertInfo(error).errorName : undefined;
      switch (errorName) {
        case 'ReverseAddressMismatch':
        case 'ResolverNotFound':
        case 'ResolverNotContract':
        case 'ResolverError':
        case 'UnsupportedResolverProfile':
          return { kind: 'empty' };
        default:
          // INV-9 / INV-14: gateway / timeout / transport → typed failure; observed `viaGateway`.
          return {
            kind: 'failure',
            result: {
              ok: false,
              error: mapNameResolutionError(error, {
                networkId: this.networkConfig.id,
                elapsedMs: performance.now() - started,
                viaGateway: sawOffchain,
              }),
            },
          };
      }
    }

    if (name === null) {
      return { kind: 'empty' };
    }

    const avatarUrl = await this.tryGetAvatar(client, name);
    const baseProvenance =
      kind === 'l1'
        ? buildEnsProvenance({
            external: sawOffchain,
            coinType: ETH_COIN_TYPE,
            networkId: this.networkConfig.id,
          })
        : this.isMainnetBound()
          ? baseEnsProvenance()
          : boundReverseProvenance(this.networkConfig.id);
    // SF-3 INV-3 / D-S3-1: SF-2 triplet only when L1 follows a real bound-empty miss
    // (`precededByBoundMiss`). Non-UR direct L1 omits triplet (forward 001-1b parity).
    // `scopedToNetworkId` stays absent on all L1 hits (INV-5 / D-R7).
    const provenance =
      kind === 'l1' && precededByBoundMiss
        ? composeNetworkFallbackProvenance(baseProvenance, {
            queriedOnNetworkId: this.networkConfig.id,
            resolvedOnNetworkId: MAINNET_NETWORK_ID,
          })
        : baseProvenance;

    return {
      kind: 'success',
      value: {
        address,
        name,
        forwardVerified: true,
        ...(avatarUrl !== undefined ? { avatarUrl } : {}),
        provenance,
      },
    };
  }

  /**
   * Authoritative miss-fallback eligibility for both directions (003 SF-1 INV-5).
   * L1 consult is permitted only when opt-in is strictly true, L1 client is wired, and the adapter
   * is not mainnet-bound (INV-24).
   */
  private mayConsultL1ForMissFallback(): boolean {
    return (
      this.enableMainnetL1MissFallback === true && // INV-2
      this.ensL1Client !== undefined && // INV-3
      !this.isMainnetBound() // INV-24
    );
  }

  /** True when the bound chain is Ethereum mainnet — drives miss-fallback fence and D-R7 scope (INV-22). */
  private isMainnetBound(): boolean {
    return this.networkConfig.chainId === mainnet.id;
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
  private async tryGetAvatar(client: PublicClient, name: string): Promise<string | undefined> {
    try {
      // Normalize first (L2): `getEnsName` may return a mixed-case / un-normalized claim; viem's
      // `getEnsAvatar` expects an ENSIP-15-normalized name and otherwise silently yields null.
      // A normalize throw is absorbed by the catch → undefined (best-effort, INV-17).
      const avatar = await client.getEnsAvatar({
        name: normalizeName(name),
        strict: true,
      });
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
export interface CreateEvmNameResolutionServiceOptions {
  readonly enableMainnetL1MissFallback?: boolean;
}

export function createEvmNameResolutionService(
  networkConfig: TypedEvmNetworkConfig,
  publicClient: PublicClient,
  ensL1Client?: PublicClient,
  options?: CreateEvmNameResolutionServiceOptions
): EvmNameResolutionService {
  return new EvmNameResolutionService(
    networkConfig,
    publicClient,
    ensL1Client,
    options?.enableMainnetL1MissFallback
  );
}
