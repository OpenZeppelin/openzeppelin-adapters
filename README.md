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

| Package | Description |
| ------- | ----------- |
| `@openzeppelin/adapter-evm` | EVM-compatible chains (Ethereum, Polygon, etc.) |
| `@openzeppelin/adapter-evm-core` | Shared EVM core (internal, bundled) |
| `@openzeppelin/adapter-midnight` | Midnight Network |
| `@openzeppelin/adapter-polkadot` | Polkadot ecosystem |
| `@openzeppelin/adapter-solana` | Solana (scaffolding only) |
| `@openzeppelin/adapter-stellar` | Stellar |

## Prerequisites

- Node.js >= 20.19.0
- pnpm 10.x

## Quick Start

```bash
pnpm install
pnpm build
pnpm test
```

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
