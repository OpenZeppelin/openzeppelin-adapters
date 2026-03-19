import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/metadata.ts',
    'src/networks.ts',
    'src/config.ts',
    'src/vite-config.ts',
  ],
  format: ['esm', 'cjs'],
  dts: {
    compilerOptions: {
      composite: false,
      incremental: false,
    },
  },
  sourcemap: true,
  clean: true,
  external: ['@midnight-ntwrk/zswap', '@midnight-ntwrk/onchain-runtime', '@midnight-ntwrk/ledger'],
});
