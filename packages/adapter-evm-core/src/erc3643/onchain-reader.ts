/**
 * ERC-3643 (T-REX) On-Chain Reader.
 *
 * Reads token + compliance state via a viem public client (stateless client per call,
 * matching the access-control / IRS readers). Balances cross the boundary as base-unit
 * decimal strings via the shared amount codec. Expected-negative reads return values
 * (never throw): `isVerified` is `false` for unregistered holders, `simulateTransfer`
 * returns `{ allowed: false, blockingModule }` rather than raising.
 *
 * @module erc3643/onchain-reader
 */

import type { Chain } from 'viem';

import type { Amount, TransferSimulationResult } from '@openzeppelin/ui-types';
import { RICapabilityOperationFailed } from '@openzeppelin/ui-types';
import { logger } from '@openzeppelin/ui-utils';

import { INVESTOR_COUNTRY_ABI, IS_VERIFIED_ABI } from '../irs/abis';
import { formatAmount, parseAmount } from '../shared/amount';
import { createEvmPublicClient } from '../utils/public-client';
import {
  BALANCE_OF_ABI,
  CAN_TRANSFER_ABI,
  COMPLIANCE_ABI,
  GET_MODULES_ABI,
  IDENTITY_REGISTRY_ABI,
  IS_FROZEN_ABI,
  MODULE_CHECK_ABI,
  MODULE_NAME_ABI,
} from './abi';

const LOG_SYSTEM = 'EvmErc3643Reader';

/** Read `balanceOf` and format as a base-unit decimal string. */
export async function balanceOf(
  rpcUrl: string,
  tokenAddress: string,
  holder: string,
  viemChain?: Chain
): Promise<Amount> {
  const client = createEvmPublicClient(rpcUrl, viemChain);

  try {
    const raw = (await client.readContract({
      address: tokenAddress as `0x${string}`,
      abi: BALANCE_OF_ABI,
      functionName: 'balanceOf',
      args: [holder as `0x${string}`],
    })) as bigint;

    return formatAmount(raw, tokenAddress);
  } catch (error) {
    logger.error(LOG_SYSTEM, `balanceOf failed for ${holder}:`, error);
    throw new RICapabilityOperationFailed(
      `Failed to read balanceOf for ${holder}: ${(error as Error).message}`,
      'balanceOf',
      error as Error,
      tokenAddress
    );
  }
}

/** Whether the holder's wallet is frozen. */
export async function isFrozen(
  rpcUrl: string,
  tokenAddress: string,
  holder: string,
  viemChain?: Chain
): Promise<boolean> {
  const client = createEvmPublicClient(rpcUrl, viemChain);

  try {
    return (await client.readContract({
      address: tokenAddress as `0x${string}`,
      abi: IS_FROZEN_ABI,
      functionName: 'isFrozen',
      args: [holder as `0x${string}`],
    })) as boolean;
  } catch (error) {
    logger.error(LOG_SYSTEM, `isFrozen failed for ${holder}:`, error);
    throw new RICapabilityOperationFailed(
      `Failed to read isFrozen for ${holder}: ${(error as Error).message}`,
      'isFrozen',
      error as Error,
      tokenAddress
    );
  }
}

/**
 * Whether the holder is verified in the token's Identity Registry.
 * Resolves the registry via `identityRegistry()`, then calls `isVerified`.
 * Returns `false` (never throws) for the expected-negative case.
 */
export async function isVerified(
  rpcUrl: string,
  tokenAddress: string,
  holder: string,
  viemChain?: Chain
): Promise<boolean> {
  const client = createEvmPublicClient(rpcUrl, viemChain);

  try {
    const registry = (await client.readContract({
      address: tokenAddress as `0x${string}`,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'identityRegistry',
    })) as string;

    return (await client.readContract({
      address: registry as `0x${string}`,
      abi: IS_VERIFIED_ABI,
      functionName: 'isVerified',
      args: [holder as `0x${string}`],
    })) as boolean;
  } catch {
    logger.debug(LOG_SYSTEM, `isVerified read returned negative for ${holder}`);
    return false;
  }
}

