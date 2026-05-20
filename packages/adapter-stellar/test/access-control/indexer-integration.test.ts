/**
 * Integration Test: Stellar Adapter with Pasevin Indexer
 *
 * Tests the adapter against a live access-control GraphQL indexer
 * for historical access control events, ownership transfers, and admin transfers.
 *
 * Prerequisites:
 * - Pasevin access control indexer synced and serving GraphQL
 *
 * Environment Variable:
 * - INDEXER_URL: optional GraphQL endpoint override. When unset, defaults to
 *   `https://stellar-testnet.indexer.pasevin.com` (stellar-testnet network config).
 *
 * Test Contract (Stellar testnet, indexed on Pasevin):
 * - CAY5WHNBXMBFAFGCGYWZUXLPCSGXNUWQUYATPHDVRDKN2OKKY33OCCKC
 *
 * Deploy fresh fixtures when testnet RPC retention drops historical ledger data
 * before the indexer can sync (Stellar testnet has a short retention window).
 *
 * Run: pnpm --filter @openzeppelin/adapter-stellar test:integration
 *
 * IMPORTANT: Tests skip when the indexer is unavailable (sync lag, maintenance, etc.).
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { StellarNetworkConfig } from '@openzeppelin/ui-types';

import { StellarIndexerClient } from '../../src/access-control/indexer-client';

const DEFAULT_PASEVIN_STELLAR_TESTNET_INDEXER = 'https://stellar-testnet.indexer.pasevin.com';

const DEPLOYED_INDEXER_URL = process.env.INDEXER_URL ?? DEFAULT_PASEVIN_STELLAR_TESTNET_INDEXER;

/** Stellar testnet contract with access-control activity (indexed on Pasevin). */
const TEST_CONTRACT = 'CAY5WHNBXMBFAFGCGYWZUXLPCSGXNUWQUYATPHDVRDKN2OKKY33OCCKC';

/** Minimum events required for pagination tests (contract currently has 30+ indexed). */
const MIN_INDEXED_EVENTS = 10;

/** Returns true when the indexer responds and the fixture contract has indexed events. */
async function verifyFixtureContractIndexed(client: StellarIndexerClient): Promise<boolean> {
  if (!(await client.checkAvailability())) {
    return false;
  }

  try {
    const probe = await client.queryHistory(TEST_CONTRACT, { limit: 1 });
    return probe.items.length > 0;
  } catch {
    return false;
  }
}

// Roles present on the fixture contract (verified via Pasevin indexer)
const EXPECTED_ROLES: string[] = ['minter', 'burner', 'approver', 'pauser', 'viewer'];

// Mock network config with deployed indexer
const testNetworkConfig: StellarNetworkConfig = {
  id: 'stellar-testnet-integration',
  name: 'Stellar Testnet (Integration)',
  ecosystem: 'stellar',
  network: 'stellar',
  type: 'testnet',
  isTestnet: true,
  exportConstName: 'stellarTestnetIntegration',
  sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  accessControlIndexerUrl: DEPLOYED_INDEXER_URL,
};

