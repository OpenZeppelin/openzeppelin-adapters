/**
 * ERC-4626 (Tokenized Vault) ABI Fragments (pinned, vendored).
 *
 * Single-function ABI fragments for the standard ERC-4626 vault surface used by the
 * capability: the conversion/total reads and the `deposit` / `redeem` writes. The
 * capability's `withdraw({ from, shares })` takes a **share** quantity, so it maps to
 * `redeem(shares, receiver, owner)` (not the asset-denominated `withdraw`).
 *
 * ## Provenance (FR-017, FR-017a)
 *
 * | Interface  | Source repo                                   | Pinned version | Reference |
 * |------------|-----------------------------------------------|----------------|-----------|
 * | `IERC4626` | github.com/OpenZeppelin/openzeppelin-contracts | npm `@openzeppelin/contracts@5.x` (`contracts/interfaces/IERC4626.sol`) | EIP-4626 (Final) |
 *
 * EIP-4626 is a **finalized** standard, so these function/selector signatures are immutable
 * by definition; the table pins the vendoring source for traceability. Signatures verified
 * verbatim against OpenZeppelin Contracts `master` (`contracts/interfaces/IERC4626.sol`) and
 * the EIP-4626 specification on 2026-06-02. Re-syncing must be a deliberate, Changeset-tracked
 * change with this table updated.
 *
 * @module erc4626/abi
 */

import type { Abi } from 'viem';

// ---------------------------------------------------------------------------
// IERC4626 — reads
// ---------------------------------------------------------------------------

/** `convertToAssets(uint256 shares) → uint256 assets`. */
export const CONVERT_TO_ASSETS_ABI: Abi = [
  {
    type: 'function',
    name: 'convertToAssets',
    inputs: [{ name: 'shares', type: 'uint256' }],
    outputs: [{ name: 'assets', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

/** `convertToShares(uint256 assets) → uint256 shares`. */
export const CONVERT_TO_SHARES_ABI: Abi = [
  {
    type: 'function',
    name: 'convertToShares',
    inputs: [{ name: 'assets', type: 'uint256' }],
    outputs: [{ name: 'shares', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

/** `totalAssets() → uint256 totalManagedAssets`. */
export const TOTAL_ASSETS_ABI: Abi = [
  {
    type: 'function',
    name: 'totalAssets',
    inputs: [],
    outputs: [{ name: 'totalManagedAssets', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

// ---------------------------------------------------------------------------
// IERC4626 — writes
// ---------------------------------------------------------------------------

/** `deposit(uint256 assets, address receiver) → uint256 shares`. */
export const DEPOSIT_ABI: Abi = [
  {
    type: 'function',
    name: 'deposit',
    inputs: [
      { name: 'assets', type: 'uint256' },
      { name: 'receiver', type: 'address' },
    ],
    outputs: [{ name: 'shares', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
] as const;

/**
 * `redeem(uint256 shares, address receiver, address owner) → uint256 assets`.
 *
 * Backs the capability's `withdraw({ from, shares })` — redeeming a share quantity for the
 * underlying assets, with `receiver === owner === from`.
 */
export const REDEEM_ABI: Abi = [
  {
    type: 'function',
    name: 'redeem',
    inputs: [
      { name: 'shares', type: 'uint256' },
      { name: 'receiver', type: 'address' },
      { name: 'owner', type: 'address' },
    ],
    outputs: [{ name: 'assets', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
] as const;
