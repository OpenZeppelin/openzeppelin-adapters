# DevOps Setup: OpenZeppelin Adapters

**Repository**: OpenZeppelin/openzeppelin-adapters  
**Purpose**: Release credentials, provenance configuration, and CI setup for adapter package publishing

## Overview

The adapter repository publishes packages under the `@openzeppelin/adapter-*` namespace. Release automation requires:

- npm trusted publishing (OIDC) for `@openzeppelin` scope releases
- GitHub App or PAT for release PR creation and workflow triggers
- Provenance attestation for stable published packages

## Prerequisites

- Access to create and configure the `OpenZeppelin/openzeppelin-adapters` repository
- npm publish permissions for `@openzeppelin/adapter-*` packages
- GitHub Actions variables/secrets for the GitHub App (optional; no npm secrets required)

## Release Credentials

### npm

Cross-checked with [npm trusted publishers — Step 2](https://docs.npmjs.com/trusted-publishers#step-2-configure-your-cicd-workflow).

- **Trusted publishing (publish only)**: On npmjs.com → package Settings → Trusted publishing, set workflow filename to **`publish.yml`** (stable `push` to `main` and RC `workflow_dispatch` share this file; npm allows **one trusted publisher filename per package**).
- **Workflow requirements** (both release workflows):
  - `permissions.id-token: write` at workflow level
  - `actions/setup-node@v6` immediately before publish with `node-version: '24'`, `registry-url: 'https://registry.npmjs.org'`, `package-manager-cache: false`
  - No `NPM_TOKEN` on publish (OIDC only). Installs use the public registry and workspace packages — no npm secrets required.
  - npm CLI ≥ 11.5.1 (bundled with Node 24) and Node ≥ 22.14.0
- **`repository.url`** in each published package must match `https://github.com/OpenZeppelin/openzeppelin-adapters.git` (already set on `@openzeppelin/adapter-*`).
- **Provenance**: Generated automatically when publishing via trusted publishing from a public repo + public package; `NPM_CONFIG_PROVENANCE: true` in the workflow is optional redundancy.
- **After verification**: Consider package Settings → Publishing access → “Require 2FA and disallow tokens” for maximum security (trusted publishers keep working).

### GitHub

- **GITHUB_TOKEN** (provided by Actions): Used for checkout and basic API access
- **GH_APP_ID** + **GH_APP_PRIVATE_KEY** (repository variables + secret): Optional but recommended for `changesets/action` so release PRs and commits use a GitHub App identity (mirrors openzeppelin-ui / ui-builder patterns)
- If the GitHub App is not configured, workflows fall back to `github.token` (subject to default `GITHUB_TOKEN` permissions)

## Provenance Setup

Stable releases MUST produce verifiable provenance for published packages.

1. **OIDC / trusted publishing**: `publish.yml` requests `id-token: write` and authenticates to `registry.npmjs.org` via `actions/setup-node` (trusted publisher), so npm can attest the publishing workflow.
2. **Environment**: Publish steps set `NPM_CONFIG_PROVENANCE: true` so `pnpm changeset publish` requests npm provenance for eligible packages.
3. **Verification**: Consumers can inspect `npm view <package> provenance` after publish.

RC publishes use the same provenance flag where the registry accepts it; treat RC as staging validation, stable as the contractual provenance target.

## Release Expectations

### Release PR (Changesets)

- Merges to `main` that include new changeset files do **not** immediately bump `package.json` in that same merge unless you run the version flow locally; typically **changesets/action** opens or updates a **Version packages** PR.
- A maintainer reviews that PR; merging it applies synchronized version bumps across the **linked** adapter set (see `.changeset/config.json`).
- The **Release** workflow then publishes **stable** packages to the default npm dist-tag when the merge commit is processed.

### RC Publication

- Run **Release** manually (`workflow_dispatch` on `publish.yml`) when you want the linked public adapters on the npm `rc` dist-tag (after the intended commits are on `main`).
- Use this for staging validation before promoting stable releases.
- No downstream sync commits; consumers resolve versions from npm metadata.

### Stable Publication

- Follow the Changesets release PR merge; `publish.yml` runs `pnpm changeset publish --no-git-checks` with provenance enabled.
- `ui-builder` continues to own application staging/production deployment; it refreshes `apps/builder/src/export/versions.ts` via `pnpm update-export-versions` (adapter lines sourced from published npm metadata, or `LOCAL_ADAPTERS_PATH` for local overrides).

## CI Configuration

- **prepare** action: Checkout, pnpm 11+, Node 24, `pnpm install-deps` (no npm secrets); release uses `package-manager-cache: false`; `Configure npm trusted publishing` runs only before publish
- **ci.yml**: Lint, typecheck, test, build
- **publish.yml**: Changesets release PR + stable publish
- **publish.yml (RC path)**: `workflow_dispatch` runs the same SLSA + attestations path with Changesets prerelease (`pre enter rc`) and `changeset publish` to the `rc` dist-tag

## Package layout guard (post-extraction)

The following MUST remain true:

- `packages/` contains only `adapter-*` workspaces (`adapter-evm`, `adapter-evm-core`, `adapter-midnight`, `adapter-polkadot`, `adapter-solana`, `adapter-stellar`). There MUST NOT be legacy `@openzeppelin/ui-builder-adapter-*` wrapper packages or duplicate adapter trees.
- `pnpm-workspace.yaml` lists only `packages/*` (no stray paths).
- **publish.yml** MUST NOT reference legacy adapter package names or paths outside this monorepo.

## References

- [RUNBOOK.md](./RUNBOOK.md) – Release operations, rollout gate, troubleshooting
- [.changeset/README.md](../.changeset/README.md) – Maintainer flow for Changesets and RC
- Operational contracts: ui-builder `specs/012-adapter-monorepo-extraction/contracts/release-and-consumer-contracts.md`