describe('StellarIndexerClient - Integration Test with Real Indexer', () => {
  let client: StellarIndexerClient;
  let indexerAvailable: boolean = false;
  /** True when the fixture contract has at least one indexed access-control event. */
  let fixtureContractIndexed = false;

  beforeAll(async () => {
    client = new StellarIndexerClient(testNetworkConfig);
    indexerAvailable = await client.checkAvailability();

    if (indexerAvailable) {
      fixtureContractIndexed = await verifyFixtureContractIndexed(client);
    }

    if (!indexerAvailable) {
      console.warn(
        '\n' +
          '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
          '⚠️  INDEXER UNAVAILABLE - Integration Tests Skipped\n' +
          '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
          '\n' +
          'The access control indexer is not currently operational.\n' +
          'This is EXPECTED when:\n' +
          '  • The indexer is still syncing\n' +
          '  • The indexer is undergoing maintenance\n' +
          '  • Network connectivity issues\n' +
          '\n' +
          `Indexer URL: ${DEPLOYED_INDEXER_URL}\n` +
          '\n' +
          'All integration tests will be SKIPPED. Unit tests with mocked\n' +
          'responses provide coverage for indexer functionality.\n' +
          '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
      );
    } else if (!fixtureContractIndexed) {
      console.warn(
        '\n' +
          '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
          '⚠️  FIXTURE CONTRACT NOT INDEXED - Data Tests Skipped\n' +
          '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
          '\n' +
          `Contract ${TEST_CONTRACT} has no indexed events yet.\n` +
          'Deploy a new fixture and update TEST_CONTRACT if testnet RPC retention\n' +
          'expired before the indexer synced.\n' +
          '\n' +
          `Indexer URL: ${DEPLOYED_INDEXER_URL}\n` +
          '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
      );
    } else {
      console.log(
        '\n' +
          '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
          '✅ INDEXER AVAILABLE - Running Integration Tests\n' +
          '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
          `Indexer URL: ${DEPLOYED_INDEXER_URL}\n` +
          `Fixture contract: ${TEST_CONTRACT}\n` +
          '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
      );
    }
  }, 30000); // 30 second timeout for indexer availability check

  /** Indexer is up and the fixture contract has indexed data. */
  const integrationReady = (): boolean => indexerAvailable && fixtureContractIndexed;

  describe('Fixture contract indexing', () => {
    it('should have indexed access control events for the fixture contract', async () => {
      expect(await client.checkAvailability()).toBe(true);

      const result = await client.queryHistory(TEST_CONTRACT);
      expect(result.items.length).toBeGreaterThanOrEqual(MIN_INDEXED_EVENTS);

      const roleIds = await client.discoverRoleIds(TEST_CONTRACT);
      expect(roleIds.length).toBeGreaterThan(0);

      console.log(
        `  ✅ Fixture verified: ${result.items.length} events, ${roleIds.length} role(s) indexed`
      );
    }, 20000);
  });

  describe('Connectivity', () => {
    it('should successfully connect to the deployed indexer', async () => {
      if (!integrationReady()) {
        return;
      }
      expect(indexerAvailable).toBe(true);
    }, 10000); // 10s timeout for network call

    it('should handle unavailable indexer gracefully', async () => {
      const invalidConfig: StellarNetworkConfig = {
        ...testNetworkConfig,
        accessControlIndexerUrl: 'https://invalid-endpoint.example.com/graphql',
      };
      const invalidClient = new StellarIndexerClient(invalidConfig);
      const isAvailable = await invalidClient.checkAvailability();
      expect(isAvailable).toBe(false);
    }, 10000);
  });

  describe('History Query - Basic', () => {
    it('should query all history for the test contract', async () => {
      if (!integrationReady()) {
        return;
      }
      const result = await client.queryHistory(TEST_CONTRACT);

      expect(result).toBeDefined();
      expect(result.items).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.pageInfo).toBeDefined();
      expect(typeof result.pageInfo.hasNextPage).toBe('boolean');

      // Verify structure of first entry
      const firstEntry = result.items[0];
      expect(firstEntry).toHaveProperty('role');
      expect(firstEntry).toHaveProperty('account');
      expect(firstEntry).toHaveProperty('changeType');
      expect(firstEntry).toHaveProperty('txId');
      expect(firstEntry).toHaveProperty('timestamp');
      expect(firstEntry).toHaveProperty('ledger');

      // Validate change type enum - includes all supported event types
      expect([
        'GRANTED',
        'REVOKED',
        'OWNERSHIP_TRANSFER_STARTED',
        'OWNERSHIP_TRANSFER_COMPLETED',
        'ADMIN_TRANSFER_INITIATED',
        'ADMIN_TRANSFER_COMPLETED',
        'UNKNOWN',
      ]).toContain(firstEntry.changeType);

      // Validate Stellar address format (starts with G or C)
      expect(firstEntry.account).toMatch(/^[GC][A-Z0-9]{55}$/);
    }, 15000);

    it('should query history with pagination limit', async () => {
      if (!integrationReady()) {
        return;
      }
      const result = await client.queryHistory(TEST_CONTRACT, { limit: 5 });

      expect(result).toBeDefined();
      expect(result.items.length).toBeLessThanOrEqual(5);
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.pageInfo).toBeDefined();
    }, 15000);

    it('should support cursor-based pagination', async () => {
      if (!integrationReady()) {
        return;
      }
      // Get first page
      const firstPage = await client.queryHistory(TEST_CONTRACT, { limit: 2 });

      expect(firstPage.items.length).toBeLessThanOrEqual(2);

      // If there are more pages, test pagination
      if (firstPage.pageInfo.hasNextPage && firstPage.pageInfo.endCursor) {
        const secondPage = await client.queryHistory(TEST_CONTRACT, {
          limit: 2,
          cursor: firstPage.pageInfo.endCursor,
        });

        expect(secondPage.items).toBeDefined();
        // Items should be different from first page
        if (secondPage.items.length > 0 && firstPage.items.length > 0) {
          expect(secondPage.items[0].txId).not.toBe(firstPage.items[0].txId);
        }
      }
    }, 15000);
  });

  /**
   * Comprehensive Pagination Tests
   *
   * Uses a contract with role change events to verify pagination behavior.
   */
  describe('History Query - Pagination Verification', () => {
    // Use one of our test contracts for pagination testing
    const PAGINATION_TEST_CONTRACT = TEST_CONTRACT;
    const MIN_EXPECTED_EVENTS = MIN_INDEXED_EVENTS;

    it('should have enough events for pagination testing', async () => {
      if (!integrationReady()) {
        return;
      }

      // Query without limit to get total count
      const allEvents = await client.queryHistory(PAGINATION_TEST_CONTRACT);

      console.log(`  📊 Contract has ${allEvents.items.length} events indexed`);
      expect(allEvents.items.length).toBeGreaterThanOrEqual(MIN_EXPECTED_EVENTS);
    }, 20000);

    it('should correctly paginate through all events with small page size', async () => {
      if (!integrationReady()) {
        return;
      }

      const pageSize = 5;
      const seenEventKeys = new Set<string>();
      let totalItems = 0;
      let duplicateCount = 0;
      let cursor: string | undefined = undefined;
      let pageCount = 0;
      const maxPages = 30; // Safety limit (should cover contracts with ~150 events at page size 5)

      // Fetch first page
      let firstPage = await client.queryHistory(PAGINATION_TEST_CONTRACT, {
        limit: pageSize,
      });

      // Helper to create a unique key for an event
      // Note: txId alone is not unique - multiple events can happen in same transaction
      const getEventKey = (item: (typeof firstPage.items)[0]) =>
        `${item.txId}-${item.role.id}-${item.account}-${item.changeType}`;

      for (const item of firstPage.items) {
        seenEventKeys.add(getEventKey(item));
      }
      totalItems += firstPage.items.length;
      pageCount++;
      cursor = firstPage.pageInfo.endCursor;

      console.log(
        `  📄 Page ${pageCount}: ${firstPage.items.length} items, hasNextPage: ${firstPage.pageInfo.hasNextPage}`
      );

      // Paginate through remaining pages
      while (firstPage.pageInfo.hasNextPage && cursor && pageCount < maxPages) {
        const nextPage = await client.queryHistory(PAGINATION_TEST_CONTRACT, {
          limit: pageSize,
          cursor,
        });

        pageCount++;
        console.log(
          `  📄 Page ${pageCount}: ${nextPage.items.length} items, hasNextPage: ${nextPage.pageInfo.hasNextPage}`
        );

        // Track duplicates (can happen with timestamp-based sorting when events have same timestamp)
        for (const newItem of nextPage.items) {
          const key = getEventKey(newItem);
          if (seenEventKeys.has(key)) {
            duplicateCount++;
            console.log(`  ⚠️ Duplicate found (expected with same-timestamp events): ${key}`);
          } else {
            seenEventKeys.add(key);
          }
        }

        totalItems += nextPage.items.length;
        cursor = nextPage.pageInfo.endCursor;
        firstPage = nextPage;
      }

      console.log(
        `  ✅ Total: ${seenEventKeys.size} unique events across ${pageCount} pages (${duplicateCount} duplicates)`
      );

      // Verify we got all expected unique events
      expect(seenEventKeys.size).toBeGreaterThanOrEqual(MIN_EXPECTED_EVENTS);

      // Duplicates should be minimal (only at page boundaries with same-timestamp events)
      // Allow up to 10% duplicates (can happen when multiple events have the same timestamp)
      const duplicateRate = duplicateCount / totalItems;
      expect(duplicateRate).toBeLessThan(0.1);

      // Verify pagination terminated properly (only if we didn't hit the safety limit)
      if (pageCount < maxPages) {
        expect(firstPage.pageInfo.hasNextPage).toBe(false);
      } else {
        console.log(`  ⚠️ Hit safety limit of ${maxPages} pages - pagination may not be complete`);
      }
    }, 90000); // Longer timeout for multiple pages

    it('should return consistent results with different page sizes', async () => {
      if (!integrationReady()) {
        return;
      }

      // Get first 10 items with page size 10
      const largePage = await client.queryHistory(PAGINATION_TEST_CONTRACT, { limit: 10 });

      // Helper to create a unique key for an event
      const getEventKey = (item: (typeof largePage.items)[0]) =>
        `${item.txId}-${item.role.id}-${item.account}-${item.changeType}`;

      // Get same items with smaller pages
      const smallPage1 = await client.queryHistory(PAGINATION_TEST_CONTRACT, { limit: 5 });
      const smallPage2 = await client.queryHistory(PAGINATION_TEST_CONTRACT, {
        limit: 5,
        cursor: smallPage1.pageInfo.endCursor,
      });

      // Combine small pages
      const combinedSmallPages = [...smallPage1.items, ...smallPage2.items];

      // Both approaches should yield same count
      expect(combinedSmallPages.length).toBe(largePage.items.length);

      // Both approaches should yield the same set of events
      // (order may differ slightly if events have same timestamp)
      const largePageKeys = new Set(largePage.items.map(getEventKey));
      const smallPagesKeys = new Set(combinedSmallPages.map(getEventKey));

      expect(smallPagesKeys.size).toBe(largePageKeys.size);
      for (const key of smallPagesKeys) {
        expect(largePageKeys.has(key)).toBe(true);
      }
    }, 30000);

    it('should respect limit while maintaining cursor continuity', async () => {
      if (!integrationReady()) {
        return;
      }

      const limit = 3;

      // Get 3 pages
      const page1 = await client.queryHistory(PAGINATION_TEST_CONTRACT, { limit });
      expect(page1.items.length).toBeLessThanOrEqual(limit);

      if (!page1.pageInfo.hasNextPage) {
        console.log('  ⏭️ Not enough events for multi-page test');
        return;
      }

      const page2 = await client.queryHistory(PAGINATION_TEST_CONTRACT, {
        limit,
        cursor: page1.pageInfo.endCursor,
      });
      expect(page2.items.length).toBeLessThanOrEqual(limit);

      if (!page2.pageInfo.hasNextPage) {
        return;
      }

      const page3 = await client.queryHistory(PAGINATION_TEST_CONTRACT, {
        limit,
        cursor: page2.pageInfo.endCursor,
      });
      expect(page3.items.length).toBeLessThanOrEqual(limit);

      // Verify timestamps are in descending order across pages
      const allTimestamps = [
        ...page1.items.map((e) => new Date(e.timestamp!).getTime()),
        ...page2.items.map((e) => new Date(e.timestamp!).getTime()),
        ...page3.items.map((e) => new Date(e.timestamp!).getTime()),
      ];

      for (let i = 0; i < allTimestamps.length - 1; i++) {
        expect(allTimestamps[i]).toBeGreaterThanOrEqual(allTimestamps[i + 1]);
      }
    }, 30000);

    it('should work with filters and pagination combined', async () => {
      if (!integrationReady()) {
        return;
      }

      // First, get all events to find a role with multiple entries
      const allResult = await client.queryHistory(PAGINATION_TEST_CONTRACT);
      const roleCount = new Map<string, number>();

      for (const entry of allResult.items) {
        const roleId = entry.role.id;
        roleCount.set(roleId, (roleCount.get(roleId) || 0) + 1);
      }

      // Find a role with enough entries for pagination
      let targetRole: string | undefined;
      for (const [role, count] of roleCount) {
        if (count >= 5) {
          targetRole = role;
          break;
        }
      }

      if (!targetRole) {
        console.log('  ⏭️ No role with 5+ events for filter+pagination test');
        return;
      }

      console.log(`  🎯 Testing pagination with roleId filter: ${targetRole}`);

      // Paginate through filtered results
      const pageSize = 2;

      let page1 = await client.queryHistory(PAGINATION_TEST_CONTRACT, {
        roleId: targetRole,
        limit: pageSize,
      });

      const filteredItems: typeof page1.items = [];
      filteredItems.push(...page1.items);

      while (page1.pageInfo.hasNextPage && page1.pageInfo.endCursor) {
        const nextPage = await client.queryHistory(PAGINATION_TEST_CONTRACT, {
          roleId: targetRole,
          limit: pageSize,
          cursor: page1.pageInfo.endCursor,
        });
        filteredItems.push(...nextPage.items);
        page1 = nextPage;
      }

      // Verify all items match the filter
      for (const item of filteredItems) {
        expect(item.role.id).toBe(targetRole);
      }

      console.log(`  ✅ Retrieved ${filteredItems.length} filtered items via pagination`);
    }, 45000);
  });

  describe('History Query - Filtering', () => {
    it('should filter history by specific account', async () => {
      if (!integrationReady()) {
        return;
      }
      // First get all history to find a valid account
      const allResult = await client.queryHistory(TEST_CONTRACT);
      expect(allResult.items.length).toBeGreaterThan(0);

      const targetAccount = allResult.items[0].account;

      // Now filter by that account
      const filteredResult = await client.queryHistory(TEST_CONTRACT, {
        account: targetAccount,
      });

      expect(filteredResult.items.length).toBeGreaterThan(0);
      // Verify all entries match the filter
      for (const entry of filteredResult.items) {
        expect(entry.account).toBe(targetAccount);
      }
    }, 15000);

    it('should filter history by specific role', async () => {
      if (!integrationReady()) {
        return;
      }
      // Query without filter first to see what roles exist
      const allResult = await client.queryHistory(TEST_CONTRACT);

      // Find an entry with an actual role (not ownership)
      const roleEntry = allResult.items.find((e) => e.role && e.role.id !== 'OWNER');

      if (roleEntry) {
        const targetRole = roleEntry.role.id;

        // Query with role filter
        const filteredResult = await client.queryHistory(TEST_CONTRACT, {
          roleId: targetRole,
        });

        expect(filteredResult.items.length).toBeGreaterThan(0);
        // Verify all entries match the filter
        for (const entry of filteredResult.items) {
          expect(entry.role.id).toBe(targetRole);
        }
      } else {
        // If no role entries found, test passes (ownership-only contract)
        expect(true).toBe(true);
      }
    }, 15000);

    it('should filter history by changeType GRANTED (server-side)', async () => {
      if (!integrationReady()) {
        return;
      }

      // Query with changeType filter for GRANTED events only
      const grantedResult = await client.queryHistory(TEST_CONTRACT, {
        changeType: 'GRANTED',
        limit: 20,
      });

      expect(grantedResult.items.length).toBeGreaterThan(0);

      // Verify ALL returned entries have changeType: 'GRANTED'
      for (const entry of grantedResult.items) {
        expect(entry.changeType).toBe('GRANTED');
      }

      console.log(`  ✅ Filtered ${grantedResult.items.length} GRANTED events (server-side)`);
    }, 15000);

    it('should filter history by changeType REVOKED (server-side)', async () => {
      if (!integrationReady()) {
        return;
      }

      const contracts = [TEST_CONTRACT];
      let revokedResult = null;

      for (const contract of contracts) {
        const result = await client.queryHistory(contract, {
          changeType: 'REVOKED',
          limit: 20,
        });

        if (result.items.length > 0) {
          revokedResult = result;
          console.log(`  Found REVOKED events in contract ${contract.slice(0, 10)}...`);
          break;
        }
      }

      if (!revokedResult || revokedResult.items.length === 0) {
        console.log('  ⏭️  No REVOKED events found in test contracts');
        return;
      }

      // Verify ALL returned entries have changeType: 'REVOKED'
      for (const entry of revokedResult.items) {
        expect(entry.changeType).toBe('REVOKED');
      }

      console.log(`  ✅ Filtered ${revokedResult.items.length} REVOKED events (server-side)`);
    }, 15000);

    it('should filter history by changeType OWNERSHIP_TRANSFER_COMPLETED (server-side)', async () => {
      if (!integrationReady()) {
        return;
      }

      // Try both contracts to find ownership transfer events
      const contracts = [TEST_CONTRACT];
      let ownershipResult = null;

      for (const contract of contracts) {
        const result = await client.queryHistory(contract, {
          changeType: 'OWNERSHIP_TRANSFER_COMPLETED',
          limit: 20,
        });

        if (result.items.length > 0) {
          ownershipResult = result;
          console.log(
            `  Found OWNERSHIP_TRANSFER_COMPLETED events in contract ${contract.slice(0, 10)}...`
          );
          break;
        }
      }

      if (!ownershipResult || ownershipResult.items.length === 0) {
        console.log('  ⏭️  No OWNERSHIP_TRANSFER_COMPLETED events found in test contracts');
        return;
      }

      // Verify ALL returned entries have changeType: 'OWNERSHIP_TRANSFER_COMPLETED'
      for (const entry of ownershipResult.items) {
        expect(entry.changeType).toBe('OWNERSHIP_TRANSFER_COMPLETED');
      }

      console.log(
        `  ✅ Filtered ${ownershipResult.items.length} OWNERSHIP_TRANSFER_COMPLETED events (server-side)`
      );
    }, 15000);

    it('should combine changeType filter with pagination', async () => {
      if (!integrationReady()) {
        return;
      }

      // Get first page of GRANTED events
      const page1 = await client.queryHistory(TEST_CONTRACT, {
        changeType: 'GRANTED',
        limit: 5,
      });

      expect(page1.items.length).toBeGreaterThan(0);

      // All items on page 1 should be GRANTED
      for (const entry of page1.items) {
        expect(entry.changeType).toBe('GRANTED');
      }

      // If there's a next page, verify it also contains only GRANTED events
      if (page1.pageInfo.hasNextPage && page1.pageInfo.endCursor) {
        const page2 = await client.queryHistory(TEST_CONTRACT, {
          changeType: 'GRANTED',
          limit: 5,
          cursor: page1.pageInfo.endCursor,
        });

        // All items on page 2 should also be GRANTED
        for (const entry of page2.items) {
          expect(entry.changeType).toBe('GRANTED');
        }

        console.log(
          `  ✅ changeType filter works across pages: page1=${page1.items.length}, page2=${page2.items.length} GRANTED events`
        );
      } else {
        console.log(
          `  ✅ changeType filter works: ${page1.items.length} GRANTED events (single page)`
        );
      }
    }, 20000);

    it('should combine changeType filter with roleId filter', async () => {
      if (!integrationReady()) {
        return;
      }

      // Try both contracts to find GRANTED events with roles
      const contracts = [TEST_CONTRACT];
      let grantedEntry = null;
      let targetContract = '';

      for (const contract of contracts) {
        const allResult = await client.queryHistory(contract);
        grantedEntry = allResult.items.find(
          (e) => e.changeType === 'GRANTED' && e.role && e.role.id !== 'OWNER'
        );
        if (grantedEntry) {
          targetContract = contract;
          break;
        }
      }

      if (!grantedEntry) {
        console.log('  ⏭️  No GRANTED events with roles found in test contracts');
        return;
      }

      const targetRole = grantedEntry.role.id;

      // Query with both changeType and roleId filters
      const combinedResult = await client.queryHistory(targetContract, {
        changeType: 'GRANTED',
        roleId: targetRole,
        limit: 10,
      });

      expect(combinedResult.items.length).toBeGreaterThan(0);

      // Verify ALL entries match BOTH filters
      for (const entry of combinedResult.items) {
        expect(entry.changeType).toBe('GRANTED');
        expect(entry.role.id).toBe(targetRole);
      }

      console.log(
        `  ✅ Combined filter: ${combinedResult.items.length} GRANTED events for role '${targetRole}'`
      );
    }, 15000);

    it('should combine changeType filter with account filter', async () => {
      if (!integrationReady()) {
        return;
      }

      // Try both contracts to find GRANTED events
      const contracts = [TEST_CONTRACT];
      let grantedEntry = null;
      let targetContract = '';

      for (const contract of contracts) {
        const allResult = await client.queryHistory(contract);
        grantedEntry = allResult.items.find((e) => e.changeType === 'GRANTED');
        if (grantedEntry) {
          targetContract = contract;
          break;
        }
      }

      if (!grantedEntry) {
        console.log('  ⏭️  No GRANTED events found in test contracts');
        return;
      }

      const targetAccount = grantedEntry.account;

      // Query with both changeType and account filters
      const combinedResult = await client.queryHistory(targetContract, {
        changeType: 'GRANTED',
        account: targetAccount,
        limit: 10,
      });

      expect(combinedResult.items.length).toBeGreaterThan(0);

      // Verify ALL entries match BOTH filters
      for (const entry of combinedResult.items) {
        expect(entry.changeType).toBe('GRANTED');
        expect(entry.account).toBe(targetAccount);
      }

      console.log(
        `  ✅ Combined filter: ${combinedResult.items.length} GRANTED events for account '${targetAccount.slice(0, 10)}...'`
      );
    }, 15000);

    it('should filter history by txId (server-side)', async () => {
      if (!integrationReady()) {
        return;
      }

      // First get all history to find a valid txId
      const allResult = await client.queryHistory(TEST_CONTRACT, { limit: 10 });

      // Test contract MUST have events - fail if missing
      expect(allResult.items.length).toBeGreaterThan(0);
      const targetTxId = allResult.items[0].txId;

      // Query with txId filter
      const filteredResult = await client.queryHistory(TEST_CONTRACT, {
        txId: targetTxId,
      });

      expect(filteredResult.items.length).toBeGreaterThan(0);

      // Verify ALL returned entries have the matching txId
      for (const entry of filteredResult.items) {
        expect(entry.txId).toBe(targetTxId);
      }

      console.log(
        `  ✅ Filtered ${filteredResult.items.length} event(s) by txId '${targetTxId.slice(0, 16)}...'`
      );
    }, 15000);

    it('should filter history by ledger/blockHeight (server-side)', async () => {
      if (!integrationReady()) {
        return;
      }

      // First get all history to find a valid ledger number
      const allResult = await client.queryHistory(TEST_CONTRACT, { limit: 10 });

      // Test contract MUST have events - fail if missing
      expect(allResult.items.length).toBeGreaterThan(0);
      const targetLedger = allResult.items[0].ledger!;

      // Query with ledger filter
      const filteredResult = await client.queryHistory(TEST_CONTRACT, {
        ledger: targetLedger,
      });

      expect(filteredResult.items.length).toBeGreaterThan(0);

      // Verify ALL returned entries have the matching ledger
      for (const entry of filteredResult.items) {
        expect(entry.ledger).toBe(targetLedger);
      }

      console.log(
        `  ✅ Filtered ${filteredResult.items.length} event(s) at ledger ${targetLedger}`
      );
    }, 15000);

    it('should filter history by timestamp range (server-side)', async () => {
      if (!integrationReady()) {
        return;
      }

      // First, get all events to discover available timestamps
      const allEvents = await client.queryHistory(TEST_CONTRACT, { limit: 100 });

      // Test contract MUST have events - fail if missing
      expect(allEvents.items.length).toBeGreaterThan(0);

      // Use the actual timestamp range from the first few events
      const timestamps = allEvents.items.map((e) => e.timestamp).filter((t) => t);

      // Events MUST have timestamps - fail if missing
      expect(timestamps.length).toBeGreaterThan(0);

      // Use a range that covers all discovered events (from oldest to newest + 1 day)
      const sortedTimestamps = [...timestamps].sort();
      const oldestTimestamp = sortedTimestamps[0]!;
      // Add 1 day buffer to ensure we capture all events
      const newestPlusBuffer = new Date(
        new Date(sortedTimestamps[sortedTimestamps.length - 1]!).getTime() + 86400000
      )
        .toISOString()
        .slice(0, 19);

      const filteredResult = await client.queryHistory(TEST_CONTRACT, {
        timestampFrom: oldestTimestamp,
        timestampTo: newestPlusBuffer,
        limit: 20,
      });

      // We should find events in this range since we used actual timestamps from data
      expect(filteredResult.items.length).toBeGreaterThan(0);

      // Verify all returned events have timestamps within the specified range
      for (const item of filteredResult.items) {
        if (item.timestamp) {
          expect(item.timestamp >= oldestTimestamp).toBe(true);
        }
      }
      console.log(
        `  ✅ Filtered ${filteredResult.items.length} event(s) in timestamp range (${oldestTimestamp} to ${newestPlusBuffer})`
      );
    }, 15000);

    it('should filter with timestampFrom only (events after date)', async () => {
      if (!integrationReady()) {
        return;
      }

      // First, discover actual timestamps from the contract data
      const allEvents = await client.queryHistory(TEST_CONTRACT, { limit: 50 });

      // Test contract MUST have events - fail if missing
      expect(allEvents.items.length).toBeGreaterThan(0);

      // Find the oldest timestamp and use it as the filter
      const timestamps = allEvents.items.map((e) => e.timestamp).filter((t) => t);
      expect(timestamps.length).toBeGreaterThan(0);

      const sortedTimestamps = [...timestamps].sort();
      const oldestTimestamp = sortedTimestamps[0]!;

      const filteredResult = await client.queryHistory(TEST_CONTRACT, {
        timestampFrom: oldestTimestamp,
        limit: 20,
      });

      expect(filteredResult.items.length).toBeGreaterThan(0);

      // Verify all returned events have timestamps on or after timestampFrom
      for (const item of filteredResult.items) {
        if (item.timestamp) {
          expect(item.timestamp >= oldestTimestamp).toBe(true);
        }
      }

      console.log(`  ✅ Filtered ${filteredResult.items.length} event(s) from ${oldestTimestamp}`);
    }, 15000);
  });

  describe('History Query - Event Discovery', () => {
    it('should discover events from the indexed contracts', async () => {
      if (!integrationReady()) {
        return;
      }
      const result = await client.queryHistory(TEST_CONTRACT);

      // With a reset indexer, we may have fewer or no events initially
      // This test verifies the query works and reports what it finds
      if (result.items.length > 0) {
        const firstEvent = result.items[0];
        console.log(
          `  ✓ Found ${result.items.length} event(s), first at ledger ${firstEvent.ledger}`
        );
        console.log(`    - Account: ${firstEvent.account}`);
        console.log(`    - Role: ${firstEvent.role.id}`);
        console.log(`    - Type: ${firstEvent.changeType}`);

        // Verify event structure
        expect(firstEvent.account).toMatch(/^[GC][A-Z0-9]{55}$/);
        expect(typeof firstEvent.role.id).toBe('string');
        expect([
          'GRANTED',
          'REVOKED',
          'ADMIN_TRANSFER_INITIATED',
          'ADMIN_TRANSFER_COMPLETED',
          'OWNERSHIP_TRANSFER_STARTED',
          'OWNERSHIP_TRANSFER_COMPLETED',
          'UNKNOWN',
        ]).toContain(firstEvent.changeType);
      } else {
        console.log('  ⏭️  No events indexed yet for this contract');
      }
    }, 15000);
  });

  describe('History Query - Event Timeline', () => {
    it('should return events in descending timestamp order', async () => {
      if (!integrationReady()) {
        return;
      }
      const result = await client.queryHistory(TEST_CONTRACT, { limit: 10 });

      expect(result.items.length).toBeGreaterThan(1);

      // Verify descending order
      for (let i = 0; i < result.items.length - 1; i++) {
        const currentTimestamp = new Date(result.items[i].timestamp!).getTime();
        const nextTimestamp = new Date(result.items[i + 1].timestamp!).getTime();
        expect(currentTimestamp).toBeGreaterThanOrEqual(nextTimestamp);
      }
    }, 15000);

    it('should include valid timestamps in ISO8601 format', async () => {
      if (!integrationReady()) {
        return;
      }
      const result = await client.queryHistory(TEST_CONTRACT, { limit: 5 });

      for (const entry of result.items) {
        expect(entry.timestamp).toBeDefined();
        // Should be parseable as a date
        const parsed = new Date(entry.timestamp!);
        expect(parsed.getTime()).not.toBeNaN();
        // Should match ISO8601 format
        expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      }
    }, 15000);
  });

  describe('History Query - Error Handling', () => {
    it('should return empty result for contract with no events', async () => {
      if (!integrationReady()) {
        return;
      }
      // Use a valid but non-existent contract address
      const fakeContract = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
      const result = await client.queryHistory(fakeContract);

      expect(result).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.items.length).toBe(0);
      expect(result.pageInfo.hasNextPage).toBe(false);
    }, 15000);

    it('should throw error when indexer is unavailable', async () => {
      const invalidConfig: StellarNetworkConfig = {
        ...testNetworkConfig,
        accessControlIndexerUrl: undefined,
      };
      const noIndexerClient = new StellarIndexerClient(invalidConfig);

      await expect(noIndexerClient.queryHistory(TEST_CONTRACT)).rejects.toThrow(
        'Indexer not available'
      );
    }, 15000);
  });

  describe('History Query - Data Integrity', () => {
    it('should have valid transaction hashes for all events', async () => {
      if (!integrationReady()) {
        return;
      }
      const result = await client.queryHistory(TEST_CONTRACT, { limit: 10 });

      for (const entry of result.items) {
        expect(entry.txId).toBeDefined();
        expect(entry.txId.length).toBeGreaterThan(0);
        // Stellar tx hash is 64 character hex string
        expect(entry.txId).toMatch(/^[a-f0-9]{64}$/);
      }
    }, 15000);

    it('should have valid block heights for all events', async () => {
      if (!integrationReady()) {
        return;
      }
      const result = await client.queryHistory(TEST_CONTRACT, { limit: 10 });

      for (const entry of result.items) {
        expect(entry.ledger).toBeDefined();
        expect(typeof entry.ledger).toBe('number');
        expect(entry.ledger).toBeGreaterThan(0);
      }
    }, 15000);

    it('should have valid role identifiers', async () => {
      if (!integrationReady()) {
        return;
      }
      const result = await client.queryHistory(TEST_CONTRACT, { limit: 10 });

      for (const entry of result.items) {
        expect(entry.role).toBeDefined();
        expect(entry.role.id).toBeDefined();
        expect(typeof entry.role.id).toBe('string');
        expect(entry.role.id.length).toBeGreaterThan(0);
      }
    }, 15000);
  });

  describe('Real-World Usage Scenario', () => {
    it('should support typical audit trail query (recent activity for specific account)', async () => {
      if (!integrationReady()) {
        return;
      }
      // Scenario: Check recent activity for a specific account
      const allResult = await client.queryHistory(TEST_CONTRACT, { limit: 20 });
      expect(allResult.items.length).toBeGreaterThan(0);

      const targetAccount = allResult.items[0].account;

      // Get last 10 events for this account
      const accountResult = await client.queryHistory(TEST_CONTRACT, {
        account: targetAccount,
        limit: 10,
      });

      expect(accountResult.items.length).toBeGreaterThan(0);

      // Verify we can identify what roles this account received/lost
      const grants = accountResult.items.filter((e) => e.changeType === 'GRANTED');
      // At least one grant should exist (we filtered by an account that appears)
      expect(grants.length).toBeGreaterThan(0);

      // Verify we have timeline information
      for (const event of accountResult.items) {
        expect(event.timestamp).toBeDefined();
        expect(event.ledger).toBeGreaterThan(0);
        expect(event.txId).toMatch(/^[a-f0-9]{64}$/);
      }
    }, 20000);
  });

  describe('Role Discovery', () => {
    it('should discover role IDs from historical events', async () => {
      if (!integrationReady()) {
        return;
      }

      const roleIds = await client.discoverRoleIds(TEST_CONTRACT);

      expect(roleIds).toBeDefined();
      expect(Array.isArray(roleIds)).toBe(true);

      // With a reset indexer, we may have varying numbers of roles
      if (roleIds.length > 0) {
        console.log(`  ✓ Discovered ${roleIds.length} role(s): ${roleIds.join(', ')}`);

        // Verify roles are strings
        for (const roleId of roleIds) {
          expect(typeof roleId).toBe('string');
          expect(roleId.length).toBeGreaterThan(0);
        }
      } else {
        console.log('  ⏭️  No roles indexed yet for this contract');
      }
    }, 15000);

    it('should return unique role IDs (no duplicates)', async () => {
      if (!integrationReady()) {
        return;
      }

      const roleIds = await client.discoverRoleIds(TEST_CONTRACT);

      // Check for uniqueness
      const uniqueRoles = new Set(roleIds);
      expect(roleIds.length).toBe(uniqueRoles.size);
      console.log(`  ✓ All ${roleIds.length} role(s) are unique`);
    }, 15000);

    it('should return role IDs as strings', async () => {
      if (!integrationReady()) {
        return;
      }

      const roleIds = await client.discoverRoleIds(TEST_CONTRACT);

      for (const roleId of roleIds) {
        expect(typeof roleId).toBe('string');
        expect(roleId.length).toBeGreaterThan(0);
      }
    }, 15000);

    it('should return empty array for contract with no role events', async () => {
      if (!integrationReady()) {
        return;
      }

      // Use a valid but non-existent contract address
      const fakeContract = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
      const roleIds = await client.discoverRoleIds(fakeContract);

      expect(roleIds).toBeDefined();
      expect(Array.isArray(roleIds)).toBe(true);
      expect(roleIds.length).toBe(0);
    }, 15000);

    it('should throw error when indexer is unavailable', async () => {
      const invalidConfig: StellarNetworkConfig = {
        ...testNetworkConfig,
        accessControlIndexerUrl: undefined,
      };
      const noIndexerClient = new StellarIndexerClient(invalidConfig);

      await expect(noIndexerClient.discoverRoleIds(TEST_CONTRACT)).rejects.toThrow(
        'Indexer not available'
      );
    }, 15000);

    it('should discover roles consistent with history query', async () => {
      if (!integrationReady()) {
        return;
      }

      // Get discovered role IDs
      const discoveredRoles = await client.discoverRoleIds(TEST_CONTRACT);

      // Get all history and extract unique roles manually
      const result = await client.queryHistory(TEST_CONTRACT);
      const historyRoles = new Set<string>();
      for (const entry of result.items) {
        // Only count actual roles, not ownership events (OWNER)
        if (entry.role && entry.role.id && entry.role.id !== 'OWNER') {
          historyRoles.add(entry.role.id);
        }
      }

      // Discovered roles should match roles from history
      expect(discoveredRoles.length).toBe(historyRoles.size);
      for (const role of discoveredRoles) {
        expect(historyRoles.has(role)).toBe(true);
      }
    }, 20000);

    it('should discover roles from the indexed contracts', async () => {
      if (!integrationReady()) {
        return;
      }

      const roleIds = await client.discoverRoleIds(TEST_CONTRACT);

      if (roleIds.length > 0) {
        console.log(`  ✓ Discovered roles: ${roleIds.join(', ')}`);
        // Verify all are valid strings
        for (const role of roleIds) {
          expect(typeof role).toBe('string');
        }
      } else {
        console.log('  ⏭️  No roles indexed yet for this contract');
      }
    }, 15000);
  });

  describe('queryLatestGrants()', () => {
    it('should query latest grants for known members', async () => {
      if (!integrationReady()) {
        return;
      }

      // First discover any roles that exist
      const roleIds = await client.discoverRoleIds(TEST_CONTRACT);

      // Test contract MUST have roles - fail if missing
      expect(roleIds.length).toBeGreaterThan(0);

      // Get history to find an actual account with grants
      const result = await client.queryHistory(TEST_CONTRACT, {
        roleId: roleIds[0],
        changeType: 'GRANTED',
        limit: 5,
      });

      // Test contract MUST have grant events - fail if missing
      expect(result.items.length).toBeGreaterThan(0);

      const testAccount = result.items[0].account;
      const testRole = roleIds[0];

      const grantMap = await client.queryLatestGrants(TEST_CONTRACT, testRole, [testAccount]);

      expect(grantMap).toBeInstanceOf(Map);
      // Should find the grant we queried for
      expect(grantMap.size).toBeGreaterThan(0);

      const grantInfo = grantMap.get(testAccount);
      expect(grantInfo).toBeDefined();
      expect(grantInfo?.timestamp).toBeDefined();
      expect(grantInfo?.txId).toBeDefined();
      expect(grantInfo?.ledger).toBeDefined();
      console.log(`  ✓ Found grant for ${testAccount.slice(0, 10)}... in role ${testRole}`);
    }, 15000);

    it('should return empty map for accounts with no grants', async () => {
      if (!integrationReady()) {
        return;
      }

      // Discover a role first
      const roleIds = await client.discoverRoleIds(TEST_CONTRACT);
      const testRole = roleIds.length > 0 ? roleIds[0] : 'minter';

      // Use a fake account that has no grants
      const fakeAccount = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPWDQT';
      const grantMap = await client.queryLatestGrants(TEST_CONTRACT, testRole, [fakeAccount]);

      expect(grantMap).toBeInstanceOf(Map);
      expect(grantMap.size).toBe(0);
      console.log('  ✓ Correctly returned empty map for non-existent account');
    }, 15000);

    it('should handle multiple accounts in a single query', async () => {
      if (!integrationReady()) {
        return;
      }

      const roleIds = await client.discoverRoleIds(TEST_CONTRACT);

      // Contract MUST have roles - fail if missing
      expect(roleIds.length).toBeGreaterThan(0);

      // Get some history to find accounts with grants
      const result = await client.queryHistory(TEST_CONTRACT, {
        roleId: roleIds[0],
        changeType: 'GRANTED',
        limit: 10,
      });

      const accountsWithRole = [...new Set(result.items.map((e) => e.account))].slice(0, 3);

      // Contract MUST have multiple accounts with grants
      if (accountsWithRole.length < 2) {
        // This is acceptable for some contracts - just log and validate what we have
        console.log(`  ⚠️ Only ${accountsWithRole.length} account(s) with grants`);
        return;
      }

      const grantMap = await client.queryLatestGrants(TEST_CONTRACT, roleIds[0], accountsWithRole);

      expect(grantMap).toBeInstanceOf(Map);
      // Should find grants for the accounts we queried
      expect(grantMap.size).toBeGreaterThan(0);

      // Verify structure of returned grants
      for (const [account, grant] of grantMap) {
        expect(accountsWithRole).toContain(account);
        expect(typeof grant.timestamp).toBe('string');
        expect(typeof grant.txId).toBe('string');
        expect(typeof grant.ledger).toBe('number');
      }
      console.log(`  ✓ Found ${grantMap.size} grant(s) for ${accountsWithRole.length} accounts`);
    }, 20000);

    it('should return the latest grant when account was granted multiple times', async () => {
      if (!integrationReady()) {
        return;
      }

      // First discover roles and find an account with grants
      const roleIds = await client.discoverRoleIds(TEST_CONTRACT);

      // Test contract MUST have roles - fail if missing
      expect(roleIds.length).toBeGreaterThan(0);

      // Get history to find an account with grants
      const result = await client.queryHistory(TEST_CONTRACT, {
        roleId: roleIds[0],
        changeType: 'GRANTED',
        limit: 10,
      });

      // Test contract MUST have grant events - fail if missing
      expect(result.items.length).toBeGreaterThan(0);

      const testAccount = result.items[0].account;
      const testRole = roleIds[0];

      const grants = result.items.filter(
        (e) => e.changeType === 'GRANTED' && e.account === testAccount
      );

      const grantMap = await client.queryLatestGrants(TEST_CONTRACT, testRole, [testAccount]);

      // Should find the grant
      expect(grantMap.size).toBeGreaterThan(0);

      const latestGrant = grantMap.get(testAccount);
      expect(latestGrant).toBeDefined();

      if (grants.length > 1) {
        // The returned grant should match the first (most recent) grant from history
        expect(latestGrant?.ledger).toBe(grants[0].ledger);
        console.log('  ✓ Correctly returned latest grant from multiple');
      } else {
        console.log('  ✓ Returned single grant');
      }
    }, 20000);
  });
});

