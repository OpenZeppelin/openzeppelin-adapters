# OpenZeppelin Adapters Constitution

## Core Principles

### I. Capability-Compliant, Adapter-Led Architecture (NON-NEGOTIABLE)

- Every adapter package MUST implement capability interfaces from
`@openzeppelin/ui-types`, organized in 3 tiers: Tier 1 (Addressing, Explorer,
NetworkCatalog, UiLabels), Tier 2 (ContractLoading, Schema, TypeMapping,
Query), and Tier 3 (Execution, Wallet, UiKit, Relayer, AccessControl).
- A minimal adapter MUST implement all 4 Tier 1 capabilities. Higher-tier
capabilities are optional; unsupported profiles throw `UnsupportedProfileError`
at `createRuntime` time listing missing capabilities.
- Adapters are published under the `@openzeppelin/adapter-*` namespace as
independently versioned npm packages with sub-path exports for physical tier
isolation.
- The `@openzeppelin/adapter-evm` package is the reference implementation; all
new adapters MUST mirror its `src/capabilities/` + `src/profiles/` structure,
naming conventions, and export patterns. `@openzeppelin/adapter-stellar`
mirrors EVM wherever applicable.
- Each adapter MUST expose `ecosystemDefinition` conforming to `EcosystemExport`
with `capabilities` (a `CapabilityFactoryMap`) and `createRuntime` (a function
accepting `ProfileName`, `NetworkConfig`, and optional options).
- Adapters MUST NOT extend capability interfaces beyond what is defined in
`@openzeppelin/ui-types` unless coordinated with `openzeppelin-ui` maintainers
and validated by the `lint:adapters` capability conformance check.
- `@openzeppelin/adapter-evm-core` centralizes reusable EVM capability
implementations (ABI loading, schema transformation, proxy handling,
input/output conversion, transaction formatting, wallet infrastructure) shared
by `adapter-evm` and `adapter-polkadot`.
- `@openzeppelin/adapter-runtime-utils` centralizes shared profile composition,
runtime lifecycle guards, and runtime-scoped capability memoization across all
adapters.
- Rationale: Guarantees that consuming applications (UI Builder, OpenZeppelin UI,
Role Manager, RWA Wizard) can compose narrow capabilities or request
pre-composed profiles without knowledge of chain internals, preserving
ecosystem neutrality and enabling lightweight consumers.

### II. Chain-Specific Encapsulation (NON-NEGOTIABLE)

- All blockchain-specific logic, SDKs, dependencies, and polyfills MUST live
exclusively inside adapter packages; they MUST NOT leak into consumer
chain-agnostic code.
- Each adapter owns its network concerns: chain IDs, RPC endpoints, explorer
integrations, wallet providers, and transaction strategies.
- Adapter packages MUST NOT import or depend on other adapters' chain SDKs;
cross-ecosystem coupling is forbidden.
- Validation rules (e.g., `isValidAddress`) MUST be implemented per-chain inside
the adapter; chain-agnostic consumers call these through the adapter interface.
- Runtime secrets (API keys, RPC URLs) MUST be resolved through configuration
and environment overrides, never hardcoded.
- Rationale: Adapters are the boundary where chain diversity is absorbed; strict
encapsulation prevents chain-specific concerns from propagating into the
shared ecosystem.

### III. Type Safety & Code Quality (NON-NEGOTIABLE)

- TypeScript strict mode MUST be enabled across all packages; `any` types are
disallowed without explicit, documented justification.
- `console` usage in source code is prohibited; use `logger` from
`@openzeppelin/ui-utils` instead (exceptions only in tests or scripts).
- Logging is disabled by default outside development; enable explicitly via
`logger.configure({ enabled: true, level })`.
- Public APIs (exported functions, types, components, hooks) MUST include JSDoc
annotations describing purpose, parameters, return values, and usage.
- React components MUST be typed with explicit props interfaces; hooks MUST have
explicit return types.
- Shared linting and formatting rules apply across the monorepo; `pnpm lint` and
`pnpm format:check` MUST pass before merge.
- Rationale: Enforces consistent quality gates, prevents regressions, and ensures
reliable IntelliSense and documentation generation for downstream consumers.

