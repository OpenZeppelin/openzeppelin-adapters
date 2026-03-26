# OpenZeppelin Adapters

> OpenZeppelin Ecosystem Adapters are a set of modular, chain-specific integration packages that bridge the gap between blockchain ecosystems and developer tooling. Built around a standardized `ContractAdapter` interface, each adapter encapsulates everything needed to interact with a specific blockchain — contract loading and schema parsing, type mapping to UI-friendly form fields, transaction execution (with pluggable strategies like EOA and Relayer), wallet connection, and network configuration — while keeping the consuming application completely chain-agnostic. Today, production adapters exist for EVM (Ethereum, Polygon, and other compatible chains), Stellar (Soroban), Midnight (with full zero-knowledge proof orchestration), and Polkadot (EVM parachains).

## Overview

This repository contains the extracted adapter packages previously maintained in the `ui-builder` monorepo. Adapters are published under the `@openzeppelin/adapter-*` namespace and consumed by:

- [UI Builder](https://github.com/OpenZeppelin/ui-builder)
- [OpenZeppelin UI](https://github.com/OpenZeppelin/openzeppelin-ui)
- [Role Manager](https://github.com/OpenZeppelin/role-manager)
- [RWA Wizard](https://github.com/OpenZeppelin/rwa-wizard)
- Any application that needs to interact with a specific blockchain

## Packages

| Package                          | Description                                     |
| -------------------------------- | ----------------------------------------------- |
| `@openzeppelin/adapter-evm`      | EVM-compatible chains (Ethereum, Polygon, etc.) |
| `@openzeppelin/adapter-evm-core` | Shared EVM core (internal, bundled)             |
| `@openzeppelin/adapter-midnight` | Midnight Network                                |
| `@openzeppelin/adapter-polkadot` | Polkadot ecosystem                              |
| `@openzeppelin/adapter-solana`   | Solana (scaffolding only)                       |
| `@openzeppelin/adapter-stellar`  | Stellar                                         |

## Unified Capability Model

All adapters follow the same high-level model, so apps can stay mostly chain-agnostic:

- 🧩 **Shared interface**: built around the same `ContractAdapter` shape.
- 🌐 **Network config**: wraps chain IDs, RPCs, explorers, and env-specific settings.
- 📄 **Contract loading**: turns chain-native metadata into a shared schema.
- 🧠 **Type mapping**: converts contract params into UI-friendly form fields.
- 🔄 **Input/output transforms**: parses user input and formats query results.
- 🔍 **Read support**: handles view/query execution behind a common API.
- ✍️ **Transaction flows**: prepares, signs, and submits writes.
- 👛 **Wallet integration**: exposes wallet providers, hooks, and UI helpers where supported.
- ⚙️ **Validation and config**: centralizes RPC, explorer, and execution settings.
- 🧱 **Extensible design**: keeps ecosystem-specific logic modular and swappable.

## Adapter Feature Highlights

### `@openzeppelin/adapter-evm`

- Targets EVM-compatible chains such as Ethereum, Polygon, and similar networks.
- Loads contract ABIs from JSON input or explorer services.
- Maps Solidity types to chain-agnostic UI form fields.
- Parses complex user input, including arrays and structs, into EVM transaction calldata.
- Supports both read operations and transaction execution flows.
- Includes pluggable execution strategies for direct wallet signing (`EOA`) and OpenZeppelin Relayer-based submissions.
- Provides wallet integration built on Wagmi/Viem plus React UI helpers for consumer apps.
- Exposes curated network configurations for mainnets and testnets.

### `@openzeppelin/adapter-evm-core`

- Internal shared package used by EVM-oriented adapters.
- Centralizes reusable EVM functionality such as ABI loading, schema transformation, proxy handling, input/output conversion, and transaction formatting.
- Handles explorer API key and RPC URL resolution with override support from user settings and app configuration.
- Provides shared wallet infrastructure and RainbowKit-related utilities.
- Keeps EVM-specific logic consistent across `adapter-evm` and `adapter-polkadot`.

### `@openzeppelin/adapter-polkadot`

- Adapts the Polkadot ecosystem through EVM-compatible networks such as Polkadot Hub, Kusama Hub, Moonbeam, and Moonriver.
- Reuses the shared EVM core for ABI loading, queries, transaction execution, and wallet infrastructure.
- Exposes Polkadot-focused network metadata, including relay chain and network category distinctions.
- Supports the same core execution patterns as EVM adapters, including direct wallet execution and relayer-compatible flows.
- Ships React wallet provider utilities for consumer applications.
- Is structured to support future native Substrate/Wasm modules in addition to the current EVM path.

### `@openzeppelin/adapter-stellar`

- Implements a full Soroban adapter for Stellar public and test networks.
- Loads contract definitions and transforms them into the shared `ContractSchema`.
- Maps Soroban types to builder form fields and validates user input before execution.
- Parses form values into Soroban `ScVal` arguments and formats query results for display.
- Supports both `EOA` and OpenZeppelin Relayer transaction strategies.
- Includes wallet integration through Stellar Wallets Kit and React UI provider/hooks.
- Adds first-class Access Control and Ownable support, including role queries, ownership actions, and optional indexer-backed historical lookups.
- Detects and supports Stellar Asset Contracts (SACs), including dynamic specification loading.

### `@openzeppelin/adapter-midnight`

- Enables browser-based interaction with Midnight contracts using uploaded artifact bundles.
- Supports ZIP-based artifact ingestion, contract evaluation, and zero-knowledge proof orchestration entirely from the client.
- Integrates with Lace wallet for signing and execution.
- Handles organizer-only runtime secrets as in-memory execution-time inputs rather than persisted configuration.
- Uses lazy-loaded browser polyfills so Midnight-specific runtime requirements do not affect other ecosystems.
- Supports exporting self-contained applications that bundle Midnight contract artifacts for later use.

### `@openzeppelin/adapter-solana`

- Provides the initial structure for a future Solana adapter.
- Defines Solana network configurations and package boundaries for program loading, mapping, validation, transactions, and wallet integration.
- Serves as scaffolding for future implementation of IDL loading, instruction building, query formatting, and wallet-based transaction execution.
- Is intentionally documented as not yet production-ready.

## Adapter Diagram

```mermaid
flowchart TD
    App[Consumer app] --> Interface[ContractAdapter interface]
    Interface --> EVM[@openzeppelin/adapter-evm]
    Interface --> Polkadot[@openzeppelin/adapter-polkadot]
    Interface --> Stellar[@openzeppelin/adapter-stellar]
    Interface --> Midnight[@openzeppelin/adapter-midnight]
    Interface --> Solana[@openzeppelin/adapter-solana]
    EVM --> Core[@openzeppelin/adapter-evm-core]
    Polkadot --> Core
```

## Prerequisites

- Node.js >= 20.19.0
- pnpm 10.x

## Quick Start

```bash
pnpm install
pnpm build
pnpm test
```

## Local Development From Consumer Repos

Consumer repos should point at a sibling `openzeppelin-adapters` checkout through `LOCAL_ADAPTERS_PATH`.

```bash
LOCAL_ADAPTERS_PATH=/path/to/openzeppelin-adapters pnpm dev:local
```

The local-switch workflow is driven by `LOCAL_ADAPTERS_PATH`, `pnpm dev:adapters:local`, and `pnpm dev:npm`.

Compatibility notes:

- `LOCAL_ADAPTERS_PATH` is the canonical env var across `ui-builder`, `openzeppelin-ui`, `role-manager`, and `rwa-wizard`.
- `LOCAL_UI_BUILDER_PATH` remains supported as a temporary compatibility alias in consumer `.pnpmfile.cjs` hooks and helper scripts.
- When the configured path is wrong, consumer pnpm hooks should now fail with a direct error that names the resolved path and the env vars to update.

## Available Scripts

- `pnpm build` - Build all adapter packages
- `pnpm test` - Run tests
- `pnpm lint` - Run ESLint
- `pnpm lint:adapters` - Validate adapter implementations against the ContractAdapter interface
- `pnpm lint:fix` - Fix ESLint issues
- `pnpm format` - Format code with Prettier
- `pnpm format:check` - Check formatting without making changes
- `pnpm typecheck` - Type check all packages
- `pnpm fix-all` - Run Prettier and ESLint fix

## Documentation

- [DEVOPS_SETUP.md](docs/DEVOPS_SETUP.md) – Release credentials, provenance, and CI setup
- [RUNBOOK.md](docs/RUNBOOK.md) – Release operations and troubleshooting

## License

[AGPL v3](https://www.gnu.org/licenses/agpl-3.0)