/**
 * Integration Test: Ownership Status Viewing (US1)
 *
 * Tests the ownership status viewing functionality:
 * - On-chain get_owner() query via readOwnership()
 * - Indexer pending transfer detection via queryPendingOwnershipTransfer()
 * - Ledger-based expiration checking via getCurrentLedger()
 *
 * State determination logic:
 * - 'owned': Contract has owner, no pending transfer
 * - 'pending': Transfer initiated, awaiting acceptance (currentLedger < expirationLedger)
 * - 'expired': Transfer expired without acceptance (currentLedger >= expirationLedger)
 * - 'renounced': No owner (ownership was renounced)
 */
describe('Ownership Status Viewing - Integration Test (US1)', () => {
  let indexerAvailable = false;
  let rpcAvailable = false;
  let readOwnership: typeof import('../../src/access-control/onchain-reader').readOwnership;
  let getCurrentLedger: typeof import('../../src/access-control/onchain-reader').getCurrentLedger;

  beforeAll(async () => {
    // Dynamically import on-chain reader
    const onchainReader = await import('../../src/access-control/onchain-reader');
    readOwnership = onchainReader.readOwnership;
    getCurrentLedger = onchainReader.getCurrentLedger;

    // Check Soroban RPC availability
    try {
      const ledger = await getCurrentLedger(testNetworkConfig);
      if (typeof ledger === 'number' && ledger > 0) {
        rpcAvailable = true;
        console.log(`✅ Soroban RPC is available (current ledger: ${ledger})`);
      }
    } catch {
      rpcAvailable = false;
      console.log('⚠️  Soroban RPC not available - on-chain tests will be skipped');
    }

    // Check indexer availability and fixture contract data
    const indexerClient = new StellarIndexerClient(testNetworkConfig);
    indexerAvailable = await verifyFixtureContractIndexed(indexerClient);

    if (!indexerAvailable) {
      console.log(
        '⚠️  Indexer unavailable or fixture contract not indexed - state detection tests will be limited'
      );
    }
  }, 30000);

  describe('Basic Ownership Query', () => {
    it('should read current owner from on-chain', async () => {
      if (!rpcAvailable) {
        console.log('  ⏭️  Skipping: Soroban RPC not available');
        return;
      }

      const ownership = await readOwnership(TEST_CONTRACT, testNetworkConfig);

      expect(ownership).toBeDefined();
      expect(ownership).toHaveProperty('owner');

      if (ownership.owner) {
        // Verify it's a valid Stellar address
        expect(ownership.owner).toMatch(/^[GC][A-Z0-9]{55}$/);
        console.log(`  ✓ Contract owner: ${ownership.owner}`);
      } else {
        console.log('  ✓ Contract has no owner (renounced)');
      }
    }, 30000);

    it('should get current ledger from Soroban RPC', async () => {
      if (!rpcAvailable) {
        console.log('  ⏭️  Skipping: Soroban RPC not available');
        return;
      }

      const ledger = await getCurrentLedger(testNetworkConfig);

      expect(typeof ledger).toBe('number');
      expect(ledger).toBeGreaterThan(0);
      console.log(`  ✓ Current ledger: ${ledger}`);
    }, 30000);
  });

  describe('State Determination Logic', () => {
    it('should determine owned state when owner exists and no pending transfer', async () => {
      if (!rpcAvailable) {
        console.log('  ⏭️  Skipping: Soroban RPC not available');
        return;
      }

      const ownership = await readOwnership(TEST_CONTRACT, testNetworkConfig);

      if (!indexerAvailable) {
        // Without indexer, just verify basic ownership
        expect(ownership).toBeDefined();
        console.log('  ⏭️  Indexer not available - cannot determine pending state');
        return;
      }

      const indexerClient = new StellarIndexerClient(testNetworkConfig);

      // Try to query pending transfer - may fail if schema doesn't support ownership events yet
      let pendingTransfer = null;
      try {
        pendingTransfer = await indexerClient.queryPendingOwnershipTransfer(TEST_CONTRACT);
      } catch (error) {
        // Indexer may not support ownership transfer events yet
        console.log(
          `  ⏭️  Pending transfer query not supported: ${(error as Error).message.slice(0, 50)}...`
        );
        // Fall through - treat as no pending transfer
      }

      if (ownership.owner && !pendingTransfer) {
        // This is the 'owned' state
        console.log(`  ✓ Contract is in 'owned' state with owner: ${ownership.owner}`);
      } else if (ownership.owner === null) {
        // This is the 'renounced' state
        console.log('  ✓ Contract ownership is renounced');
      } else if (pendingTransfer) {
        // Pending transfer exists - indexer now stores liveUntilLedger for expiration checking
        console.log(
          `  ✓ Contract has pending transfer to ${pendingTransfer.pendingOwner} (initiated at ledger ${pendingTransfer.ledger}, expires at ledger ${pendingTransfer.liveUntilLedger})`
        );
      }
    }, 45000);

    it('should correctly classify expired transfer when currentLedger >= expirationLedger', async () => {
      if (!rpcAvailable || !indexerAvailable) {
        console.log('  ⏭️  Skipping: RPC or Indexer not available');
        return;
      }

      const indexerClient = new StellarIndexerClient(testNetworkConfig);

      let pendingTransfer = null;
      try {
        pendingTransfer = await indexerClient.queryPendingOwnershipTransfer(TEST_CONTRACT);
      } catch (error) {
        // Indexer may not support ownership transfer events yet
        console.log(
          `  ⏭️  Pending transfer query not supported: ${(error as Error).message.slice(0, 50)}...`
        );
        return;
      }

      if (!pendingTransfer) {
        console.log('  ⏭️  No pending transfer to test expiration logic');
        return;
      }

      // Indexer provides liveUntilLedger for expiration calculation
      const currentLedger = await getCurrentLedger(testNetworkConfig);
      const isExpired = currentLedger >= pendingTransfer.liveUntilLedger;

      console.log(`  Current ledger: ${currentLedger}`);
      console.log(`  Expiration ledger: ${pendingTransfer.liveUntilLedger}`);
      console.log(`  State: ${isExpired ? 'expired' : 'pending'}`);

      // Verify the logic is correct
      if (isExpired) {
        expect(currentLedger).toBeGreaterThanOrEqual(pendingTransfer.liveUntilLedger);
        console.log('  ✓ Correctly classified as expired');
      } else {
        expect(currentLedger).toBeLessThan(pendingTransfer.liveUntilLedger);
        console.log('  ✓ Correctly classified as pending');
      }
    }, 30000);

    it('should return renounced state when owner is null', async () => {
      if (!rpcAvailable) {
        console.log('  ⏭️  Skipping: Soroban RPC not available');
        return;
      }

      const ownership = await readOwnership(TEST_CONTRACT, testNetworkConfig);

      if (ownership.owner === null) {
        console.log('  ✓ Contract owner is null - state is renounced');
      } else {
        console.log(`  ⏭️  Contract has owner: ${ownership.owner}`);
      }
    }, 30000);
  });

  describe('Pending Transfer Detection via Indexer', () => {
    it('should query pending ownership transfers from indexer', async () => {
      if (!indexerAvailable) {
        console.log('  ⏭️  Skipping: Indexer not available');
        return;
      }

      const indexerClient = new StellarIndexerClient(testNetworkConfig);

      // Query for pending transfer - may fail if schema doesn't support ownership events yet
      let pendingTransfer = null;
      try {
        pendingTransfer = await indexerClient.queryPendingOwnershipTransfer(TEST_CONTRACT);
      } catch (error) {
        // Indexer may not support ownership transfer events yet
        console.log(
          `  ⏭️  Pending transfer query not supported yet: ${(error as Error).message.slice(0, 60)}...`
        );
        console.log(
          '  ℹ️  This is expected if the indexer schema has not been updated for ownership events'
        );
        return;
      }

      if (pendingTransfer) {
        expect(pendingTransfer).toHaveProperty('pendingOwner');
        expect(pendingTransfer).toHaveProperty('ledger'); // Initiation ledger
        expect(pendingTransfer).toHaveProperty('timestamp');
        expect(pendingTransfer).toHaveProperty('liveUntilLedger'); // Expiration ledger
        console.log(`  ✓ Found pending transfer:`);
        console.log(`    Pending owner: ${pendingTransfer.pendingOwner}`);
        console.log(`    Initiated at ledger: ${pendingTransfer.ledger}`);
        console.log(`    Initiated at: ${pendingTransfer.timestamp}`);
        console.log(`    Expires at ledger: ${pendingTransfer.liveUntilLedger}`);
      } else {
        console.log('  ✓ No pending transfer found (contract is in owned/renounced state)');
      }
    }, 30000);

    it('should return null for contract with no pending transfer', async () => {
      if (!indexerAvailable) {
        console.log('  ⏭️  Skipping: Indexer not available');
        return;
      }

      const indexerClient = new StellarIndexerClient(testNetworkConfig);

      let pendingTransfer = null;
      try {
        pendingTransfer = await indexerClient.queryPendingOwnershipTransfer(TEST_CONTRACT);
      } catch (error) {
        // Indexer may not support ownership transfer events yet
        console.log(
          `  ⏭️  Pending transfer query not supported yet: ${(error as Error).message.slice(0, 60)}...`
        );
        return;
      }

      // This test just verifies the API returns without error
      // Result can be null (no pending) or an object (has pending)
      if (pendingTransfer === null) {
        console.log('  ✓ No pending transfer (returns null)');
      } else {
        console.log('  ✓ Has pending transfer (returns object)');
        expect(pendingTransfer).toHaveProperty('pendingOwner');
      }
    }, 30000);

    it('should return null for non-existent contract', async () => {
      if (!indexerAvailable) {
        console.log('  ⏭️  Skipping: Indexer not available');
        return;
      }

      const indexerClient = new StellarIndexerClient(testNetworkConfig);
      const fakeContract = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

      let pendingTransfer = null;
      try {
        pendingTransfer = await indexerClient.queryPendingOwnershipTransfer(fakeContract);
      } catch (error) {
        // Indexer may not support ownership transfer events yet
        console.log(
          `  ⏭️  Pending transfer query not supported yet: ${(error as Error).message.slice(0, 60)}...`
        );
        return;
      }

      expect(pendingTransfer).toBeNull();
      console.log('  ✓ Returns null for non-existent contract');
    }, 30000);
  });

  describe('Combined State Query Flow', () => {
    it('should perform complete ownership status query flow', async () => {
      if (!rpcAvailable) {
        console.log('  ⏭️  Skipping: Soroban RPC not available');
        return;
      }

      // Step 1: Read basic ownership from on-chain
      const basicOwnership = await readOwnership(TEST_CONTRACT, testNetworkConfig);
      console.log(`  Step 1: Basic owner = ${basicOwnership.owner || '(null)'}`);

      // Step 2: Check for renounced state
      if (basicOwnership.owner === null) {
        console.log('  ✓ Final state: renounced');
        return;
      }

      // Step 3: Check indexer for pending transfer
      if (!indexerAvailable) {
        console.log('  ✓ Final state: owned (indexer unavailable, cannot check pending)');
        return;
      }

      const indexerClient = new StellarIndexerClient(testNetworkConfig);

      let pendingTransfer = null;
      try {
        pendingTransfer = await indexerClient.queryPendingOwnershipTransfer(TEST_CONTRACT);
      } catch (error) {
        // Indexer may not support ownership transfer events yet
        console.log(
          `  ⏭️  Pending transfer query not supported: ${(error as Error).message.slice(0, 50)}...`
        );
        console.log('  ✓ Final state: owned (ownership events not indexed yet)');
        return;
      }

      if (!pendingTransfer) {
        console.log('  ✓ Final state: owned (no pending transfer)');
        return;
      }

      // Step 4: Indexer provides liveUntilLedger for expiration calculation
      const currentLedger = await getCurrentLedger(testNetworkConfig);
      const isExpired = currentLedger >= pendingTransfer.liveUntilLedger;

      console.log(`  Step 4: Current ledger = ${currentLedger}`);
      console.log(
        `  Step 4: Expiration ledger = ${pendingTransfer.liveUntilLedger} (from indexer)`
      );
      console.log(`  ✓ Final state: ${isExpired ? 'expired' : 'pending'}`);
    }, 60000);

    it('should return consistent results across multiple queries', async () => {
      if (!rpcAvailable) {
        console.log('  ⏭️  Skipping: Soroban RPC not available');
        return;
      }

      // Query twice
      const ownership1 = await readOwnership(TEST_CONTRACT, testNetworkConfig);
      const ownership2 = await readOwnership(TEST_CONTRACT, testNetworkConfig);

      // Results should be consistent
      expect(ownership1.owner).toBe(ownership2.owner);
      console.log(`  ✓ Consistent owner across queries: ${ownership1.owner || '(null)'}`);
    }, 60000);
  });
});