### IV. Consumer-First API Design (NON-NEGOTIABLE)

- Adapter APIs MUST prioritize ease of use for consuming applications; complex
chain-specific internals MUST NOT leak into the public interface.
- Breaking changes to capability interfaces or any exported adapter API MUST:
  - Be discussed in an issue or RFC before implementation.
  - Include migration documentation in the package CHANGELOG.
  - Use conventional commits (`feat!`, `BREAKING CHANGE:`) for visibility.
  - Be coordinated with `openzeppelin-ui` maintainers when capability interfaces
  change.
- New adapter capabilities SHOULD be validated against real consumer scenarios
(UI Builder, OpenZeppelin UI, Role Manager) before finalizing the API.
- Local development against consumer repos MUST be supported via
`LOCAL_ADAPTERS_PATH` pointing to a sibling checkout.
- Rationale: Adapters exist to serve consuming applications; consumer needs drive
design decisions and release cadence.

### V. Shared Core & Reuse-First Development (NON-NEGOTIABLE)

- Existing utilities, types, and patterns MUST be preferred over new
implementations unless reuse compromises correctness or performance.
- Logic shared between adapters (currently EVM-based) belongs in
`@openzeppelin/adapter-evm-core`; avoid duplicating chain-agnostic behavior
across adapter packages.
- Shared types MUST live in `@openzeppelin/ui-types`; do not duplicate type
definitions.
- Shared utilities (e.g., `logger`, `cn`, ID generation) MUST be imported from
`@openzeppelin/ui-utils`; do not re-implement.
- Conduct thorough codebase analysis before introducing new modules; document
rationale and rejected alternatives in specs and plans.
- Reviewers MUST enforce the reuse-first gate: verify reuse attempts before
approving new modules.
- Rationale: Minimizes redundancy, keeps abstractions aligned across adapters,
and streamlines onboarding for new ecosystem contributors.

### VI. Testing & Test-Driven Development (NON-NEGOTIABLE)

- Vitest is the standard test runner; each package MUST have its own test
configuration extending shared helpers from `@openzeppelin/adapters-vite`.
- All business logic (contract loading, schema transforms, type mapping, input
parsing, transaction strategies, validators, network config) MUST follow TDD:
write failing tests first, implement minimal code, then refactor.
- React components and wallet UI helpers are exempt from strict TDD but SHOULD
have interaction tests (e.g., Testing Library) where feasible.
- Coverage metrics are tracked in CI; meaningful coverage of critical paths is
required, not arbitrary line-coverage targets.
- Each adapter's documentation (README, architectural references) MUST remain
current when interfaces or capabilities change.
- Rationale: Preserves confidence in chain-critical logic that is difficult to
debug in production and enforces disciplined implementation sequencing.

### VII. Packaging, Build Integration & Release Management (NON-NEGOTIABLE)

- `pnpm` is the sole package manager; use `pnpm -r` for workspace commands.
- Build outputs MUST use the repository-standard Vite/tsup stack; packages MUST
ship proper `exports` configuration with explicit entry points.
- Each adapter MUST expose a `vite-config` entry that
`@openzeppelin/adapters-vite` merges for consumer build integration (plugins,
`resolve.dedupe`, `optimizeDeps`, `ssr.noExternal`).
- Versioning relies on Changesets; every PR affecting package functionality MUST
include a changeset file describing the change type (major/minor/patch) and
summary.
- Releases are triggered by merging the automated Changesets PR; CI publishes to
npm with provenance after tests, linting, and type checks pass.
- RC and stable release channels are supported; adapter version pins in consumer
export metadata MUST stay in sync.
- Peer dependencies (React, framework SDKs) MUST be declared, not bundled; keep
runtime dependencies minimal.
- Avoid barrel exports that cause tree-shaking issues; prefer explicit named
exports.
- Rationale: Maintains reproducible builds, enables independent adapter
versioning, and ensures consumers can upgrade selectively without breakage.

