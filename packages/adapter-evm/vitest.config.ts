import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';

import { sharedVitestConfig } from '../../vitest.shared.config';

export default defineConfig(
  mergeConfig(sharedVitestConfig, {
    resolve: {
      alias: {
        '@openzeppelin/adapter-evm/addressing': fileURLToPath(
          new URL('./src/capabilities/addressing.ts', import.meta.url)
        ),
        '@openzeppelin/adapter-evm/explorer': fileURLToPath(
          new URL('./src/capabilities/explorer.ts', import.meta.url)
        ),
        '@openzeppelin/adapter-evm/network-catalog': fileURLToPath(
          new URL('./src/capabilities/network-catalog.ts', import.meta.url)
        ),
        '@openzeppelin/adapter-evm/ui-labels': fileURLToPath(
          new URL('./src/capabilities/ui-labels.ts', import.meta.url)
        ),
        '@openzeppelin/adapter-evm-core/addressing': fileURLToPath(
          new URL('../adapter-evm-core/src/capabilities/addressing.ts', import.meta.url)
        ),
        '@openzeppelin/adapter-evm-core/explorer': fileURLToPath(
          new URL('../adapter-evm-core/src/capabilities/explorer.ts', import.meta.url)
        ),
        '@openzeppelin/adapter-evm-core/network-catalog': fileURLToPath(
          new URL('../adapter-evm-core/src/capabilities/network-catalog.ts', import.meta.url)
        ),
        '@openzeppelin/adapter-evm-core/ui-labels': fileURLToPath(
          new URL('../adapter-evm-core/src/capabilities/ui-labels.ts', import.meta.url)
        ),
      },
    },
  })
);
