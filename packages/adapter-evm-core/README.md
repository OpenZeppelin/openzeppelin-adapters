# @openzeppelin/adapter-evm-core

Core EVM blockchain functionality extracted from `adapter-evm`. This package provides reusable, stateless modules for building EVM-compatible blockchain adapters.

> **Note**: This is an **internal workspace package** (`"private": true`). It is not published to npm. Consuming adapters bundle this package internally via `tsup` with `noExternal` configuration.

## Purpose

This package enables code reuse across multiple EVM-compatible adapters:

- **adapter-evm**: The primary Ethereum/EVM adapter
- **adapter-polkadot**: Polkadot ecosystem adapter with EVM support (Moonbeam, Polkadot Hub)
- **Future adapters**: Any new EVM-compatible blockchain adapter

## Module Structure

```
adapter-evm-core/
├── src/
│   ├── abi/            # ABI loading, transformation, comparison
│   ├── configuration/  # RPC and Explorer configuration
│   ├── mapping/        # Type mapping and form field generation
│   ├── proxy/          # Proxy detection and implementation resolution
│   ├── query/          # View function querying
│   ├── transaction/    # Transaction formatting, execution strategies
│   ├── transform/      # Input parsing and output formatting
│   ├── types/          # TypeScript type definitions
│   ├── utils/          # Utility functions
│   ├── validation/     # Execution configuration validation
│   ├── wallet/         # Wallet infrastructure and RainbowKit utilities
│   └── index.ts        # Public exports
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── vitest.config.ts
```

## Key Modules

### ABI Module

Load and transform contract ABIs from various sources:

```typescript
import {
  abiComparisonService,
  loadAbiFromEtherscan,
  loadAbiFromSourcify,
  loadEvmContract,
  transformAbiToSchema,
} from '@openzeppelin/adapter-evm-core';
```

### Transaction Module

Execute transactions with different strategies:

```typescript
import {
  EoaExecutionStrategy,
  executeEvmTransaction,
  formatEvmTransactionData,
  RelayerExecutionStrategy,
} from '@openzeppelin/adapter-evm-core';
```

### Wallet Module

Wallet implementation interface and RainbowKit utilities:

```typescript
import {
  connectAndEnsureCorrectNetworkCore,
  createUiKitManager,
  generateRainbowKitConfigFile,
  WagmiWalletImplementation,
} from '@openzeppelin/adapter-evm-core';
```

### Configuration Module

RPC and explorer configuration resolution:

```typescript
import {
  resolveExplorerConfig,
  resolveRpcUrl,
  testEvmRpcConnection,
  validateEvmRpcEndpoint,
} from '@openzeppelin/adapter-evm-core';
```

#### Explorer API Key Resolution

The `resolveExplorerConfig` function resolves explorer API keys based on network configuration. It checks multiple sources in this priority order:

1. **User-configured settings** (via UI, stored in localStorage)
2. **Etherscan V2 global key** (for networks with `supportsEtherscanV2: true`)
3. **Global service configs** (e.g., `VITE_APP_CFG_SERVICE_ROUTESCAN_API_KEY`)
4. **Network service configs** (e.g., `VITE_APP_CFG_API_KEY_ETHERSCAN_MAINNET`)
5. **Network defaults** (from network configuration)

Network configurations specify a `primaryExplorerApiIdentifier` (e.g., `"etherscan-v2"`, `"routescan"`) that determines which API key to use. For example:

```typescript
// Network config with Etherscan V2 support
{
  supportsEtherscanV2: true,
  primaryExplorerApiIdentifier: 'etherscan-v2',
  // API key resolved from VITE_APP_CFG_SERVICE_ETHERSCANV2_API_KEY
}

// Network config with Routescan (V1-compatible)
{
  supportsEtherscanV2: false,
  primaryExplorerApiIdentifier: 'routescan',
  // API key resolved from VITE_APP_CFG_SERVICE_ROUTESCAN_API_KEY
}
```

#### RPC URL Resolution

The `resolveRpcUrl` function resolves RPC URLs with this priority:

1. **User-configured settings** (via UI)
2. **App config overrides** (via environment variables or `app.config.json`)
3. **Network defaults** (from network configuration)