## Additional Constraints

- Adapter packages MUST NOT depend on consumer-level packages (`ui-builder`,
`openzeppelin-ui` app code); the dependency arrow is strictly one-directional.
- Data schemas and shared types have a single source of truth in
`@openzeppelin/ui-types`.
- Contract comparisons MUST operate on raw contract definitions (ABI/IDL/etc.),
not on internal `ContractSchema` representations.
- Avoid noisy logging; rely on structured, level-based logs only when
investigating issues.
- Security: do not hardcode secrets, API keys, or credentials; use runtime
configuration with override support from user settings and app configuration.
- Feature flags gate adapter functionality according to ecosystem readiness.
- Lazy-loaded polyfills and heavy SDKs (e.g., Midnight ZK runtime) MUST NOT
affect other adapters' bundle size or startup time.

## Development Workflow and Review Process

- Use `pnpm` for all tasks (`pnpm build`, `pnpm test`, `pnpm lint`,
`pnpm typecheck`, `pnpm format:check`, `pnpm fix-all`).
- `pnpm lint:adapters` validates adapter capability conformance (Tier 1
isolation and capability export structure); this check MUST pass before merge.
- Commit messages MUST follow Conventional Commits; scopes include adapter names
(e.g., `evm`, `stellar`, `midnight`, `polkadot`, `solana`, `evm-core`,
`adapters-vite`) and cross-cutting scopes (`deps`, `config`, `ci`, `docs`,
`tests`, `release`).
- PRs MUST:
  - Pass all CI checks (tests, lint, typecheck, `lint:adapters`).
  - Include a changeset for package changes.
  - Have at least one approval before merge.
- Code review enforces:
  - Capability interface compliance (implementations match `@openzeppelin/ui-types`).
  - Tier isolation (Tier 1 sub-path imports do not pull Tier 2/3 dependencies).
  - Chain-specific encapsulation (no cross-adapter SDK imports).
  - API stability (no unannounced breaking changes).
  - Reuse-first gate (verify reuse before approving new modules).
  - Documentation for new public APIs.
- **Local consumer testing**: Validate adapter changes against `ui-builder` and
`openzeppelin-ui` using the `LOCAL_ADAPTERS_PATH` workflow before merging
significant changes.
- New adapter contributions MUST follow the Adapter Architecture Guide
(`docs/ADAPTER_ARCHITECTURE.md`): capability factory structure, sub-path
exports, profile runtime composition, and strict capability interface
compliance.

## Governance

- This constitution supersedes other practices for architecture, quality, and
workflow standards; non-negotiable rules MUST be enforced during development
and review.
- Amendments require:
  - A documented proposal (issue or PR description).
  - Updates to relevant docs/READMEs.
  - Migration notes if affecting consumers.
  - Approval via PR review.
- Breaking changes to adapter public APIs or capability interfaces MUST:
  - Include a changeset with major version bump.
  - Provide explicit upgrade notes in CHANGELOG.
  - Coordinate with `openzeppelin-ui` and consuming repository maintainers.
  - Use conventional commits (`feat!`, `BREAKING CHANGE:`) for visibility.
- Repository-boundary changes affecting adapter ownership, release automation,
or local-development contracts MUST be ratified here before implementation
PRs are merged.
- CI enforces compliance; PRs violating constitutional rules MUST be corrected
before merge.
- Version Policy:
  - MAJOR: Breaking changes to public APIs or capability interfaces.
  - MINOR: New adapter capabilities, non-breaking additions.
  - PATCH: Bug fixes, documentation improvements, internal refactors.

**Version**: 2.0.0 | **Ratified**: 2026-03-30 | **Last Amended**: 2026-04-01