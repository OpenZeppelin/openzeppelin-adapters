/**
 * IRS Write Action Assembly.
 *
 * Pure functions that build `WriteContractParameters` for IRS / ONCHAINID writes.
 * The service delegates execution to the injected `signAndBroadcast`, so this module
 * only assembles calldata (mirroring the access-control actions module).
 *
 * @module irs/actions
 */

import type { Hex } from 'viem';

import type { OnboardingClaim } from '@openzeppelin/ui-types';

import type { WriteContractParameters } from '../types';
import {
  ADD_CLAIM_ABI,
  ADD_TRUSTED_ISSUER_ABI,
  CREATE_IDENTITY_ABI,
  REGISTER_IDENTITY_ABI,
} from './abis';

/** Assembles `createIdentity(address _wallet, string _salt)` on the identity factory. */
export function assembleDeployOnchainIdAction(
  factoryAddress: string,
  holder: string,
  salt: string
): WriteContractParameters {
  return {
    address: factoryAddress as Hex,
    abi: CREATE_IDENTITY_ABI,
    functionName: 'createIdentity',
    args: [holder as Hex, salt],
  };
}

/** Assembles `addTrustedIssuer(address _trustedIssuer, uint256[] _claimTopics)`. */
export function assembleAddTrustedIssuerAction(
  trustedIssuersRegistry: string,
  issuer: string,
  topics: string[]
): WriteContractParameters {
  return {
    address: trustedIssuersRegistry as Hex,
    abi: ADD_TRUSTED_ISSUER_ABI,
    functionName: 'addTrustedIssuer',
    args: [issuer as Hex, topics.map((topic) => BigInt(topic))],
  };
}

/**
 * Assembles `addClaim(...)` on an ONCHAINID from a **pre-signed** claim.
 * The issuer key never enters this module — only the issuer's signature is relayed.
 */
export function assembleAttachClaimAction(
  onchainId: string,
  claim: OnboardingClaim,
  issuerAddress: string
): WriteContractParameters {
  return {
    address: onchainId as Hex,
    abi: ADD_CLAIM_ABI,
    functionName: 'addClaim',
    args: [
      BigInt(claim.topic),
      BigInt(claim.scheme),
      (claim.issuer ?? issuerAddress) as Hex,
      claim.signature as Hex,
      claim.data as Hex,
      '',
    ],
  };
}

/** Assembles `registerIdentity(address _userAddress, address _identity, uint16 _country)`. */
export function assembleRegisterIdentityAction(
  registryAddress: string,
  holder: string,
  onchainId: string,
  country: number
): WriteContractParameters {
  return {
    address: registryAddress as Hex,
    abi: REGISTER_IDENTITY_ABI,
    functionName: 'registerIdentity',
    args: [holder as Hex, onchainId as Hex, country],
  };
}