## Usage in Adapters

### Adding as a Dependency

In your adapter's `package.json`:

```json
{
  "dependencies": {
    "@openzeppelin/adapter-evm-core": "workspace:*"
  }
}
```

### Bundling Configuration

In your adapter's `tsup.config.ts`, ensure the core package is bundled:

```typescript
export default defineConfig({
  // ...
  noExternal: ['@openzeppelin/adapter-evm-core'],
});
```

### Implementing Wallet Functionality

Adapters implement the `EvmWalletImplementation` interface:

```typescript
import { WagmiWalletImplementation } from '@openzeppelin/adapter-evm-core';

// The WagmiWalletImplementation class provides a ready-to-use implementation
const walletImpl = new WagmiWalletImplementation(config);
```

## Design Principles

1. **Stateless Modules**: All functions accept configuration as parameters (no global state)
2. **Dependency Injection**: Network configs, RPC URLs, and wallet implementations passed explicitly
3. **Error Propagation**: Descriptive errors with context, no silent failures
4. **Type Safety**: Full TypeScript with strict mode enabled
5. **Tree-Shakeable**: Individual function exports for optimal bundling

## Relationship with Adapters

```
┌─────────────────────────────────────────────────┐
│                  adapter-evm                     │
│  (Ethereum mainnet/testnet specific logic)      │
│  - Network configurations                        │
│  - Ecosystem-specific UI components             │
│                      │                           │
│                      ▼                           │
│     ┌───────────────────────────────┐           │
│     │      adapter-evm-core          │           │
│     │   (Shared EVM functionality)   │           │
│     │   - ABI loading/transformation │           │
│     │   - Transaction execution      │           │
│     │   - Wallet infrastructure      │           │
│     └───────────────────────────────┘           │
│                      ▲                           │
│                      │                           │
├─────────────────────────────────────────────────┤
│               adapter-polkadot                   │
│  (Polkadot ecosystem specific logic)            │
│  - Polkadot Hub, Moonbeam networks              │
│  - Polkadot-specific UI components              │
└─────────────────────────────────────────────────┘
```

## Testing

Run tests with:

```bash
pnpm --filter @openzeppelin/adapter-evm-core test
```

## RI capability modules (ERC-3643 / ERC-4626 / IRS)

Server-side Tier 3 capabilities for the Tokenized Deposits reference implementation. Each module vendors pinned ABI fragments (no Solidity npm dependency) and exposes a factory via `@openzeppelin/adapter-evm/{erc3643,erc4626,irs}`.

| Module | Path | Vendored ABI | Pinned upstream |
|--------|------|--------------|-----------------|
| ERC-3643 (T-REX) | `src/erc3643/` | `src/erc3643/abi.ts` | `@tokenysolutions/t-rex@4.1.6` ([ERC-3643/ERC-3643](https://github.com/ERC-3643/ERC-3643)) |
| ERC-4626 | `src/erc4626/` | `src/erc4626/abi.ts` | `@openzeppelin/contracts@5.x` `IERC4626.sol` (EIP-4626 Final) |
| IRS / ONCHAINID | `src/irs/` | `src/irs/abis.ts` | `@tokenysolutions/t-rex@4.1.6` + `@onchain-id/solidity@2.2.1` |

### ABI refresh procedure (FR-017a)

Re-syncing vendored fragments is a **deliberate, Changeset-tracked** change — never silent drift.

1. **Verify upstream**: Compare each function signature verbatim against the pinned repo's `main` branch (or the pinned npm release tag). Update the provenance table in the module's `abi.ts` / `abis.ts` header with the verification date.
2. **Update fragments**: Edit the vendored ABI in `src/<module>/abi.ts` (or `abis.ts`). Run the module's tests: `pnpm --filter @openzeppelin/adapter-evm-core exec vitest run src/<module>`.
3. **Record the change**: Add a Changeset noting the upstream version bump and which capability is affected.
4. **Release**: Follow the cross-repo sequence in `specs/002-ri-evm-capabilities/quickstart.md` (ui-types first, then adapters).

Provenance headers in each ABI file are the source of truth for the exact pinned versions and verification dates.

## License

AGPL-3.0
