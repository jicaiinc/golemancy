import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],

    // Only 4 test files — forks still helps with Playwright integration test memory
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 2,
        minForks: 1,
      },
    },

    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
    },
  },
})
