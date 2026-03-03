import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.live.test.ts'],
    envDir: '../../',

    // Memory isolation: 60 test files with SQLite, child_process spawns, etc.
    // Forks ensure each worker's memory is fully reclaimed on exit.
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 4,   // 60 test files, no jsdom overhead — 4 forks balances speed vs memory
        minForks: 1,
      },
    },

    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/**/*.test.ts', 'src/**/*.live.test.ts', 'src/index.ts', 'src/test/**'],
    },
  },
})
