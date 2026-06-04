/**
 * Pure, key-free claim payload builder (FR-008a).
 *
 * Computes the canonical digest a trusted issuer signs out-of-band to produce an
 * {@link OnboardingClaim}. This module performs **no RPC and holds no signing key** —
 * it is a deterministic function of its inputs.
 *
 * The digest matches the ONCHAINID / ERC-735 claim-signature convention used by
 * `IClaimIssuer.isClaimValid`:
 *
 * ```solidity
 * dataHash = keccak256(abi.encode(identityHolder, topic, data))
 * ```
 *
 * The issuer signs `dataHash` (the wallet applies the EIP-191 personal-sign prefix),
 * yielding the `signature` carried by {@link OnboardingClaim}.
 *
 * @module irs/claim-payload
 * @see https://docs.onchainid.com/docs/developers/contracts/ (addClaim signature structure)
 */

import { encodeAbiParameters, keccak256, type Hex } from 'viem';

import type { ClaimPayload } from '@openzeppelin/ui-types';

/**
 * Parameters for {@link buildClaimPayload}.
 */
export interface BuildClaimPayloadInput {
  /** The holder's ONCHAINID contract address. */
  onchainId: string;
  /** Claim topic. For ERC-3643 this is a uint256 — provide its decimal string form. */
  topic: string;
  /** Signature scheme (e.g. 1 for ECDSA). */
  scheme: number;
  /** Hex-encoded claim data (`0x`-prefixed). */
  data: string;
}

/**
 * Build the canonical, signable claim digest for an ONCHAINID claim.
 *
 * Pure and key-free: identical inputs always yield identical output, with no RPC
 * and no signing.
 *
 * @param input - The ONCHAINID address, topic, scheme, and hex-encoded data.
 * @returns The {@link ClaimPayload} with the digest to sign and the echoed fields.
 */
export function buildClaimPayload(input: BuildClaimPayloadInput): ClaimPayload {
  const { onchainId, topic, scheme, data } = input;

  const digest = keccak256(
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'uint256' }, { type: 'bytes' }],
      [onchainId as Hex, BigInt(topic), data as Hex]
    )
  );

  return { digest, topic, scheme, data };
}
