import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/metadata.ts', 'src/networks.ts', 'src/vite-config.ts'],
  format: ['esm', 'cjs'],
  dts: {
    resolve: ['@openzeppelin/adapter-evm-core'],
    compilerOptions: {
      composite: false,
      incremental: false,
    },
  },
  sourcemap: true,
  clean: true,
});
