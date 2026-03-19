# Runbook: OpenZeppelin Adapters

**Repository**: OpenZeppelin/openzeppelin-adapters  
**Purpose**: Release operations, troubleshooting, and operational procedures

## Overview

This runbook covers day-to-day release operations, recovery procedures, and validation checkpoints for the adapter monorepo.

## Release Operations

### RC Publication

**Trigger**: Merge to `main` branch

**Flow**:

1. CI runs (lint, typecheck, test, build)
2. Changesets updates release state
3. RC workflow publishes linked adapter set to npm `rc` tag
4. Consumers can resolve latest RC via `npm install @openzeppelin/adapter-evm@rc`

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

### Creating a Release

1. Make changes, add Changesets via `pnpm changeset`
2. Merge to `main` – RC is published automatically
3. Validate RC in staging (via ui-builder or consumer)
4. Merge the auto-generated release PR when ready for stable
5. Stable packages publish; consumers can upgrade

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

1. The initial adapter package set (1.0.0) has been published from this repo
2. At least one consumer has validated installability from published npm
3. The rollout gate is explicitly satisfied per migration documentation

### Post-Migration Closeout

Before declaring migration complete:

- No maintained consumer references `@openzeppelin/ui-builder-adapter-*`
- All in-scope consumers use `@openzeppelin/adapter-*` and updated local-dev paths
- Legacy adapter source directories removed from ui-builder

## Troubleshooting

### Build Failures

- Ensure `pnpm install` completed successfully
- Check Node version: `node -v` (>= 20.19.0)
- Run `pnpm build` locally to reproduce

### Publish Failures

- Verify `NPM_TOKEN` is set and has publish scope
- Check npm registry connectivity
- Ensure no version conflicts (linked packages must version together)

### Consumer Resolution Issues

- Consumers resolve from published metadata; no push-based sync
- Staging: resolve from `rc` channel
- Production: resolve stable versions
- Local dev: use `LOCAL_ADAPTERS_PATH` and `.pnpmfile.cjs` override

## References

- [DEVOPS_SETUP.md](./DEVOPS_SETUP.md) – Credentials and CI setup
- Migration verification checklist is in the ui-builder migration spec
