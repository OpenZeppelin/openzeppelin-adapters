/**
 * SF-2 forward-resolution — shared test fixtures.
 *
 * Not a test file (no `.test` suffix, excluded from the vitest glob). Centralizes the mock viem
 * `PublicClient`, a valid EVM `NetworkConfig`, the closed seven-code set, and the native-error
 * factories the SF-2 suite fault-injects. The viem-error factories mirror the ones proven green in
 * the sibling `error-mapping.test.ts` (SF-1) so both suites classify the same fixtures the same way.
 */
import {
  ChainDoesNotSupportContract,
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  HttpRequestError,
  TimeoutError,
  type CcipRequestParameters,
  type Hex,
  type PublicClient,
} from 'viem';
import { vi } from 'vitest';

/** The closed seven-code `NameResolutionError` taxonomy SF-2 must stay within (INV-10). */
export const SEVEN_CODES = [
  'NAME_NOT_FOUND',
  'ADDRESS_NOT_FOUND',
  'UNSUPPORTED_NETWORK',
  'UNSUPPORTED_NAME',
  'RESOLUTION_TIMEOUT',
  'EXTERNAL_GATEWAY_ERROR',
  'ADAPTER_ERROR',
] as const;

export const SEVEN_CODE_SET: ReadonlySet<string> = new Set(SEVEN_CODES);

/** A realistic viem HTTP transport error message embedding a provider API key in the URL (INV-19). */
export const ALCHEMY_KEY = 'SECRETKEY0123456789abcdefABCDEF1'; // 32 chars — exceeds the /vN/ 16-char redaction floor
export const KEYED_URL = `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`;

/** A well-known checksummed mainnet address, used verbatim to assert no coercion/rewrite (INV-2). */
export const VITALIK_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

/** A dummy ENS Universal Resolver address that marks a chain as ENS-supporting (D-B / INV-16). */
const UNIVERSAL_RESOLVER = '0xce01f8eee7E479C928F8919abD53E553a36CeF67';

/**
 * Sepolia — UR-carrying non-mainnet bound chain (002 SF-1 first-class miss-fallback case).
 * `chainId` matches viem Sepolia; `id` is the repo network slug used for D-R7 scope.
 */
export const SEPOLIA_NETWORK_CONFIG = {
  id: 'ethereum-sepolia',
  exportConstName: 'ethereumSepolia',
  name: 'Ethereum Sepolia',
  ecosystem: 'evm',
  network: 'ethereum',
  type: 'testnet',
  isTestnet: true,
  chainId: 11_155_111,
  rpcUrl: 'https://sepolia.example.com',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
} as const;

/** A valid EVM `NetworkConfig` (only `ecosystem: 'evm'` + `id` are load-bearing for SF-2). */
export const EVM_NETWORK_CONFIG = {
  id: 'ethereum-mainnet',
  exportConstName: 'ethereumMainnet',
  name: 'Ethereum Mainnet',
  ecosystem: 'evm',
  network: 'ethereum',
  type: 'mainnet',
  isTestnet: false,
  chainId: 1,
  rpcUrl: 'https://rpc.example.com',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
} as const;

/** A verified primary name a mocked reverse lookup returns for {@link VITALIK_ADDRESS} (SF-3). */
export const VITALIK_NAME = 'vitalik.eth';

/** A well-known avatar URL a mocked `getEnsAvatar` surfaces (SF-3, INV-4). */
export const AVATAR_URL = 'https://euc.li/vitalik.eth';

export interface MockClient {
  /** The client cast to `PublicClient` for injection into the service. */
  readonly client: PublicClient;
  /** The `getEnsAddress` spy — assert call count / options / never-called. */
  readonly getEnsAddress: ReturnType<typeof vi.fn>;
  /** The `getEnsName` spy (SF-3 reverse) — assert call count / options / never-called. */
  readonly getEnsName: ReturnType<typeof vi.fn>;
  /** The `getEnsAvatar` spy (SF-3 avatar) — assert call count / options / never-called. */
  readonly getEnsAvatar: ReturnType<typeof vi.fn>;
  /**
   * SF-5: the source-level `ccipRead.request` spy the observing wrapper delegates to, when
   * {@link MakeClientOptions.ccipRequest} / `offchain` set one. `undefined` on a plain on-chain mock.
   */
  readonly ccipRequest?: ReturnType<typeof vi.fn>;
}

