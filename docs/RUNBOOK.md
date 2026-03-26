# Runbook: OpenZeppelin Adapters

**Repository**: OpenZeppelin/openzeppelin-adapters  
**Purpose**: Release operations, troubleshooting, and operational procedures

## Overview

This runbook covers day-to-day release operations, recovery procedures, and validation checkpoints for the adapter monorepo.

## Release Operations

### RC Publication

**Trigger**: Manual — GitHub Actions → **Release RC** → Run workflow (against `main` or the branch you select)

**Flow**:

1. Ensure the target commit is merged to `main` (or run the workflow from the intended ref).
2. **Release RC** runs the full SLSA + publish pipeline (same shape as stable `publish.yml`), enters Changesets prerelease mode with the `rc` dist-tag, versions the pending release set, and publishes those prerelease versions to npm.
3. Consumers resolve the RC line via `npm install @openzeppelin/adapter-evm@rc` (or `dist-tags.rc`).

**Verification**:

```bash
npm view @openzeppelin/adapter-evm dist-tags.rc
```

### Stable Publication

**Trigger**: Merge of the Changesets release PR

**Flow**:

1. Release PR is merged
2. Stable publish workflow runs
3. Linked adapter packages published with provenance
4. Consumers resolve stable versions from default npm tag

**Verification**:

```bash
npm view @openzeppelin/adapter-evm version
npm view @openzeppelin/adapter-evm provenance
```

### First Release Readiness

Use this checklist for the initial `1.0.0` publish and for any release train where you need to prove installability and same-day consumer readiness.

1. Confirm the published public package set appears on npm:

```bash
npm view @openzeppelin/adapter-evm version
npm view @openzeppelin/adapter-midnight version
npm view @openzeppelin/adapter-polkadot version
npm view @openzeppelin/adapter-solana version
npm view @openzeppelin/adapter-stellar version
```

2. Run a clean install smoke test against the published set within 5 minutes of the first public release:

```bash
tmpdir="$(mktemp -d)"
cd "$tmpdir"
printf '{"name":"adapter-install-check","private":true}\n' > package.json
pnpm add @openzeppelin/adapter-evm@1.0.0 @openzeppelin/adapter-midnight@1.0.0 @openzeppelin/adapter-polkadot@1.0.0 @openzeppelin/adapter-solana@1.0.0 @openzeppelin/adapter-stellar@1.0.0
```

3. Validate the internal `@openzeppelin/adapter-evm-core` package through this repo's quality gates (`pnpm build`, `pnpm test`, `pnpm lint`, `pnpm typecheck`) rather than npm install smoke tests, because it is intentionally bundled and not published as a standalone runtime package.
4. Treat the release as same-day ready for consumers only after the npm checks above pass, the CI/publish workflows finish successfully, and at least one consumer repo completes its own install/build/test verification without waiting for a `ui-builder` app release.

### Creating a Release

1. Make changes, add Changesets via `pnpm changeset`
2. Merge to `main` – `.github/workflows/publish.yml` opens or updates the version PR. To publish the npm `rc` dist-tag, run **Release RC** manually (`.github/workflows/publish-rc.yml`, `workflow_dispatch`) after the commit you want staged is on `main`.
3. Validate RC in staging (via ui-builder or another consumer); see ui-builder `docs/LOCAL_DEVELOPMENT.md`
4. Merge the auto-generated release PR when ready for stable
5. Stable packages publish via `publish.yml`; consumers can upgrade

**Initial release note**: Until the first stable release PR is merged, unpublished adapter packages remain at `0.0.0` in-repo so the first Changesets versioning pass produces `1.0.0` instead of skipping directly to `2.0.0`.

## Defective Release Recovery

If a published version is found to be defective:

1. **Deprecate the version**: Use `npm deprecate` to mark the version as unusable
2. **Publish a corrected version**: Fix the issue, create a new Changeset, and publish
3. **Notify consumers**: Update migration docs if consumers need to pin to the corrected version
4. **Document**: Add a note to this runbook if the recovery path was non-standard

**Example deprecation**:

```bash
npm deprecate @openzeppelin/adapter-evm@1.2.3 "Defective release; use 1.2.4"
```

## Rollout Gates

### Initial Adapter Publish (Before Consumer Cutover)

Consumer repositories (ui-builder, openzeppelin-ui, role-manager, rwa-wizard) MUST NOT merge their cutover PRs until:

1. The initial `@openzeppelin/adapter-*` set has been published from this repo (baseline `1.0.0` or the current linked set on `main`).
2. At least one consumer has validated installability from published npm (`pnpm install` / CI using registry versions, not workspace-only paths).
3. The rollout gate is explicitly satisfied per migration documentation and the **Release** workflow notice in `publish.yml` has been acknowledged for the train in question.

**Focused gate (automation reminder)**: After a successful stable publish job, GitHub Actions emits a notice referencing this gate. It does not replace human verification—confirm `npm view @openzeppelin/adapter-evm version` and `dist-tags` before approving downstream cutover PRs.

### Post-Migration Closeout

Before declaring migration complete:

- No maintained consumer references `@openzeppelin/ui-builder-adapter-*`
- All in-scope consumers use `@openzeppelin/adapter-*` and updated local-dev paths
- Legacy adapter source directories removed from ui-builder
- Run a closeout grep such as `rg -n "ui-builder-adapter" . ../ui-builder ../openzeppelin-ui ../role-manager ../rwa-wizard` and keep the result limited to historical/spec-only references before approving final migration closeout

## Troubleshooting

### Build Failures

- Ensure `pnpm install` completed successfully
- Check Node version: `node -v` (>= 20.19.0)
- Run `pnpm build` locally to reproduce

### Publish Failures

- Verify `NPM_TOKEN` is set and has publish scope
- Check npm registry connectivity
- Ensure no version conflicts (linked packages must version together)
- RC prereleases are published by `publish-rc.yml` using Changesets prerelease mode; do not reuse the stable release-PR path for RC validation
- After any RC run, confirm `npm view @openzeppelin/adapter-evm dist-tags.rc` returns a value before treating the run as successful

### Consumer Resolution Issues

- Consumers resolve from published metadata; no push-based sync
- Staging: resolve from `rc` channel
- Production: resolve stable versions
- Local dev: use `LOCAL_ADAPTERS_PATH` and `.pnpmfile.cjs` override

## References

- [DEVOPS_SETUP.md](./DEVOPS_SETUP.md) – Credentials and CI setup
- Migration verification checklist is in the ui-builder migration spec
