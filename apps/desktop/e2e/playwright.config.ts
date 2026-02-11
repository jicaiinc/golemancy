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
  ],
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
})