export interface MakeClientOptions {
  /** Pre-configured `getEnsAddress` spy; defaults to one resolving {@link VITALIK_ADDRESS}. */
  readonly getEnsAddress?: ReturnType<typeof vi.fn>;
  /** Pre-configured `getEnsName` spy (SF-3); defaults to one resolving {@link VITALIK_NAME}. */
  readonly getEnsName?: ReturnType<typeof vi.fn>;
  /** Pre-configured `getEnsAvatar` spy (SF-3); defaults to one resolving {@link AVATAR_URL}. */
  readonly getEnsAvatar?: ReturnType<typeof vi.fn>;
  /** Whether the bound chain exposes an ENS Universal Resolver (D-B support-gate). Default `true`. */
  readonly supported?: boolean;
  /** viem `chain.id` on the bound mock when `supported` (default `1`). */
  readonly boundChainId?: number;
  /**
   * SF-5 — install a source-level `ccipRead.request` on the mock so the service's per-call observing
   * wrapper (INV-9) delegates to it instead of viem's networked `ccipRequest`. When `offchain: true`
   * is set without an explicit spy, a no-op gateway spy resolving `'0x'` is provided.
   */
  readonly ccipRequest?: ReturnType<typeof vi.fn>;
  /**
   * SF-5 — shorthand for the offchain-CCIP-Read case: defaults `getEnsAddress` to a spy that traverses
   * `this.ccipRead.request` (so `external` is observed `true`) and, if none is given, installs the
   * delegation spy above. Ignored when an explicit `getEnsAddress` is supplied.
   */
  readonly offchain?: boolean;
}

/**
 * Build a minimal mock viem `PublicClient` exposing only what the service reads: `chain.contracts.
 * ensUniversalResolver.address` (the sync support-gate), `getEnsAddress` (SF-2 forward), and — for
 * SF-3 — `getEnsName` (reverse) and `getEnsAvatar` (best-effort avatar). SF-5 optionally adds a
 * source `ccipRead.request` (delegation target for the per-call observing client). The single
 * `as unknown as PublicClient` cast is centralized here so no test file re-casts viem's large client
 * type (house style: cf. `erc4626.behavior.test.ts`).
 */
export function makeClient(opts: MakeClientOptions = {}): MockClient {
  const ccipRequest =
    opts.ccipRequest ??
    (opts.offchain ? vi.fn<() => Promise<Hex>>().mockResolvedValue('0x') : undefined);
  const getEnsAddress =
    opts.getEnsAddress ??
    (opts.offchain ? offchainGetEnsAddress() : vi.fn().mockResolvedValue(VITALIK_ADDRESS));
  const getEnsName = opts.getEnsName ?? vi.fn().mockResolvedValue(VITALIK_NAME);
  const getEnsAvatar = opts.getEnsAvatar ?? vi.fn().mockResolvedValue(AVATAR_URL);
  const supported = opts.supported ?? true;
  const boundChainId = opts.boundChainId ?? 1;
  const chain = supported
    ? {
        id: boundChainId,
        name: boundChainId === SEPOLIA_NETWORK_CONFIG.chainId ? 'Sepolia' : 'Ethereum',
        contracts: { ensUniversalResolver: { address: UNIVERSAL_RESOLVER } },
      }
    : { id: 999, name: 'NoEns' };
  const client = {
    chain,
    getEnsAddress,
    getEnsName,
    getEnsAvatar,
    ...(ccipRequest ? { ccipRead: { request: ccipRequest } } : {}),
  } as unknown as PublicClient;
  return { client, getEnsAddress, getEnsName, getEnsAvatar, ccipRequest };
}

/** A paired bound + mainnet L1 mock for 002 SF-1 reverse miss-fallback tests. */
export interface DualReverseClients {
  readonly bound: MockClient;
  readonly l1: MockClient;
}

export interface MakeDualReverseClientsOptions {
  readonly boundGetEnsName?: ReturnType<typeof vi.fn>;
  readonly boundGetEnsAvatar?: ReturnType<typeof vi.fn>;
  readonly l1GetEnsName?: ReturnType<typeof vi.fn>;
  readonly l1GetEnsAvatar?: ReturnType<typeof vi.fn>;
  /** Bound chain carries a UR (default `true`). */
  readonly boundSupported?: boolean;
  /** viem `chain.id` on the bound mock when UR-present (default Sepolia). */
  readonly boundChainId?: number;
}

/**
 * Build separate bound and L1 `PublicClient` stubs so spies can assert call order / client affinity
 * (INV-9, INV-18, INV-19). The L1 client always carries a mainnet-shaped chain id for realism.
 */
export function makeDualReverseClients(
  opts: MakeDualReverseClientsOptions = {}
): DualReverseClients {
  const bound = makeClient({
    getEnsName: opts.boundGetEnsName,
    getEnsAvatar: opts.boundGetEnsAvatar,
    supported: opts.boundSupported ?? true,
    boundChainId: opts.boundChainId ?? SEPOLIA_NETWORK_CONFIG.chainId,
  });
  const l1GetEnsName = opts.l1GetEnsName ?? vi.fn().mockResolvedValue(VITALIK_NAME);
  const l1GetEnsAvatar = opts.l1GetEnsAvatar ?? vi.fn().mockResolvedValue(AVATAR_URL);
  const l1 = makeClient({
    getEnsName: l1GetEnsName,
    getEnsAvatar: l1GetEnsAvatar,
    supported: true,
    boundChainId: 1,
  });
  return { bound, l1 };
}

// ---------------------------------------------------------------------------
// SF-5 — ENS v2 fixtures (L1 cross-chain scoping + observed offchain traversal)
// ---------------------------------------------------------------------------

