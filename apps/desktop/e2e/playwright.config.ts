import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 1,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: '../test-results/html' }],
  ],
  outputDir: '../test-results/artifacts',
  projects: [
    {
      name: 'smoke',
      testDir: './smoke',
    },
    {
      name: 'server',
      testDir: './server',
      dependencies: ['smoke'],
    },
    {
      name: 'ai',
      testDir: './ai',
      dependencies: ['server'],
    },
    {
      name: 'onboarding',
      testDir: './onboarding',
      // Independent from smoke/server/ai — no dependencies.
      // Uses its own fixture (fixtures/onboarding.ts) which reads
      // GOLEMANCY_ONBOARDING_DATA_DIR (empty providers → onboarding flow).
    },
  ],
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
})
