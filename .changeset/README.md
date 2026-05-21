# Changesets

This repository uses [Changesets](https://github.com/changesets/changesets) to version and publish the linked `@openzeppelin/adapter-*` packages.

## Day-to-day

1. After code changes, run `pnpm changeset` and describe the impact (patch/minor/major per package as needed).
2. Open a PR with your changes **and** the generated `.changeset/*.md` files.
3. Merge to `main`. The **Release** workflow (`.github/workflows/publish.yml`) opens or updates the “version packages” PR.
4. When you are ready for a **stable** release, merge that release PR. The same workflow publishes to npm with the default dist-tag and provenance.

## RC (`rc` dist-tag)

Staging consumers (for example ui-builder staging) resolve adapters via the npm `rc` dist-tag.

- **RC path** in `.github/workflows/publish.yml`: same SLSA provenance, tarball unpack, `check-file-modes`, SBOM, and attestations as stable; uses Changesets prerelease (`pre enter rc`) and `changeset publish` to the `rc` dist-tag (no `changesets/action` on this path).
- Trigger: **`workflow_dispatch`** on the **Release** workflow (Actions → Release → Run workflow). Run when you want to push the current `main` state to the npm `rc` dist-tag without running the stable release PR flow on every merge.

If a run reports that there is nothing to publish, no action is required.

## Links

- [DEVOPS_SETUP.md](../docs/DEVOPS_SETUP.md) — secrets and npm access
- [RUNBOOK.md](../docs/RUNBOOK.md) — operational steps and rollout gates
