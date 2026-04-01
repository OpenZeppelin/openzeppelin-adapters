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
  entry: {
    index: 'src/index.ts',
    metadata: 'src/metadata.ts',
    networks: 'src/networks.ts',
    config: 'src/config.ts',
    'vite-config': 'src/vite-config.ts',
    addressing: 'src/capabilities/addressing.ts',
    explorer: 'src/capabilities/explorer.ts',
    'network-catalog': 'src/capabilities/network-catalog.ts',
    'ui-labels': 'src/capabilities/ui-labels.ts',
    'contract-loading': 'src/capabilities/contract-loading.ts',
    schema: 'src/capabilities/schema.ts',
    'type-mapping': 'src/capabilities/type-mapping.ts',
    query: 'src/capabilities/query.ts',
    execution: 'src/capabilities/execution.ts',
    wallet: 'src/capabilities/wallet.ts',
    'ui-kit': 'src/capabilities/ui-kit.ts',
    relayer: 'src/capabilities/relayer.ts',
    'access-control': 'src/capabilities/access-control.ts',
    declarative: 'src/profiles/declarative.ts',
    viewer: 'src/profiles/viewer.ts',
    transactor: 'src/profiles/transactor.ts',
    composer: 'src/profiles/composer.ts',
    operator: 'src/profiles/operator.ts',
  },
  format: ['esm', 'cjs'],
  dts: {
    resolve: ['@openzeppelin/adapter-evm-core', '@openzeppelin/adapter-runtime-utils'],
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
  noExternal: ['@openzeppelin/adapter-evm-core', '@openzeppelin/adapter-runtime-utils'],
  define: {
    __OZ_PEER_MINIMUMS__: JSON.stringify(ozPeerMinimums),
  },
});
