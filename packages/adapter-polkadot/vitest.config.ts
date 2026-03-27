import path from 'path';
import { defineConfig, mergeConfig } from 'vitest/config';

import { sharedVitestConfig } from '../../vitest.shared.config';

export default mergeConfig(
  sharedVitestConfig,
  defineConfig({
    resolve: {
      alias: {
        '@openzeppelin/adapter-evm-core': path.resolve(
          __dirname,
          '../adapter-evm-core/src/index.ts'
        ),
      },
    },
    test: {
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    },
  })
);
