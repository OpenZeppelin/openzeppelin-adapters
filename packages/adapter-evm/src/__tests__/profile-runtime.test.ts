import { beforeEach, describe, expect, it, vi } from 'vitest';

const walletState = { address: undefined as string | undefined };
const contractLoadingLoadSpy = vi.fn(async () => ({ functions: [] }));
const executionSignAndBroadcastSpy = vi.fn(async () => ({
  txHash: walletState.address ?? 'missing',
}));
const queryLoadContractSpy = vi.fn(
  async (loadContract: ((source: unknown) => Promise<unknown>) | undefined) =>
    loadContract?.({ contractAddress: '0x1234' })
);

vi.mock('../capabilities', () => ({
  createAccessControl: vi.fn(
    (
      _config: unknown,
      options?: {
        signAndBroadcast?: (
          transactionData: unknown,
          executionConfig: unknown,
          onStatusChange?: ((status: string, details: unknown) => void) | undefined
        ) => Promise<{ txHash: string }>;
      }
    ) => ({
      registerContract: vi.fn(),
      grantRole: vi.fn(async () => {
        if (!options?.signAndBroadcast) return { id: 'no-execution' };
        const result = await options.signAndBroadcast({}, { type: 'eoa' }, () => undefined);
        return { id: result.txHash };
      }),
      dispose: vi.fn(),
    })
  ),
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
    signAndBroadcast: executionSignAndBroadcastSpy,
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
      walletState.address = '0xabc123';
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

vi.mock('@openzeppelin/adapter-evm-core', async () => {
  const actual = await vi.importActual<typeof import('@openzeppelin/adapter-evm-core')>(
    '@openzeppelin/adapter-evm-core'
  );

  return {
    ...actual,
    createAccessControl: vi.fn(
      (
        _config: unknown,
        options: {
          signAndBroadcast: (
            transactionData: unknown,
            executionConfig: unknown,
            onStatusChange?: ((status: string, details: unknown) => void) | undefined
          ) => Promise<{ txHash: string }>;
        }
      ) => ({
        registerContract: vi.fn(),
        grantRole: vi.fn(async () => {
          const result = await options.signAndBroadcast({}, { type: 'eoa' }, () => undefined);
          return { id: result.txHash };
        }),
        dispose: vi.fn(),
      })
    ),
  };
});

describe('EVM profile runtimes', () => {
  beforeEach(() => {
    walletState.address = undefined;
    contractLoadingLoadSpy.mockClear();
    executionSignAndBroadcastSpy.mockClear();
    queryLoadContractSpy.mockClear();
  });

  it('shares runtime wallet state across wallet, execution, and access-control capabilities', async () => {
    const { ethereumSepolia } = await import('../networks');
    const { createRuntime } = await import('../profiles/shared');

    const runtime = createRuntime('operator', ethereumSepolia);

    expect(runtime.execution?.validateExecutionConfig({})).toBe(false);

    await runtime.wallet!.connectWallet('injected');

    expect(runtime.wallet!.getWalletConnectionStatus().address).toBe('0xabc123');
    expect(runtime.execution?.validateExecutionConfig({})).toBe(true);
    await expect(runtime.accessControl!.grantRole('0xcontract', 'ROLE', '0xuser')).resolves.toEqual(
      {
        id: '0xabc123',
      }
    );
    expect(executionSignAndBroadcastSpy).toHaveBeenCalledTimes(1);
  }, 10000);

  it('reuses the runtime contract-loading capability for query composition', async () => {
    const { ethereumSepolia } = await import('../networks');
    const { createRuntime } = await import('../profiles/shared');

    const runtime = createRuntime('viewer', ethereumSepolia);

    await runtime.query!.queryViewFunction('0x1234', 'balanceOf', []);

    expect(queryLoadContractSpy).toHaveBeenCalledTimes(1);
    expect(contractLoadingLoadSpy).toHaveBeenCalledWith({ contractAddress: '0x1234' });
  });
});
