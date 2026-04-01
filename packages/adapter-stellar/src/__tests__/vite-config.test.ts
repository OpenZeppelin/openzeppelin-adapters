import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

import { getStellarViteConfig } from '../vite-config';

const require = createRequire(import.meta.url);

describe('getStellarViteConfig', () => {
  it('aliases and prebundles the Stellar SDK Node entry', () => {
    const config = getStellarViteConfig();

    expect(config.resolve?.alias).toEqual({
      '@stellar/stellar-sdk': require.resolve('@stellar/stellar-sdk'),
    });
    expect(config.resolve?.dedupe).toEqual([
      '@stellar/stellar-sdk',
      '@creit.tech/stellar-wallets-kit',
    ]);
    expect(config.optimizeDeps?.include).toEqual([
      '@stellar/stellar-sdk',
      '@creit.tech/stellar-wallets-kit',
      '@stellar/freighter-api',
      'buffer',
    ]);
  });
});
