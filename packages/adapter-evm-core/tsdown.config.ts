import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/vite-config.ts'],
  format: ['esm', 'cjs'],
  dts: {
    compilerOptions: {
      composite: false,
      incremental: false,
    },
  },
  sourcemap: true,
  clean: true,
  external: [
    'react',
    'react-dom',
    '@rainbow-me/rainbowkit',
    '@openzeppelin/ui-components',
    '@openzeppelin/ui-react',
    '@openzeppelin/ui-types',
    '@openzeppelin/ui-utils',
    'lucide-react',
  ],
});
