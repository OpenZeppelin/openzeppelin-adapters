import path from 'path';
import { defineConfig, mergeConfig } from 'vitest/config';

import { sharedVitestConfig } from '../../vitest.shared.config';

export default defineConfig(
  mergeConfig(sharedVitestConfig, {
    resolve: {
      alias: {
        '@openzeppelin/adapter-evm-core': path.resolve(
          __dirname,
          '../adapter-evm-core/src/index.ts'
        ),
      },
    },
  })
);
