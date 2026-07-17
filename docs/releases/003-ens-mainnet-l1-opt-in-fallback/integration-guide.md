# Integration Guide — 003 Mainnet-L1 Opt-In Fallback Release

## Pattern 1: Consumer upgrade (npm)

```bash
pnpm add @openzeppelin/adapter-evm@^2.3.0 @openzeppelin/ui-types@^3.3.0
```

After publish, confirm the installed version:

```bash
npm view @openzeppelin/adapter-evm version
```

**Smoke check** — bundled dist should expose the opt-in seam (no separate core install):

```bash
rg 'enableMainnetL1MissFallback' node_modules/@openzeppelin/adapter-evm/dist/
rg 'resolvedViaNetworkFallback' node_modules/@openzeppelin/adapter-evm/dist/
```

Both patterns should match. If absent, you are on a pre-003 publish (`2.2.0` or earlier) or a stale
lockfile.

## Pattern 2: Opt-in wiring (dapp / UIKit)

Shared runtime profiles wire `ensL1Client` but **do not** pass `enableMainnetL1MissFallback: true` —
safe default preserved. To enable cross-network ENS after bound-empty miss:

```ts
import { createNameResolution } from '@openzeppelin/adapter-evm';

const nameResolution = createNameResolution(networkConfig, {
  publicClient: boundClient,
  ensL1Client: mainnetClient,
  enableMainnetL1MissFallback: true,
});
```

Read cross-network disclaimer from provenance (UIKit: `@openzeppelin/ui-utils` `isCrossNetworkFallback`):

```ts
import type { ResolutionProvenance } from '@openzeppelin/ui-types';

function isCrossNetworkFallback(
  p: Pick<ResolutionProvenance, 'resolvedViaNetworkFallback'>,
): boolean {
  return p.resolvedViaNetworkFallback === true;
}
```

Full behavior matrices: [`name-resolution/integration-guide.md`](../../packages/adapter-evm-core/docs/name-resolution/integration-guide.md) Patterns 8–10.

## Pattern 3: Migration from pre-003 (`adapter-evm@2.2.0`)

| Topic | Before (`2.2.0` npm) | After (`2.3.0`+) |
|-------|----------------------|------------------|
| Reverse L1 after bound-empty | Always-on when `ensL1Client` wired (002 workspace only; **not** on npm `2.2.0`) | Opt-in gated; **OFF** by default |
| Forward UR bound miss | Bound-UR-authoritative (`NAME_NOT_FOUND` terminal) | Opt-in enables one L1 consult |
| Provenance triplet | Absent | Present on UR bound-empty → L1 success only |
| ui-types floor | `^3.2.0` | `^3.3.0` required |

**No breaking default:** omitting `enableMainnetL1MissFallback` preserves safe posture. Apps that
relied on workspace-only 002 always-on reverse must explicitly opt in after upgrade.

## Pattern 4: Maintainer release verification (pre-merge)

Run after `pnpm build` at monorepo root (post-changeset version PR or local `changeset version`):

```bash
DIST=packages/adapter-evm/dist
for pat in \
  enableMainnetL1MissFallback \
  mayConsultL1ForMissFallback \
  resolvedViaNetworkFallback \
  queriedOnNetworkId \
  resolvedOnNetworkId \
  networkFallbackProvenanceFields \
  ethereum-mainnet
do
  rg -l "$pat" "$DIST"/*.mjs "$DIST"/*.cjs || { echo "FAIL: $pat"; exit 1; }
done
echo "SF-5 dist verification PASS"
```

**Release-trap checklist:**

- [ ] Changeset lists **both** `@openzeppelin/adapter-evm` and `@openzeppelin/adapter-evm-core`
- [ ] ui-types floor `^3.3.0` in both EVM `package.json` files (Code stage — already applied)
- [ ] Dist grep V-1–V-7 PASS
- [ ] `@openzeppelin/ui-types@3.3.0` on npm before publish
- [ ] Do **not** merge core-only changeset

## Pattern 5: Monorepo test infra (`vitest` ui-types dedupe)

The workspace may resolve multiple `@openzeppelin/ui-types` copies (adapter + UIKit sibling). Shared
vitest config dedupes ui-types for consistent `instanceof` / type identity in tests:

```ts
// vitest.shared.config.ts
resolve: {
  dedupe: ['@openzeppelin/ui-types', '@openzeppelin/ui-renderer'],
},
```

This is a **test-infra** fix for multi-version workspace layouts — not a runtime consumer requirement.

## Common Mistakes

- **Bumping only `adapter-evm-core`.** Does not republish npm bundle — 002 trap repeats.
- **Expecting triplet on non-UR direct L1.** Canonical `001` 1b paths omit it.
- **Upgrading adapter without ui-types `^3.3.0`.** Triplet fields missing on consumer types.
- **Assuming `ensL1Client` implies opt-in.** Gate is separate; default remains OFF.
- **Trusting workspace core version without dist grep.** Version bump ≠ bundled bits.

## See also

- [README](./README.md) — release overview
- [CHANGELOG](./CHANGELOG.md) — release notes draft
- `.changeset/ens-mainnet-l1-opt-in-fallback.md` — source changeset body