/** Jurisdiction (ISO-3166 numeric code) as a string, or `undefined` when unavailable. */
export async function getJurisdiction(
  rpcUrl: string,
  tokenAddress: string,
  holder: string,
  viemChain?: Chain
): Promise<string | undefined> {
  const client = createEvmPublicClient(rpcUrl, viemChain);

  try {
    const registry = (await client.readContract({
      address: tokenAddress as `0x${string}`,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'identityRegistry',
    })) as string;

    const country = (await client.readContract({
      address: registry as `0x${string}`,
      abi: INVESTOR_COUNTRY_ABI,
      functionName: 'investorCountry',
      args: [holder as `0x${string}`],
    })) as number | bigint;

    return country.toString();
  } catch {
    logger.debug(LOG_SYSTEM, `getJurisdiction unavailable for ${holder}`);
    return undefined;
  }
}

/**
 * Pre-flight compliance evaluation for a prospective transfer.
 *
 * Resolves the modular compliance via `compliance()`, counts bound modules via
 * `getModules()`, and uses `canTransfer` for the aggregate decision. When blocked,
 * probes each module's `moduleCheck` to surface the first blocking module's `name()`.
 * Never throws for the expected-negative (blocked) case — returns
 * `{ allowed: false, blockingModule }`.
 */
export async function simulateTransfer(
  rpcUrl: string,
  tokenAddress: string,
  input: { from: string; to: string; amount: Amount },
  viemChain?: Chain
): Promise<TransferSimulationResult> {
  const client = createEvmPublicClient(rpcUrl, viemChain);
  const amount = parseAmount(input.amount, tokenAddress);

  let compliance: string;
  let modules: string[];
  try {
    compliance = (await client.readContract({
      address: tokenAddress as `0x${string}`,
      abi: COMPLIANCE_ABI,
      functionName: 'compliance',
    })) as string;

    modules = (await client.readContract({
      address: compliance as `0x${string}`,
      abi: GET_MODULES_ABI,
      functionName: 'getModules',
    })) as string[];
  } catch (error) {
    logger.error(LOG_SYSTEM, 'simulateTransfer setup failed:', error);
    throw new RICapabilityOperationFailed(
      `Failed to read compliance modules: ${(error as Error).message}`,
      'simulateTransfer',
      error as Error,
      tokenAddress
    );
  }

  const allowed = (await client.readContract({
    address: compliance as `0x${string}`,
    abi: CAN_TRANSFER_ABI,
    functionName: 'canTransfer',
    args: [input.from as `0x${string}`, input.to as `0x${string}`, amount],
  })) as boolean;

  const modulesEvaluated = modules.length;

  if (allowed) {
    return { allowed: true, modulesEvaluated };
  }

  const blockingModule = await findBlockingModule(client, compliance, modules, input, amount);
  return { allowed: false, modulesEvaluated, blockingModule };
}

/**
 * Probe each compliance module's `moduleCheck`; return the `name()` (or address) of the
 * first that rejects the transfer. Returns `undefined` if none individually reject.
 */
async function findBlockingModule(
  client: ReturnType<typeof createEvmPublicClient>,
  compliance: string,
  modules: string[],
  input: { from: string; to: string },
  amount: bigint
): Promise<string | undefined> {
  for (const moduleAddress of modules) {
    try {
      const ok = (await client.readContract({
        address: moduleAddress as `0x${string}`,
        abi: MODULE_CHECK_ABI,
        functionName: 'moduleCheck',
        args: [
          input.from as `0x${string}`,
          input.to as `0x${string}`,
          amount,
          compliance as `0x${string}`,
        ],
      })) as boolean;

      if (!ok) {
        return await moduleName(client, moduleAddress);
      }
    } catch {
      logger.debug(LOG_SYSTEM, `moduleCheck failed for ${moduleAddress}; treating as blocking`);
      return await moduleName(client, moduleAddress);
    }
  }

  return undefined;
}

/** Resolve a module's human-readable `name()`, falling back to its address. */
async function moduleName(
  client: ReturnType<typeof createEvmPublicClient>,
  moduleAddress: string
): Promise<string> {
  try {
    return (await client.readContract({
      address: moduleAddress as `0x${string}`,
      abi: MODULE_NAME_ABI,
      functionName: 'name',
    })) as string;
  } catch {
    return moduleAddress;
  }
}
