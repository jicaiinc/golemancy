import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@golemancy/db/schema': fromRoot('./packages/db/src/schema/index.ts'),
      '@golemancy/db': fromRoot('./packages/db/src/index.ts'),
      '@golemancy/i18n/react': fromRoot('./packages/i18n/src/react.ts'),
      '@golemancy/i18n': fromRoot('./packages/i18n/src/index.ts'),
      '@golemancy/protocol': fromRoot('./packages/protocol/src/index.ts'),
      '@golemancy/runtime': fromRoot('./packages/runtime/src/index.ts'),
      '@golemancy/shared': fromRoot('./packages/shared/src/index.ts'),
      '@golemancy/tools': fromRoot('./packages/tools/src/index.ts'),
      '@golemancy/ui/styles.css': fromRoot('./packages/ui/src/styles/global.css'),
      '@golemancy/ui': fromRoot('./packages/ui/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['apps/**/*.test.ts', 'packages/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.turbo/**',
      '**/.vite/**',
      '**/target/**',
      'tests/e2e/**',
    ],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['apps/*/src/**/*.ts', 'packages/*/src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/*.d.ts',
        'packages/*/src/**/index.ts',
        'packages/*/src/schema/**',
      ],
    },
  },
});
