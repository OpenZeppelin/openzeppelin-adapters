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
  entry: [
    'src/index.ts',
    'src/metadata.ts',
    'src/networks.ts',
    'src/config.ts',
    'src/vite-config.ts',
  ],
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
    '@rainbow-me/rainbowkit',
    '@openzeppelin/ui-components',
    '@openzeppelin/ui-react',
    'lucide-react',
  ],
  noExternal: ['@openzeppelin/adapter-evm-core'],
  define: {
    __OZ_PEER_MINIMUMS__: JSON.stringify(ozPeerMinimums),
  },
});
