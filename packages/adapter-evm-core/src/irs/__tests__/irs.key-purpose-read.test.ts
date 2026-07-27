/**
 * Identity key-purpose read semantics — `lacks` vs `read_failed` must not collapse.
 */
import { encodeAbiParameters, keccak256 } from 'viem';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createIRS, type CreateIRSOptions, type EvmIRSCapability } from '../../capabilities/irs';
import { IDENTITY_KEY_PURPOSE_MANAGEMENT, lookupIdentityKeyPurpose } from '../identity-keys';

const mockReadContract = vi.fn();

vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem');
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({ readContract: mockReadContract })),
    http: vi.fn((url: string) => ({ url, type: 'http' })),
  };
});

const RPC = 'https://rpc.example.com';
const FACTORY = '0x2222222222222222222222222222222222222222';
const REGISTRY = '0x1111111111111111111111111111111111111111';
const TRUSTED_ISSUERS = '0x3333333333333333333333333333333333333333';
const HOLDER = '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa';
const OPERATOR = '0xDD601cb1dDb4471e88C51A5f64A9d54294179142';
const ONCHAINID = '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB';

function addressKeyHash(address: string): `0x${string}` {
  return keccak256(encodeAbiParameters([{ type: 'address' }], [address as `0x${string}`]));
}

function makeCapability(): { capability: EvmIRSCapability } {
  const options: CreateIRSOptions = {
    signAndBroadcast: vi.fn(),
    addresses: {
      identityRegistry: REGISTRY,
      identityFactory: FACTORY,
      trustedIssuersRegistry: TRUSTED_ISSUERS,
    },
    operatorManagementKey: OPERATOR,
  };
  const capability = createIRS(
    {
      id: 'evm-testnet',
      exportConstName: 'evmTestnet',
      name: 'EVM Testnet',
      ecosystem: 'evm',
      network: 'ethereum',
      type: 'testnet',
      isTestnet: true,
      chainId: 11155111,
      rpcUrl: RPC,
      nativeCurrency: { name: 'Test Ether', symbol: 'TETH', decimals: 18 },
    } as never,
    options
  );
  return { capability };
}

describe('lookupIdentityKeyPurpose', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('returns { status: "has" } when keyHasPurpose is true', async () => {
    mockReadContract.mockResolvedValueOnce(true);
    await expect(
      lookupIdentityKeyPurpose(RPC, ONCHAINID, HOLDER, IDENTITY_KEY_PURPOSE_MANAGEMENT)
    ).resolves.toEqual({ status: 'has' });
    expect(mockReadContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: ONCHAINID,
        functionName: 'keyHasPurpose',
        args: [addressKeyHash(HOLDER), BigInt(IDENTITY_KEY_PURPOSE_MANAGEMENT)],
      })
    );
  });

  it('returns { status: "lacks" } when keyHasPurpose is false', async () => {
    mockReadContract.mockResolvedValueOnce(false);
    await expect(
      lookupIdentityKeyPurpose(RPC, ONCHAINID, HOLDER, IDENTITY_KEY_PURPOSE_MANAGEMENT)
    ).resolves.toEqual({ status: 'lacks' });
  });

  it('returns { status: "read_failed", cause } on RPC failure — does NOT return lacks', async () => {
    const rpcError = new Error('rpc down');
    mockReadContract.mockRejectedValueOnce(rpcError);
    const result = await lookupIdentityKeyPurpose(
      RPC,
      ONCHAINID,
      HOLDER,
      IDENTITY_KEY_PURPOSE_MANAGEMENT
    );
    expect(result.status).toBe('read_failed');
    if (result.status === 'read_failed') {
      expect(result.cause).toBe(rpcError);
    }
    expect(result).not.toEqual({ status: 'lacks' });
  });
});

describe('through the capability surface — hasIdentityKeyPurpose', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  const input = {
    onchainId: ONCHAINID,
    address: HOLDER,
    purpose: IDENTITY_KEY_PURPOSE_MANAGEMENT,
  };

  it('returns { status: "has" } when the holder holds the purpose', async () => {
    mockReadContract.mockResolvedValueOnce(true);
    const { capability } = makeCapability();
    await expect(capability.hasIdentityKeyPurpose(input)).resolves.toEqual({ status: 'has' });
  });

  it('returns { status: "lacks" } when the holder does not hold the purpose', async () => {
    mockReadContract.mockResolvedValueOnce(false);
    const { capability } = makeCapability();
    await expect(capability.hasIdentityKeyPurpose(input)).resolves.toEqual({ status: 'lacks' });
  });

  it('returns { status: "read_failed", cause } on RPC error — and does NOT throw or return lacks', async () => {
    const rpcError = new Error('rpc down');
    mockReadContract.mockRejectedValueOnce(rpcError);
    const { capability } = makeCapability();

    const lookup = await capability.hasIdentityKeyPurpose(input);

    expect(lookup.status).toBe('read_failed');
    if (lookup.status === 'read_failed') {
      expect(lookup.cause).toBe(rpcError);
    }
    expect(lookup).not.toEqual({ status: 'lacks' });
  });
});
