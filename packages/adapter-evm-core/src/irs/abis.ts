/**
 * IRS / ONCHAINID ABI Fragments (pinned, vendored).
 *
 * Single-function ABI fragments for the Identity Registry (ERC-3643), ONCHAINID
 * identity (ERC-734/735), the Trusted Issuers Registry, and the ONCHAINID identity
 * factory. Used by the IRS on-chain reader (reads) and actions (writes).
 *
 * ## Provenance (FR-017, FR-017a)
 *
 * | Interface / contract        | Source repo                        | Pinned version | Reference |
 * |-----------------------------|------------------------------------|----------------|-----------|
 * | `IIdentityRegistry`         | github.com/ERC-3643/ERC-3643       | npm `@tokenysolutions/t-rex@4.1.6` | EIP-3643 §"Identity Registry Interface" |
 * | `ITrustedIssuersRegistry`   | github.com/ERC-3643/ERC-3643       | npm `@tokenysolutions/t-rex@4.1.6` | docs.erc3643.org Trusted Issuers Registry |
 * | `IIdentity` (ERC-735)       | github.com/onchain-id/solidity     | npm `@onchain-id/solidity@2.2.1`   | docs.onchainid.com `addClaim` |
 * | `IdFactory`                 | github.com/onchain-id/solidity     | npm `@onchain-id/solidity@2.2.1`   | ONCHAINID IdFactory |
 *
 * These fragments are **vendored** (inlined) from the pinned versions above rather than
 * imported, so the adapter carries no Solidity dependency. Re-syncing them to a newer
 * upstream version must be a deliberate, Changeset-tracked change with this table updated,
 * so the bundled fragments cannot silently drift from upstream and cause decode failures.
 *
 * Signatures verified verbatim against the canonical repos' `main` branch on 2026-06-01
 * (`IIdentityRegistry.sol`, `ITrustedIssuersRegistry.sol` in ERC-3643/ERC-3643;
 * `IIdFactory.sol`, `Identity.sol`/`IERC735` in onchain-id/solidity). The interface
 * shapes are unchanged from the pinned releases above. Note: `IIdentity` / `IClaimIssuer`
 * contract-reference arguments ABI-encode as `address`.
 *
 * @module irs/abis
 */

import type { Abi } from 'viem';

// ---------------------------------------------------------------------------
// IIdentityRegistry (ERC-3643) — reads + registerIdentity write
// ---------------------------------------------------------------------------

/** `isVerified(address _userAddress) → bool` — the IRS verification pre-check. */
export const IS_VERIFIED_ABI: Abi = [
  {
    type: 'function',
    name: 'isVerified',
    inputs: [{ name: '_userAddress', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
] as const;

/** `identity(address _userAddress) → address` — the holder's ONCHAINID, or zero address. */
export const IDENTITY_ABI: Abi = [
  {
    type: 'function',
    name: 'identity',
    inputs: [{ name: '_userAddress', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
] as const;

/** `investorCountry(address _userAddress) → uint16` — ISO-3166 numeric country code. */
export const INVESTOR_COUNTRY_ABI: Abi = [
  {
    type: 'function',
    name: 'investorCountry',
    inputs: [{ name: '_userAddress', type: 'address' }],
    outputs: [{ name: '', type: 'uint16' }],
    stateMutability: 'view',
  },
] as const;

/** `registerIdentity(address _userAddress, address _identity, uint16 _country)` */
export const REGISTER_IDENTITY_ABI: Abi = [
  {
    type: 'function',
    name: 'registerIdentity',
    inputs: [
      { name: '_userAddress', type: 'address' },
      { name: '_identity', type: 'address' },
      { name: '_country', type: 'uint16' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

// ---------------------------------------------------------------------------
// ITrustedIssuersRegistry (ERC-3643)
// ---------------------------------------------------------------------------

/** `isTrustedIssuer(address _issuer) → bool` — used for idempotent registration. */
export const IS_TRUSTED_ISSUER_ABI: Abi = [
  {
    type: 'function',
    name: 'isTrustedIssuer',
    inputs: [{ name: '_issuer', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
] as const;

/** `addTrustedIssuer(address _trustedIssuer, uint256[] _claimTopics)` */
export const ADD_TRUSTED_ISSUER_ABI: Abi = [
  {
    type: 'function',
    name: 'addTrustedIssuer',
    inputs: [
      { name: '_trustedIssuer', type: 'address' },
      { name: '_claimTopics', type: 'uint256[]' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

// ---------------------------------------------------------------------------
// IIdentity (ERC-735) — claim attachment
// ---------------------------------------------------------------------------

/**
 * `addClaim(uint256 _topic, uint256 _scheme, address _issuer, bytes _signature, bytes _data, string _uri) → bytes32`
 */
export const ADD_CLAIM_ABI: Abi = [
  {
    type: 'function',
    name: 'addClaim',
    inputs: [
      { name: '_topic', type: 'uint256' },
      { name: '_scheme', type: 'uint256' },
      { name: '_issuer', type: 'address' },
      { name: '_signature', type: 'bytes' },
      { name: '_data', type: 'bytes' },
      { name: '_uri', type: 'string' },
    ],
    outputs: [{ name: 'claimRequestId', type: 'bytes32' }],
    stateMutability: 'nonpayable',
  },
] as const;

// ---------------------------------------------------------------------------
// IdFactory (ONCHAINID) — deploy + lookup
// ---------------------------------------------------------------------------

/** `getIdentity(address _wallet) → address` — resolves the identity deployed for a wallet. */
export const GET_IDENTITY_ABI: Abi = [
  {
    type: 'function',
    name: 'getIdentity',
    inputs: [{ name: '_wallet', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
] as const;

/** `createIdentity(address _wallet, string _salt) → address` — deploys a new ONCHAINID. */
export const CREATE_IDENTITY_ABI: Abi = [
  {
    type: 'function',
    name: 'createIdentity',
    inputs: [
      { name: '_wallet', type: 'address' },
      { name: '_salt', type: 'string' },
    ],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'nonpayable',
  },
] as const;
