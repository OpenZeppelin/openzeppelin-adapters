/**
 * Unit tests for `mapErc3643Error` — the viem structured-revert / custom-error-selector
 * decoding paths (complementing the require-string cases in `erc3643.writes.test.ts`).
 *
 * Verifies that the mapper walks the viem error chain to recover the `reason` and decoded
 * custom-error `errorName`, classifies on the enriched text, and surfaces the raw 4-byte
 * selector for an unrecognized custom error.
 */
import { ContractFunctionExecutionError, ContractFunctionRevertedError } from 'viem';
import { describe, expect, it } from 'vitest';

import { mapErc3643Error } from '../error-mapping';

const TOKEN = '0x1111111111111111111111111111111111111111';
const HOLDER = '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa';

/** Build a viem ContractFunctionRevertedError, optionally with a decoded custom-error name. */
function makeRevert(opts: {
  reason?: string;
  errorName?: string;
  raw?: `0x${string}`;
  signature?: `0x${string}`;
}): ContractFunctionRevertedError {
  const revert = new ContractFunctionRevertedError({
    abi: [],
    functionName: 'mint',
    message: opts.reason,
  });
  if (opts.errorName) {
    (revert as { data?: { errorName: string; args: unknown[] } }).data = {
      errorName: opts.errorName,
      args: [],
    };
  }
  if (opts.raw) (revert as { raw?: `0x${string}` }).raw = opts.raw;
  if (opts.signature) (revert as { signature?: `0x${string}` }).signature = opts.signature;
  return revert;
}

describe('mapErc3643Error — structured viem reverts', () => {
  it('recovers the require reason from a nested ContractFunctionRevertedError', () => {
    const revert = makeRevert({ reason: 'wallet is frozen' });
    const wrapped = new ContractFunctionExecutionError(revert, {
      abi: [],
      functionName: 'transfer',
    });

    const mapped = mapErc3643Error(wrapped, 'transfer', TOKEN, { holder: HOLDER });
    expect(mapped).toMatchObject({ code: 'HOLDER_FROZEN', holder: HOLDER });
  });

  it('classifies a decoded custom-error name by keyword (TokenWalletIsFrozen → HolderFrozen)', () => {
    const revert = makeRevert({ errorName: 'TokenWalletIsFrozen' });

    const mapped = mapErc3643Error(revert, 'transfer', TOKEN, { holder: HOLDER });
    expect(mapped).toMatchObject({ code: 'HOLDER_FROZEN' });
  });

  it('classifies a decoded compliance custom error → ComplianceModuleRejected', () => {
    const revert = makeRevert({ errorName: 'ComplianceCheckFailed' });

    const mapped = mapErc3643Error(revert, 'transfer', TOKEN);
    expect(mapped).toMatchObject({ code: 'COMPLIANCE_MODULE_REJECTED' });
  });

  it('surfaces the raw selector for an unrecognized custom error (→ OPERATION_FAILED)', () => {
    const revert = makeRevert({ signature: '0xdeadbeef', raw: '0xdeadbeef' });

    const mapped = mapErc3643Error(revert, 'mint', TOKEN) as Error & { operation: string };
    expect(mapped).toMatchObject({ code: 'OPERATION_FAILED', operation: 'mint' });
    expect(mapped.message).toContain('0xdeadbeef');
  });

  it('ignores the builtin Error name and falls through to the generic failure', () => {
    // `data.errorName === 'Error'` is the ABI builtin for require-strings; with no recognizable
    // reason text it must not be treated as a custom error name.
    const revert = makeRevert({ errorName: 'Error', reason: 'something unexpected' });

    const mapped = mapErc3643Error(revert, 'mint', TOKEN);
    expect(mapped).toMatchObject({ code: 'OPERATION_FAILED' });
  });
});
