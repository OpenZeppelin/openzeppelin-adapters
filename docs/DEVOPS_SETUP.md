# DevOps Setup: OpenZeppelin Adapters

**Repository**: OpenZeppelin/openzeppelin-adapters  
**Purpose**: Release credentials, provenance configuration, and CI setup for adapter package publishing

## Overview

The adapter repository publishes packages under the `@openzeppelin/adapter-*` namespace. Release automation requires:

- npm publish credentials for `@openzeppelin` scope
- GitHub App or PAT for release PR creation and workflow triggers
- Provenance attestation for published packages

## Prerequisites

- Access to create and configure the `OpenZeppelin/openzeppelin-adapters` repository
- npm publish permissions for `@openzeppelin/adapter-*` packages
- GitHub Actions secrets configured for the repository

## Release Credentials

### npm

- **NPM_TOKEN**: npm automation token with publish permissions for `@openzeppelin` scope
- Token must be configured in GitHub repository secrets
- Used by publish workflows for RC and stable publication

### GitHub

- **GITHUB_TOKEN** (provided by Actions): Used for checkout, release PR creation, and provenance
- For cross-repo or release PR automation, a PAT or GitHub App token may be required

## Provenance Setup

Stable releases MUST produce verifiable provenance attestations. Configure:

1. **Provenance generation**: Use `actions/attest-build-provenance` or equivalent in the publish workflow
2. **Signing**: Ensure npm provenance is enabled for the publish step
3. **Verification**: Consumers can verify package integrity via `npm audit signatures`

## Release Expectations

### RC Publication

- Merges to `main` trigger RC publication to the npm `rc` dist-tag
- RC packages are available for staging validation before stable release
- No downstream sync commits; consumers resolve from published metadata

### Stable Publication

- Occurs only after the release PR is merged
- Release PR is created/updated by Changesets on merges to `main`
- Stable packages include provenance attestation

### Release PR Flow

1. Changes merged to `main` → Changesets creates/updates release PR
2. Maintainer reviews and merges release PR
3. Stable publish workflow runs
4. Packages published to npm with provenance

## CI Configuration

- **prepare** action: Checkout, pnpm setup, Node 22, `pnpm install-deps`
- **ci.yml**: Lint, typecheck, test, build
- **publish.yml**: Stable release publication
- **publish-rc.yml**: RC publication

## References

- [RUNBOOK.md](./RUNBOOK.md) – Release operations and troubleshooting
- Operational contracts (release ownership, channels, export version) are defined in the ui-builder migration spec
