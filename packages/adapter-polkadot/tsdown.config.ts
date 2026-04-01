import { readFileSync } from 'fs';
import { defineConfig } from 'tsdown';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
const ozPeerMinimums: Record<string, string> = {};
for (const [name, range] of Object.entries(pkg.peerDependencies ?? {})) {
  if (name.startsWith('@openzeppelin/')) {
    ozPeerMinimums[name] = (range as string).replace(/^\^/, '');
  }
}

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
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    '@rainbow-me/rainbowkit',
    '@tanstack/react-query',
    '@openzeppelin/ui-components',
    '@openzeppelin/ui-react',
    '@openzeppelin/ui-types',
    '@openzeppelin/ui-utils',
    'lucide-react',
    'wagmi',
    '@wagmi/core',
    '@wagmi/connectors',
    'viem',
  ],
  define: {
    __OZ_PEER_MINIMUMS__: JSON.stringify(ozPeerMinimums),
  },
});
