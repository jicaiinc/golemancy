import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'dist'],
    css: false,

    // Memory isolation: each worker is a separate process, memory is released
    // when the process exits. Prevents jsdom + i18n setup from accumulating.
    pool: 'forks',
    maxWorkers: 4,   // 34 test files, 10 cores, 16 GB RAM — 4 concurrent jsdom workers is safe
    minWorkers: 1,

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/components/**', 'src/stores/**', 'src/services/**', 'src/pages/**', 'src/lib/**'],
      exclude: ['src/test/**', '**/*.d.ts', '**/index.ts'],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
  },
})
