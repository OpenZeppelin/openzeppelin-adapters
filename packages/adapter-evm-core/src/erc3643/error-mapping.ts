/**
 * ERC-3643 revert → typed-error mapping.
 *
 * Classifies a raw execution failure into the appropriate `RICapabilityError` subclass
 * (EC-5); anything unrecognized falls back to `RICapabilityOperationFailed` so no failure
 * is silently swallowed.
 *
 * ## Two revert encodings, one classifier
 *
 * The canonical T-REX `Token.sol` (pinned v4.x) reverts with **`require`/`revert` strings**
 * (e.g. `"Identity is not verified."`, `"wallet is frozen"`, `"sender balance too low"`),
 * not custom Solidity `error` types — so there are no 4-byte selectors to decode there, and
 * the keyword matcher below is the correct mechanism. The keyword set is aligned verbatim to
 * the strings verified against `ERC-3643/ERC-3643@main` (2026-06-01).
 *
 * For contracts that *do* use custom errors (other ERC-3643 implementations, compliance
 * modules, future T-REX), {@link extractRevertInfo} walks the viem error chain to recover the
 * decoded custom-error **name** (and falls back to decoding the raw revert bytes against the
 * vendored {@link CUSTOM_ERROR_ABI}). The decoded name is folded into the same keyword match
 * (so `error TokenWalletIsFrozen()` classifies as {@link HolderFrozen}), and the raw 4-byte
 * selector is surfaced in the fallback message for diagnosis when nothing matches.
 *
 * @module erc3643/error-mapping
 */

import { BaseError, ContractFunctionRevertedError, decodeErrorResult, type Abi } from 'viem';

import {
  ComplianceModuleRejected,
  HolderFrozen,
  InsufficientBalance,
  RecipientNotVerified,
  RICapabilityOperationFailed,
} from '@openzeppelin/ui-types';

/** Context threaded into the mapped error for actionable messages. */
export interface Erc3643ErrorContext {
  /** Holder/recipient most relevant to the operation (for holder-scoped errors). */
  holder?: string;
  /** Requested base-unit amount, when the operation carries one. */
  requested?: string;
}

/**
 * Vendored custom-error ABI fragments, decoded when the executor's viem instance did not
 * carry the contract ABI (so `data.errorName` is absent but raw revert bytes are present).
 *
 * Empty by default: the pinned T-REX uses `require` strings, and when an executor *does*
 * decode a custom error, its name flows through `data.errorName` without needing this ABI.
 * Extension point — add `{ type: 'error', name, inputs }` fragments here (with provenance,
 * like `abi.ts`) to recover names for custom-error contracts whose executor strips them.
 */
export const CUSTOM_ERROR_ABI: Abi = [];

/** Builtin Solidity error names viem decodes; not treated as custom-error names. */
const BUILTIN_ERROR_NAMES = new Set(['Error', 'Panic']);

interface RevertInfo {
  /** Decoded custom-error name (excludes the builtin `Error`/`Panic`), when available. */
  errorName?: string;
  /** 4-byte selector when a custom error could not be decoded to a name. */
  selector?: string;
  /** Combined, lowercased text (messages + reason + decoded name) for keyword matching. */
  searchText: string;
}

/**
 * Pull every available signal out of a raw execution error: top-level messages, and — when
 * it is a viem error — the structured revert `reason`, decoded custom-error `errorName`, and
 * raw selector reached by walking the error chain.
 */
function extractRevertInfo(error: Error): RevertInfo {
  const texts: string[] = [];
  if (error.message) texts.push(error.message);
  const short = (error as { shortMessage?: string }).shortMessage;
  if (short) texts.push(short);

  let errorName: string | undefined;
  let selector: string | undefined;

  if (error instanceof BaseError) {
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      if (revert.reason) texts.push(revert.reason);

      const decodedName = revert.data?.errorName;
      if (decodedName && !BUILTIN_ERROR_NAMES.has(decodedName)) {
        errorName = decodedName;
      }

      // viem couldn't decode the custom error (its ABI lacked the fragment): try ours, then
      // fall back to the bare 4-byte selector for diagnostics.
      if (!errorName && revert.raw && revert.raw !== '0x') {
        errorName = decodeCustomError(revert.raw);
        if (!errorName) selector = revert.signature ?? revert.raw.slice(0, 10);
      }
    }
  }

  if (errorName) texts.push(errorName);
  return { errorName, selector, searchText: texts.join(' ').toLowerCase() };
}

/** Best-effort decode of raw revert bytes against the vendored custom-error ABI. */
function decodeCustomError(raw: `0x${string}`): string | undefined {
  if (CUSTOM_ERROR_ABI.length === 0) return undefined;
  try {
    return decodeErrorResult({ abi: CUSTOM_ERROR_ABI, data: raw }).errorName;
  } catch {
    return undefined;
  }
}

const includesAny = (text: string, needles: string[]): boolean =>
  needles.some((needle) => text.includes(needle));

/**
 * Map a raw ERC-3643 write failure to a typed error.
 *
 * @param error - The underlying execution error.
 * @param operation - Operation name (e.g. `mint`, `transfer`) for fallback context.
 * @param contractAddress - The token address for error context.
 * @param ctx - Optional holder/amount details for holder-scoped errors.
 */
export function mapErc3643Error(
  error: Error,
  operation: string,
  contractAddress?: string,
  ctx: Erc3643ErrorContext = {}
): Error {
  const info = extractRevertInfo(error);
  const text = info.searchText;
  const { holder, requested } = ctx;

  // Order matters: dedicated reasons (verified recipient, frozen, balance) are checked before
  // the broader compliance bucket so the ambiguous `"Transfer not possible"` only lands there.
  if (
    includesAny(text, ['identity is not verified', 'not verified', 'identity is not registered'])
  ) {
    return new RecipientNotVerified(
      `Recipient is not verified in the Identity Registry (${operation}).`,
      holder ?? '',
      contractAddress
    );
  }

  if (text.includes('frozen')) {
    return new HolderFrozen(`Holder is frozen (${operation}).`, holder ?? '', contractAddress);
  }

  if (
    includesAny(text, [
      'insufficient balance',
      'sender balance too low',
      'cannot burn more than balance',
      'exceeds balance',
      'exceeds available balance',
      'transfer amount exceeds',
    ])
  ) {
    return new InsufficientBalance(
      `Insufficient balance for ${operation}.`,
      holder ?? '',
      requested ?? '',
      undefined,
      contractAddress
    );
  }

  if (
    includesAny(text, [
      'compliance not followed',
      'compliance',
      'transfer not possible',
      'not compliant',
    ])
  ) {
    return new ComplianceModuleRejected(
      `A compliance module rejected the ${operation}.`,
      'unknown',
      contractAddress
    );
  }

  // Unmapped: surface the decoded custom-error name or raw selector for diagnosis.
  const detail = info.errorName
    ? ` (custom error: ${info.errorName})`
    : info.selector
      ? ` (unrecognized revert selector: ${info.selector})`
      : '';

  return new RICapabilityOperationFailed(
    `ERC-3643 ${operation} failed: ${error.message}${detail}`,
    operation,
    error,
    contractAddress
  );
}
