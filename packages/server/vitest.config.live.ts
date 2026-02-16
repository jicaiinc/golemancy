import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.live.test.ts'],
    envDir: '../../',
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
