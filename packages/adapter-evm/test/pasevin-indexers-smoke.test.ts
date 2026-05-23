/**
 * Smoke test: Pasevin access-control indexers configured in network definitions.
 *
 * Verifies each `accessControlIndexerUrl` pointing at `*.indexer.pasevin.com` responds
 * to the GraphQL health check used by EvmIndexerClient / StellarIndexerClient.
 *
 * Run:
 *   pnpm --filter @openzeppelin/adapter-evm test:pasevin-smoke
 *
 * Full E2E against indexed Sepolia contracts (history, roles, pagination):
 *   pnpm --filter @openzeppelin/adapter-evm-core test:integration
 */

import { describe, expect, it } from 'vitest';

import { EvmIndexerClient } from '@openzeppelin/adapter-evm-core';
import type { EvmCompatibleNetworkConfig } from '@openzeppelin/adapter-evm-core';

import { polkadotHubMainnet } from '../../adapter-polkadot/src/networks/mainnet';
import {
  moonbaseAlphaTestnet,
  polkadotHubTestnet,
} from '../../adapter-polkadot/src/networks/testnet';
import { stellarPublic } from '../../adapter-stellar/src/networks/mainnet';
import { stellarTestnet } from '../../adapter-stellar/src/networks/testnet';
import { evmMainnetNetworks, evmTestnetNetworks } from '../src/networks';

const PASEVIN_HOST_SUFFIX = '.indexer.pasevin.com';

/** Validates HTTPS URLs with hostname `<slug>.indexer.pasevin.com` (no path/query). */
function isPasevinIndexerUrl(url: string | undefined): url is string {
  if (!url) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:') {
    return false;
  }

  const { hostname, pathname, search, hash } = parsed;
  if (pathname !== '/' || search !== '' || hash !== '') {
    return false;
  }

  if (!hostname.endsWith(PASEVIN_HOST_SUFFIX)) {
    return false;
  }

  const slug = hostname.slice(0, -PASEVIN_HOST_SUFFIX.length);
  return slug.length > 0 && /^[a-z0-9-]+$/.test(slug);
}

/** Networks whose default indexer URL uses the Pasevin deployment. */
function collectPasevinIndexerNetworks(): Array<{
  id: string;
  url: string;
  ecosystem: string;
}> {
  const entries: Array<{ id: string; url: string; ecosystem: string }> = [];

  for (const network of [...evmMainnetNetworks, ...evmTestnetNetworks]) {
    const url = network.accessControlIndexerUrl;
    if (isPasevinIndexerUrl(url)) {
      entries.push({ id: network.id, url, ecosystem: network.ecosystem });
    }
  }

  for (const network of [polkadotHubMainnet, polkadotHubTestnet, moonbaseAlphaTestnet]) {
    const url = network.accessControlIndexerUrl;
    if (isPasevinIndexerUrl(url)) {
      entries.push({ id: network.id, url, ecosystem: network.ecosystem });
    }
  }

  for (const network of [stellarPublic, stellarTestnet]) {
    const url = network.accessControlIndexerUrl;
    if (isPasevinIndexerUrl(url)) {
      entries.push({ id: network.id, url, ecosystem: network.ecosystem });
    }
  }

  return entries;
}

const PASEVIN_INDEXERS = collectPasevinIndexerNetworks();

const EXPECTED_PASEVIN_INDEXER_COUNT = 22;

async function checkGraphqlHealth(url: string): Promise<boolean> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '{ __typename }' }),
  });
  return response.ok;
}

describe('Pasevin access control indexers (network config smoke)', () => {
  it(`should list exactly ${EXPECTED_PASEVIN_INDEXER_COUNT} Pasevin indexers in network configs`, () => {
    expect(PASEVIN_INDEXERS).toHaveLength(EXPECTED_PASEVIN_INDEXER_COUNT);
    expect(new Set(PASEVIN_INDEXERS.map((n) => n.url)).size).toBe(EXPECTED_PASEVIN_INDEXER_COUNT);
  });

  it.each(PASEVIN_INDEXERS)(
    '$id ($ecosystem) responds to GraphQL health check at $url',
    async ({ id, url, ecosystem }) => {
      expect(isPasevinIndexerUrl(url)).toBe(true);

      if (ecosystem === 'stellar') {
        expect(await checkGraphqlHealth(url)).toBe(true);
        return;
      }

      const client = new EvmIndexerClient({
        id,
        ecosystem,
        accessControlIndexerUrl: url,
      } as EvmCompatibleNetworkConfig);

      expect(await client.isAvailable()).toBe(true);
    },
    15000
  );
});
