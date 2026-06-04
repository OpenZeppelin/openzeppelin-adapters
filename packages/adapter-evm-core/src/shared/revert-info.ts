/**
 * Shared viem revert-info extraction.
 *
 * Capability error mappers (ERC-3643, ERC-4626, …) classify a raw execution failure into a
 * typed `RICapabilityError`. They all need the same signals out of the raw error: the
 * top-level messages, and — when it is a viem error — the structured revert `reason`, the
 * decoded custom-error `errorName`, and the raw 4-byte selector reached by walking the error
 * chain. This module owns that extraction so each mapper only supplies its keyword policy.
 *
 * Custom-error contracts: when the executor's viem instance carried the contract ABI, the
 * decoded name flows through `data.errorName`. When it did not (name absent but raw revert
 * bytes present), the caller's optional `customErrorAbi` is used to decode the name; failing
 * that, the bare 4-byte selector is surfaced for diagnosis.
 *
 * @module shared/revert-info
 */

import { BaseError, ContractFunctionRevertedError, decodeErrorResult, type Abi } from 'viem';

/** Builtin Solidity error names viem decodes; not treated as custom-error names. */
const BUILTIN_ERROR_NAMES = new Set(['Error', 'Panic']);

/** Structured signals extracted from a raw execution error for keyword classification. */
export interface RevertInfo {
  /** Decoded custom-error name (excludes the builtin `Error`/`Panic`), when available. */
  errorName?: string;
  /** 4-byte selector when a custom error could not be decoded to a name. */
  selector?: string;
  /** Combined, lowercased text (messages + reason + decoded name) for keyword matching. */
  searchText: string;
}

/** Best-effort decode of raw revert bytes against a vendored custom-error ABI. */
function decodeCustomError(raw: `0x${string}`, customErrorAbi: Abi): string | undefined {
  if (customErrorAbi.length === 0) return undefined;
  try {
    return decodeErrorResult({ abi: customErrorAbi, data: raw }).errorName;
  } catch {
    return undefined;
  }
}

/**
 * Pull every available signal out of a raw execution error: top-level messages, and — when
 * it is a viem error — the structured revert `reason`, decoded custom-error `errorName`, and
 * raw selector reached by walking the error chain.
 *
 * @param error - The underlying execution error.
 * @param customErrorAbi - Optional vendored custom-error ABI for name recovery when viem
 *   could not decode the error itself. Defaults to empty (string-revert contracts).
 */
export function extractRevertInfo(error: Error, customErrorAbi: Abi = []): RevertInfo {
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
        errorName = decodeCustomError(revert.raw, customErrorAbi);
        if (!errorName) selector = revert.signature ?? revert.raw.slice(0, 10);
      }
    }
  }

  if (errorName) texts.push(errorName);
  return { errorName, selector, searchText: texts.join(' ').toLowerCase() };
}

/** Whether `text` includes any of the given needles. */
export const includesAny = (text: string, needles: string[]): boolean =>
  needles.some((needle) => text.includes(needle));
