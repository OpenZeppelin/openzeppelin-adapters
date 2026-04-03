import { beforeEach, describe, expect, it, vi } from 'vitest';

const walletState = { address: undefined as string | undefined };
const contractLoadingLoadSpy = vi.fn(async () => ({ functions: [] }));
const queryLoadContractSpy = vi.fn(
  async (loadContract: ((source: unknown) => Promise<unknown>) | undefined) =>
    loadContract?.({ contractAddress: 'C1234' })
);

vi.mock('../capabilities', () => ({
  createAccessControl: vi.fn(() => ({
    registerContract: vi.fn(),
    grantRole: vi.fn(async () => ({ id: walletState.address ?? 'missing' })),
    dispose: vi.fn(),
  })),
  createAddressing: vi.fn(() => ({
    isValidAddress: () => true,
  })),
  createContractLoading: vi.fn(() => ({
    loadContract: contractLoadingLoadSpy,
    getContractDefinitionInputs: () => [],
    dispose: vi.fn(),
  })),
  createExecution: vi.fn(() => ({
    formatTransactionData: vi.fn().mockResolvedValue({}),
    signAndBroadcast: vi.fn(async () => ({ txHash: walletState.address ?? 'missing' })),
    getSupportedExecutionMethods: vi.fn().mockResolvedValue([]),
    validateExecutionConfig: vi.fn(() => Boolean(walletState.address)),
    dispose: vi.fn(),
  })),
  createExplorer: vi.fn(() => ({
    getExplorerUrl: () => null,
  })),
  createNetworkCatalog: vi.fn(() => ({
    getNetworks: () => [],
  })),
  createQuery: vi.fn(
    (_config: unknown, options?: { loadContract?: (source: unknown) => Promise<unknown> }) => ({
      queryViewFunction: vi.fn(async () => queryLoadContractSpy(options?.loadContract)),
      formatFunctionResult: vi.fn((value: unknown) => value),
      getCurrentBlock: vi.fn().mockResolvedValue(1),
      dispose: vi.fn(),
    })
  ),
  createRelayer: vi.fn(() => ({
    getRelayers: vi.fn().mockResolvedValue([]),
    getRelayer: vi.fn().mockResolvedValue(null),
    getNetworkServiceForms: () => [],
    getDefaultServiceConfig: () => ({}),
    dispose: vi.fn(),
  })),
  createSchema: vi.fn(() => ({
    getWritableFunctions: () => [],
    isViewFunction: () => false,
    dispose: vi.fn(),
  })),
  createTypeMapping: vi.fn(() => ({
    mapParameterTypeToFieldType: () => ({ type: 'text' }),
    getCompatibleFieldTypes: () => [],
    generateDefaultField: () => null,
    getTypeMappingInfo: () => [],
    dispose: vi.fn(),
  })),
  createUiKit: vi.fn(() => ({
    configureUiKit: vi.fn().mockResolvedValue(undefined),
    getAvailableUiKits: vi.fn().mockResolvedValue([]),
    dispose: vi.fn(),
  })),
  createUiLabels: vi.fn(() => ({
    getUiLabels: () => ({}),
  })),
  createWallet: vi.fn(() => ({
    supportsWalletConnection: () => true,
    getAvailableConnectors: vi.fn().mockResolvedValue([]),
    connectWallet: vi.fn(async () => {
      walletState.address = 'GBTESTACCOUNT';
    }),
    disconnectWallet: vi.fn(async () => {
      walletState.address = undefined;
    }),
    getWalletConnectionStatus: vi.fn(() => ({
      isConnected: Boolean(walletState.address),
      address: walletState.address,
    })),
    dispose: vi.fn(async () => {
      walletState.address = undefined;
    }),
  })),
}));

describe('Stellar profile runtimes', () => {
  beforeEach(() => {
    walletState.address = undefined;
    contractLoadingLoadSpy.mockClear();
    queryLoadContractSpy.mockClear();
  });

  it('shares runtime wallet state across wallet, execution, and access-control capabilities', async () => {
    const { stellarTestnet } = await import('../networks');
    const { createRuntime } = await import('../profiles/shared-state');

    const runtime = createRuntime('operator', stellarTestnet);

    expect(runtime.execution?.validateExecutionConfig({})).toBe(false);

    await runtime.wallet!.connectWallet('albedo');

    expect(runtime.wallet!.getWalletConnectionStatus().address).toBe('GBTESTACCOUNT');
    expect(runtime.execution?.validateExecutionConfig({})).toBe(true);
    await expect(runtime.accessControl!.grantRole('C1234', 'ROLE', 'GBUSER')).resolves.toEqual({
      id: 'GBTESTACCOUNT',
    });
  });

  it('reuses the runtime contract-loading capability for query composition', async () => {
    const { stellarTestnet } = await import('../networks');
    const { createRuntime } = await import('../profiles/shared-state');

    const runtime = createRuntime('viewer', stellarTestnet);

    await runtime.query!.queryViewFunction('C1234', 'balanceOf', []);

    expect(queryLoadContractSpy).toHaveBeenCalledTimes(1);
    expect(contractLoadingLoadSpy).toHaveBeenCalledWith({ contractAddress: 'C1234' });
  });
});
