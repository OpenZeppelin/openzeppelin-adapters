import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@openzeppelin/adapter-stellar/addressing': fileURLToPath(
        new URL('./src/capabilities/addressing.ts', import.meta.url)
      ),
      '@openzeppelin/adapter-stellar/explorer': fileURLToPath(
        new URL('./src/capabilities/explorer.ts', import.meta.url)
      ),
      '@openzeppelin/adapter-stellar/network-catalog': fileURLToPath(
        new URL('./src/capabilities/network-catalog.ts', import.meta.url)
      ),
      '@openzeppelin/adapter-stellar/ui-labels': fileURLToPath(
        new URL('./src/capabilities/ui-labels.ts', import.meta.url)
      ),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    passWithNoTests: true,
    name: 'adapter-stellar',
  },
});
