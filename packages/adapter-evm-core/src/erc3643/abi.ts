/**
 * ERC-3643 (T-REX) ABI Fragments (pinned, vendored).
 *
 * Single-function ABI fragments for the T-REX token (`IToken`), its modular compliance
 * (`IModularCompliance`), and individual compliance modules (`IModule`). Used by the
 * ERC-3643 on-chain reader (reads) and actions (writes).
 *
 * ## Provenance (FR-017, FR-017a)
 *
 * | Interface            | Source repo                  | Pinned version | Reference |
 * |----------------------|------------------------------|----------------|-----------|
 * | `IToken`             | github.com/ERC-3643/ERC-3643 | npm `@tokenysolutions/t-rex@4.1.6` | EIP-3643 §"Token Interface" |
 * | `IModularCompliance` | github.com/ERC-3643/ERC-3643 | npm `@tokenysolutions/t-rex@4.1.6` | T-REX modular compliance |
 * | `IModule`            | github.com/ERC-3643/ERC-3643 | npm `@tokenysolutions/t-rex@4.1.6` | T-REX compliance module |
 *
 * These fragments are **vendored** (inlined) from the pinned version above rather than
 * imported, so the adapter carries no Solidity dependency. Re-syncing them must be a
 * deliberate, Changeset-tracked change with this table updated.
 *
 * Signatures verified verbatim against the canonical repo's `main` branch on 2026-06-01
 * (`contracts/token/IToken.sol`, `contracts/compliance/modular/IModularCompliance.sol`,
 * `contracts/compliance/modular/modules/IModule.sol`). The interface shapes are unchanged
 * from the pinned release.
 *
 * @module erc3643/abi
 */

import type { Abi } from 'viem';

// ---------------------------------------------------------------------------
// IToken (ERC-3643 / T-REX) — reads
// ---------------------------------------------------------------------------

/** `balanceOf(address) → uint256` (ERC-20). */
export const BALANCE_OF_ABI: Abi = [
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

/** `isFrozen(address _userAddress) → bool` — wallet freeze status. */
export const IS_FROZEN_ABI: Abi = [
  {
    type: 'function',
    name: 'isFrozen',
    inputs: [{ name: '_userAddress', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
] as const;

/** `identityRegistry() → address` — the token's linked Identity Registry. */
export const IDENTITY_REGISTRY_ABI: Abi = [
  {
    type: 'function',
    name: 'identityRegistry',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
] as const;

/** `compliance() → address` — the token's linked modular compliance contract. */
export const COMPLIANCE_ABI: Abi = [
  {
    type: 'function',
    name: 'compliance',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
] as const;

// ---------------------------------------------------------------------------
// IToken (ERC-3643 / T-REX) — writes
// ---------------------------------------------------------------------------

/** `mint(address _to, uint256 _amount)` — agent-only. */
export const MINT_ABI: Abi = [
  {
    type: 'function',
    name: 'mint',
    inputs: [
      { name: '_to', type: 'address' },
      { name: '_amount', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

/** `burn(address _userAddress, uint256 _amount)` — agent-only. */
export const BURN_ABI: Abi = [
  {
    type: 'function',
    name: 'burn',
    inputs: [
      { name: '_userAddress', type: 'address' },
      { name: '_amount', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

/**
 * `forcedTransfer(address _from, address _to, uint256 _amount) → bool` — agent-only.
 *
 * The capability's `transfer({ from, to, amount })` carries an explicit `from`, so it maps
 * to the agent `forcedTransfer` (not the msg.sender-based ERC-20 `transfer`).
 */
export const FORCED_TRANSFER_ABI: Abi = [
  {
    type: 'function',
    name: 'forcedTransfer',
    inputs: [
      { name: '_from', type: 'address' },
      { name: '_to', type: 'address' },
      { name: '_amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const;

/** `setAddressFrozen(address _userAddress, bool _freeze)` — backs `freeze`/`unfreeze`. */
export const SET_ADDRESS_FROZEN_ABI: Abi = [
  {
    type: 'function',
    name: 'setAddressFrozen',
    inputs: [
      { name: '_userAddress', type: 'address' },
      { name: '_freeze', type: 'bool' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

// ---------------------------------------------------------------------------
// IModularCompliance — transfer simulation
// ---------------------------------------------------------------------------

/** `canTransfer(address _from, address _to, uint256 _amount) → bool` (read-only). */
export const CAN_TRANSFER_ABI: Abi = [
  {
    type: 'function',
    name: 'canTransfer',
    inputs: [
      { name: '_from', type: 'address' },
      { name: '_to', type: 'address' },
      { name: '_amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
] as const;

/** `getModules() → address[]` — compliance modules bound to the contract. */
export const GET_MODULES_ABI: Abi = [
  {
    type: 'function',
    name: 'getModules',
    inputs: [],
    outputs: [{ name: '', type: 'address[]' }],
    stateMutability: 'view',
  },
] as const;

// ---------------------------------------------------------------------------
// IModule — per-module evaluation (to identify the first blocking module)
// ---------------------------------------------------------------------------

/** `moduleCheck(address _from, address _to, uint256 _value, address _compliance) → bool`. */
export const MODULE_CHECK_ABI: Abi = [
  {
    type: 'function',
    name: 'moduleCheck',
    inputs: [
      { name: '_from', type: 'address' },
      { name: '_to', type: 'address' },
      { name: '_value', type: 'uint256' },
      { name: '_compliance', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
] as const;

/** `name() → string` — module identifier, surfaced as `blockingModule`. */
export const MODULE_NAME_ABI: Abi = [
  {
    type: 'function',
    name: 'name',
    inputs: [],
    outputs: [{ name: '_name', type: 'string' }],
    stateMutability: 'pure',
  },
] as const;