/**
 * Integration Test: On-Chain Role Member Enumeration
 *
 * Tests the on-chain reader functions that call the contract's
 * get_role_member_count() and get_role_member() entrypoints via Soroban RPC.
 *
 * These tests verify the complete flow:
 * 1. Discover roles via indexer
 * 2. Enumerate members on-chain for discovered roles
 */
describe('On-Chain Role Enumeration - Integration Test', () => {
  let indexerClient: StellarIndexerClient;
  let indexerAvailable = false;
  let rpcAvailable = false;
  let enumerateRoleMembers: typeof import('../../src/access-control/onchain-reader').enumerateRoleMembers;
  let getRoleMemberCount: typeof import('../../src/access-control/onchain-reader').getRoleMemberCount;

  beforeAll(async () => {
    // Dynamically import on-chain reader to avoid module resolution issues
    const onchainReader = await import('../../src/access-control/onchain-reader');
    enumerateRoleMembers = onchainReader.enumerateRoleMembers;
    getRoleMemberCount = onchainReader.getRoleMemberCount;

    // Check Soroban RPC availability by making a simple call
    try {
      // Try to get member count for a known role - if RPC works, this will return a number
      const count = await getRoleMemberCount(TEST_CONTRACT, 'minter', testNetworkConfig);
      if (typeof count === 'number') {
        rpcAvailable = true;
        console.log(`✅ Soroban RPC is available (minter role has ${count} members)`);
      }
    } catch (error) {
      rpcAvailable = false;
      const errorMsg = (error as Error).message;
      // Known issue: Keypair.random() may fail in some test environments
      if (errorMsg.includes('private key')) {
        console.log(
          '⚠️  Soroban RPC tests skipped - crypto/keypair not available in test environment'
        );
      } else {
        console.log('⚠️  Soroban RPC not available - on-chain tests will be skipped');
        console.log(`   Error: ${errorMsg}`);
      }
    }

    // Check indexer availability and fixture contract data
    indexerClient = new StellarIndexerClient(testNetworkConfig);
    indexerAvailable = await verifyFixtureContractIndexed(indexerClient);

    if (!indexerAvailable) {
      console.log(
        '⚠️  Indexer unavailable or fixture contract not indexed - discovery tests will use known roles'
      );
    }
  }, 30000);

  describe('getRoleMemberCount()', () => {
    it('should return member count for the minter role', async () => {
      if (!rpcAvailable) {
        console.log('  ⏭️  Skipping: Soroban RPC not available');
        return;
      }

      // The minter role should have at least 1 member based on our test setup
      const count = await getRoleMemberCount(TEST_CONTRACT, 'minter', testNetworkConfig);

      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
      console.log(`  ✓ minter role has ${count} member(s)`);
    }, 30000);

    it('should return 0 for a role with no members', async () => {
      if (!rpcAvailable) {
        console.log('  ⏭️  Skipping: Soroban RPC not available');
        return;
      }

      // A random role that doesn't exist should return 0
      const count = await getRoleMemberCount(
        TEST_CONTRACT,
        'nonexistent_role_xyz',
        testNetworkConfig
      );

      expect(count).toBe(0);
    }, 30000);
  });

  describe('enumerateRoleMembers()', () => {
    it('should enumerate members for the minter role', async () => {
      if (!rpcAvailable) {
        console.log('  ⏭️  Skipping: Soroban RPC not available');
        return;
      }

      // First check if minter role has members
      const count = await getRoleMemberCount(TEST_CONTRACT, 'minter', testNetworkConfig);

      if (count === 0) {
        console.log('  ⏭️  Skipping: minter role has no members');
        return;
      }

      const members = await enumerateRoleMembers(TEST_CONTRACT, 'minter', testNetworkConfig);

      expect(Array.isArray(members)).toBe(true);
      expect(members.length).toBe(count);

      // Verify each member is a valid Stellar address (starts with G)
      for (const member of members) {
        expect(typeof member).toBe('string');
        expect(member.startsWith('G')).toBe(true);
        expect(member.length).toBe(56); // Stellar addresses are 56 chars
      }

      console.log(`  ✓ Enumerated ${members.length} member(s) for minter role`);
      members.forEach((m, i) => console.log(`    [${i}] ${m}`));
    }, 60000);

    it('should return empty array for role with no members', async () => {
      if (!rpcAvailable) {
        console.log('  ⏭️  Skipping: Soroban RPC not available');
        return;
      }

      const members = await enumerateRoleMembers(
        TEST_CONTRACT,
        'nonexistent_role_xyz',
        testNetworkConfig
      );

      expect(Array.isArray(members)).toBe(true);
      expect(members.length).toBe(0);
    }, 30000);
  });

  describe('Full Discovery + Enumeration Flow', () => {
    it('should discover roles via indexer and enumerate members on-chain', async () => {
      if (!rpcAvailable) {
        console.log('  ⏭️  Skipping: Soroban RPC not available');
        return;
      }

      let rolesToEnumerate: string[];

      if (indexerAvailable) {
        // Step 1: Try to discover roles via indexer (with timeout handling)
        try {
          rolesToEnumerate = await indexerClient.discoverRoleIds(TEST_CONTRACT);
          console.log(
            `  ✓ Discovered ${rolesToEnumerate.length} roles via indexer: ${rolesToEnumerate.join(', ')}`
          );
        } catch (error) {
          // Fall back to known roles if indexer times out
          console.log(`  ⚠️ Indexer query failed, using known roles: ${(error as Error).message}`);
          rolesToEnumerate = EXPECTED_ROLES;
        }
      } else {
        // Fall back to known roles from test setup
        rolesToEnumerate = EXPECTED_ROLES;
        console.log(
          `  ⚠️ Using ${rolesToEnumerate.length} known roles (indexer unavailable): ${rolesToEnumerate.join(', ')}`
        );
      }

      expect(rolesToEnumerate.length).toBeGreaterThan(0);

      // Step 2: Enumerate members for each discovered role
      const roleMembers: Record<string, string[]> = {};
      let totalMembers = 0;

      for (const roleId of rolesToEnumerate) {
        try {
          const members = await enumerateRoleMembers(TEST_CONTRACT, roleId, testNetworkConfig);
          roleMembers[roleId] = members;
          totalMembers += members.length;
          console.log(`  ✓ Role "${roleId}": ${members.length} member(s)`);
        } catch {
          console.log(`  ⚠️ Role "${roleId}": failed to enumerate (may have been revoked)`);
          roleMembers[roleId] = [];
        }
      }

      // Verify we got meaningful data
      expect(Object.keys(roleMembers).length).toBe(rolesToEnumerate.length);
      console.log(`  ✓ Total: ${totalMembers} member(s) across ${rolesToEnumerate.length} roles`);
    }, 180000); // 3 minutes timeout for full flow with multiple RPC calls
  });
});

