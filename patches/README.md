# Patches Directory

This directory contains pnpm patches for fixing dependency issues in adapter packages.

## Overview

Patches are maintained in this root directory as the **single source of truth** and automatically synced to adapter packages before publishing.

## Architecture

### Development (Monorepo)

- Patches stored in `patches/` (this directory)
- Root `package.json` references these patches via `pnpm.patchedDependencies`
- pnpm applies patches when dependencies are installed

### Production (Published Adapters)

- Script `scripts/sync-patches-to-adapters.js` automatically:
  1. Copies patches to adapter's `patches/` directory
  2. Updates adapter's `package.json` with `pnpm.patchedDependencies`
  3. Adds `patches` to adapter's published files
- When users install the adapter, patches are applied automatically

## Workflow

### Adding a New Patch

1. Create the patch using pnpm:

   ```bash
   pnpm patch <package@version>
   # Make your changes
   pnpm patch-commit /path/to/patched/package
   ```

2. Add mapping to `scripts/sync-patches-to-adapters.js`:

   ```js
   const PATCH_TO_ADAPTER_MAP = {
     '@your-package/name': 'adapter-name',
     // ...
   };
   ```

3. Run sync script when preparing a publishable adapter package:
   ```bash
   pnpm sync-patches
   ```

### Updating an Existing Patch

1. Update the patch file in `patches/` directory
2. Run `pnpm install` to apply changes
3. Run `pnpm sync-patches` to sync to adapters

### Removing a Patch

1. Delete the patch file from `patches/`
2. Remove from root `package.json` `pnpm.patchedDependencies`
3. Remove mapping from `scripts/sync-patches-to-adapters.js`
4. Run `pnpm sync-patches` to clean up adapters

## Current Patches

### Midnight Adapter Patches

All patches fix browser compatibility issues in Midnight SDK v2.0.2:

- `@midnight-ntwrk__midnight-js-indexer-public-data-provider@2.0.2.patch`
  - Fixes Apollo Client ESM imports (`.cjs` → proper ESM)
  - Fixes network ID module imports
  - See `specs/004-add-midnight-adapter/MIDNIGHT-SDK-PATCHES.md` for details

- `@midnight-ntwrk__midnight-js-types@2.0.2.patch`
  - Adds missing peer dependencies

- `@midnight-ntwrk__midnight-js-network-id@2.0.2.patch`
  - Adds missing peer dependencies

- `@midnight-ntwrk__midnight-js-utils@2.0.2.patch`
  - Adds missing peer dependencies

- `@midnight-ntwrk__compact-runtime@0.9.0.patch`
  - Fixes CommonJS/ESM conflicts
  - Fixes WASM integration for bundlers

## Automation

The sync script runs automatically only for publish preparation:

- In release workflows before `changeset publish`
- Before publishing an adapter locally via `prepublishOnly`

Manual sync: `pnpm sync-patches`

## Benefits

- ✅ Single source of truth for patches
- ✅ No manual copying or duplication
- ✅ Automated wiring of `pnpm.patchedDependencies`
- ✅ Patches travel with published adapters
- ✅ Users don't need to manage patches manually
- ✅ Easy to add patches for other adapters

## Development Notes

- During monorepo development, Midnight patches are applied from the workspace root `package.json`
- Publish-only patch metadata is injected into adapter manifests by `pnpm sync-patches`
- Normal `pnpm install`, `pnpm test`, and `pnpm build` should stay free of package-level `pnpm.patchedDependencies` warnings

## Notes

- Patches are version-specific (e.g., `@2.0.2`)
- If you upgrade a dependency, you may need to regenerate patches
- Patches should be temporary - report bugs upstream and remove when fixed