/** Base (chainId 8453) → its ENSIP-11 `coinType` — the chain-scoped example from INV-6. */
export const BASE_CHAIN_ID = 8453;
export const BASE_COIN_TYPE = 2147492101; // Number(toCoinType(8453))
export const BASE_COIN_TYPE_BIGINT = 2147492101n;

/** The ENSIP-9 mainnet coinType (unscoped) — mainnet-bound resolutions carry this (INV-6). */
export const ETH_COIN_TYPE_BIGINT = 60n;

/**
 * A Base (L2) network config. Its bound client carries NO Universal Resolver, so `resolveName`
 * takes the L1 cross-chain client-selection branch (INV-17) when an `ensL1Client` is wired.
 */
export const L2_NETWORK_CONFIG = {
  id: 'base-mainnet',
  exportConstName: 'baseMainnet',
  name: 'Base',
  ecosystem: 'evm',
  network: 'base',
  type: 'mainnet',
  isTestnet: false,
  chainId: BASE_CHAIN_ID,
  rpcUrl: 'https://base.example.com',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
} as const;

/**
 * A bound network whose chainId is OUTSIDE the ENSIP-11 addressable range, so viem's `toCoinType`
 * (via `deriveCoinType`) throws `EnsInvalidChainIdError` — the INV-16 containment case.
 */
export const NON_ENSIP11_NETWORK_CONFIG = {
  ...L2_NETWORK_CONFIG,
  id: 'exotic-chain',
  chainId: 2 ** 40, // out of the ENSIP-11 addressable range → EnsInvalidChainIdError
} as const;

/**
 * Build a `getEnsAddress` spy that SIMULATES an ERC-3668 offchain traversal exactly as viem's
 * `offchainLookup` does — by reading the client-level `ccipRead.request` hook on the client the
 * action runs on. Because the service runs this on its per-call observing client (whose `ccipRead`
 * wrapper flips `sawOffchain`), the resulting `provenance.external` is observed `true` (INV-9). The
 * delegation target is the source client's own `ccipRead.request` (see {@link makeClient}), so no
 * real network hop occurs.
 *
 * `resolve(name)` picks the returned address (or `null` for a not-found); `shouldGoOffchain(name)`
 * decides per-name whether to traverse — letting an interleaving test route some names offchain and
 * others on-chain over ONE shared client (INV-18).
 */
export function offchainGetEnsAddress(
  resolve: (name: string) => string | null = () => VITALIK_ADDRESS,
  shouldGoOffchain: (name: string) => boolean = () => true
): ReturnType<typeof vi.fn> {
  return vi.fn(async function (
    this: { ccipRead?: { request: (p: CcipRequestParameters) => Promise<Hex> } },
    args: { name: string; coinType?: bigint; strict?: boolean }
  ): Promise<string | null> {
    if (shouldGoOffchain(args.name) && this.ccipRead) {
      await this.ccipRead.request({ data: '0x', sender: ZERO_ADDRESS, urls: [] });
    }
    return resolve(args.name);
  });
}

/** The zero address — a benign `sender` for the simulated CCIP-Read request params. */
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/** An RPC URL embedding a provider key — used to prove `ensL1Client`'s key never leaks (INV-24). */
export const KEYED_L1_RPC_URL = `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`;

// ---------------------------------------------------------------------------
// Native-error factories (fault injection — INV-6 / INV-10)
// ---------------------------------------------------------------------------

export function makeTimeoutError(): TimeoutError {
  return new TimeoutError({ body: {}, url: 'https://rpc.example.com' });
}

export function makeHttpError(url = KEYED_URL): HttpRequestError {
  return new HttpRequestError({ url, status: 500, details: 'gateway down' });
}

export function makeChainUnsupportedError(): ChainDoesNotSupportContract {
  return new ChainDoesNotSupportContract({
    chain: { id: 999, name: 'NoEns' } as never,
    contract: { name: 'ensUniversalResolver' },
  });
}

/**
 * A viem error whose thrown class is `ContractFunctionExecutionError` but whose *decoded* revert
 * carries `data.errorName === <errorName>`. SF-2's catch reaches this name via `extractRevertInfo`
 * (gated on `instanceof BaseError`), exactly as the SF-1 mapper does. Verbatim from the sibling
 * `error-mapping.test.ts` so both suites share one revert shape.
 */
export function makeDecodedRevert(errorName: string): ContractFunctionExecutionError {
  const revert = new ContractFunctionRevertedError({ abi: [], functionName: 'resolve' });
  (revert as { data?: { errorName: string; args: unknown[] } }).data = { errorName, args: [] };
  return new ContractFunctionExecutionError(revert, { abi: [], functionName: 'resolve' });
}

/**
 * A "foreign-realm" / duplicate-copy error: matches by `.name` but is NOT an `instanceof` of any
 * viem class. Exercises the `instanceof BaseError` guard in SF-2's catch (and the `.name`-needle
 * fallback in the SF-1 mapper for the transport buckets).
 */
export function foreignRealmError(
  name: string,
  message = 'foreign'
): { name: string; message: string } {
  return { name, message };
}