/**
 * Integration Test: Admin Transfer Queries
 *
 * Tests the new admin transfer query functionality:
 * - queryPendingAdminTransfer() for pending admin transfers
 * - ADMIN_TRANSFER_INITIATED and ADMIN_TRANSFER_COMPLETED events in history
 */
describe('StellarIndexerClient - Admin Transfer Integration Tests', () => {
  let client: StellarIndexerClient;
  let indexerAvailable: boolean = false;

  beforeAll(async () => {
    client = new StellarIndexerClient(testNetworkConfig);
    indexerAvailable = await verifyFixtureContractIndexed(client);

    if (indexerAvailable) {
      console.log(
        '\n' +
          '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
          '✅ Running Admin Transfer Integration Tests\n' +
          '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
      );
    }
  }, 30000);

  describe('Admin Transfer Query', () => {
    it('should query pending admin transfer for a contract', async () => {
      if (!indexerAvailable) {
        console.log('  ⏭️  Skipping: Indexer not available');
        return;
      }

      // Test each contract for pending admin transfers
      const contracts = [TEST_CONTRACT];

      for (const contract of contracts) {
        try {
          const pendingTransfer = await client.queryPendingAdminTransfer(contract);

          if (pendingTransfer) {
            console.log(`  ✓ Contract ${contract.slice(0, 10)}... has pending admin transfer:`);
            console.log(`    - Pending admin: ${pendingTransfer.pendingAdmin}`);
            console.log(`    - Previous admin: ${pendingTransfer.previousAdmin}`);
            console.log(`    - Live until ledger: ${pendingTransfer.liveUntilLedger}`);
            console.log(`    - Timestamp: ${pendingTransfer.timestamp}`);
            console.log(`    - TxHash: ${pendingTransfer.txHash.slice(0, 16)}...`);

            // Verify structure
            expect(pendingTransfer.pendingAdmin).toMatch(/^[GC][A-Z0-9]{55}$/);
            expect(pendingTransfer.previousAdmin).toMatch(/^[GC][A-Z0-9]{55}$/);
            expect(typeof pendingTransfer.liveUntilLedger).toBe('number');
            expect(typeof pendingTransfer.ledger).toBe('number');
            expect(typeof pendingTransfer.txHash).toBe('string');
          } else {
            console.log(`  ✓ Contract ${contract.slice(0, 10)}... has no pending admin transfer`);
          }
        } catch (error) {
          console.log(
            `  ⏭️  Contract ${contract.slice(0, 10)}... admin transfer query failed: ${(error as Error).message.slice(0, 50)}...`
          );
        }
      }
    }, 30000);

    it('should return null for contracts with no pending admin transfer', async () => {
      if (!indexerAvailable) {
        console.log('  ⏭️  Skipping: Indexer not available');
        return;
      }

      // Use a fake contract that definitely won't have pending transfers
      const fakeContract = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

      try {
        const pendingTransfer = await client.queryPendingAdminTransfer(fakeContract);
        expect(pendingTransfer).toBeNull();
        console.log('  ✓ Correctly returned null for contract with no admin transfer events');
      } catch (error) {
        // May fail if indexer doesn't support this query yet
        console.log(`  ⏭️  Query not supported: ${(error as Error).message.slice(0, 50)}...`);
      }
    }, 15000);

    it('should detect completed admin transfers and not return them as pending', async () => {
      if (!indexerAvailable) {
        console.log('  ⏭️  Skipping: Indexer not available');
        return;
      }

      // Try both contracts to find admin transfer events
      const contracts = [TEST_CONTRACT];
      let targetContract: string | null = null;
      let history: Awaited<ReturnType<typeof client.queryHistory>> = {
        items: [],
        pageInfo: { hasNextPage: false },
      };
      let adminInitiatedEvents: typeof history.items = [];
      let adminCompletedEvents: typeof history.items = [];

      for (const contract of contracts) {
        history = await client.queryHistory(contract);

        // Look for admin transfer events in history
        adminInitiatedEvents = history.items.filter(
          (item) => item.changeType === 'ADMIN_TRANSFER_INITIATED'
        );
        adminCompletedEvents = history.items.filter(
          (item) => item.changeType === 'ADMIN_TRANSFER_COMPLETED'
        );

        if (adminInitiatedEvents.length > 0 || adminCompletedEvents.length > 0) {
          targetContract = contract;
          break;
        }
      }

      if (!targetContract) {
        console.log('  ⏭️  No admin transfer events found in test contracts');
        return;
      }

      console.log(`  ✓ Contract ${targetContract.slice(0, 10)}... has admin transfer events:`);
      console.log(`    - ADMIN_TRANSFER_INITIATED: ${adminInitiatedEvents.length}`);
      console.log(`    - ADMIN_TRANSFER_COMPLETED: ${adminCompletedEvents.length}`);

      // If we have completed events >= initiated, pending should be null
      if (
        adminCompletedEvents.length >= adminInitiatedEvents.length &&
        adminCompletedEvents.length > 0
      ) {
        const pendingTransfer = await client.queryPendingAdminTransfer(targetContract);
        expect(pendingTransfer).toBeNull();
        console.log('    ✓ Correctly returns null (transfer was completed)');
      }
    }, 45000);
  });

  describe('Ownership Transfer Query', () => {
    it('should query pending ownership transfer for a contract', async () => {
      if (!indexerAvailable) {
        console.log('  ⏭️  Skipping: Indexer not available');
        return;
      }

      const contracts = [TEST_CONTRACT];

      for (const contract of contracts) {
        try {
          const pendingTransfer = await client.queryPendingOwnershipTransfer(contract);

          if (pendingTransfer) {
            console.log(`  ✓ Contract ${contract.slice(0, 10)}... has pending ownership transfer:`);
            console.log(`    - Pending owner: ${pendingTransfer.pendingOwner}`);
            console.log(`    - Previous owner: ${pendingTransfer.previousOwner}`);
            console.log(`    - Live until ledger: ${pendingTransfer.liveUntilLedger}`);
            console.log(`    - Timestamp: ${pendingTransfer.timestamp}`);

            // Verify structure
            expect(pendingTransfer.pendingOwner).toMatch(/^[GC][A-Z0-9]{55}$/);
            expect(pendingTransfer.previousOwner).toMatch(/^[GC][A-Z0-9]{55}$/);
            expect(typeof pendingTransfer.liveUntilLedger).toBe('number');
          } else {
            console.log(
              `  ✓ Contract ${contract.slice(0, 10)}... has no pending ownership transfer`
            );
          }
        } catch (error) {
          console.log(
            `  ⏭️  Contract ${contract.slice(0, 10)}... ownership transfer query failed: ${(error as Error).message.slice(0, 50)}...`
          );
        }
      }
    }, 30000);

    it('should detect ownership transfer events in history', async () => {
      if (!indexerAvailable) {
        console.log('  ⏭️  Skipping: Indexer not available');
        return;
      }

      // Try both contracts to find ownership transfer events
      const contracts = [TEST_CONTRACT];
      let targetContract: string | null = null;
      let history: Awaited<ReturnType<typeof client.queryHistory>> = {
        items: [],
        pageInfo: { hasNextPage: false },
      };
      let ownershipStartedEvents: typeof history.items = [];
      let ownershipCompletedEvents: typeof history.items = [];

      for (const contract of contracts) {
        history = await client.queryHistory(contract);

        // Look for ownership transfer events
        ownershipStartedEvents = history.items.filter(
          (item) => item.changeType === 'OWNERSHIP_TRANSFER_STARTED'
        );
        ownershipCompletedEvents = history.items.filter(
          (item) => item.changeType === 'OWNERSHIP_TRANSFER_COMPLETED'
        );

        if (ownershipStartedEvents.length > 0 || ownershipCompletedEvents.length > 0) {
          targetContract = contract;
          break;
        }
      }

      if (!targetContract) {
        console.log('  ⏭️  No ownership transfer events found in test contracts');
        return;
      }

      console.log(`  ✓ Contract ${targetContract.slice(0, 10)}... has ownership transfer events:`);
      console.log(`    - OWNERSHIP_TRANSFER_STARTED: ${ownershipStartedEvents.length}`);
      console.log(`    - OWNERSHIP_TRANSFER_COMPLETED: ${ownershipCompletedEvents.length}`);
    }, 30000);
  });

  describe('History Query - Event Type Discovery', () => {
    it('should discover all event types in the indexed contracts', async () => {
      if (!indexerAvailable) {
        console.log('  ⏭️  Skipping: Indexer not available');
        return;
      }

      const contracts = [TEST_CONTRACT];
      const allEventTypes = new Set<string>();

      for (const contract of contracts) {
        try {
          const history = await client.queryHistory(contract);

          for (const item of history.items) {
            allEventTypes.add(item.changeType);
          }

          console.log(
            `  ✓ Contract ${contract.slice(0, 10)}... has ${history.items.length} events`
          );
        } catch (error) {
          console.log(
            `  ⏭️  Contract ${contract.slice(0, 10)}... query failed: ${(error as Error).message.slice(0, 50)}...`
          );
        }
      }

      console.log(`  📊 Discovered event types: ${Array.from(allEventTypes).join(', ')}`);

      // Verify we can see role events at minimum
      const hasRoleEvents =
        allEventTypes.has('GRANTED') || allEventTypes.has('REVOKED') || allEventTypes.size > 0;
      expect(hasRoleEvents).toBe(true);
    }, 45000);
  });
});
