import { readFileSync } from 'fs'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'

const sentryEnabled = !!process.env.SENTRY_AUTH_TOKEN
const appVersion = JSON.parse(readFileSync('package.json', 'utf-8')).version

export default defineConfig({
  main: {
    build: {
      sourcemap: sentryEnabled,
    },
  },
  preload: {
    build: {
      sourcemap: sentryEnabled,
    },
  },
  renderer: {
    plugins: [
      react(),
      ...(sentryEnabled
        ? [sentryVitePlugin({
            org: process.env.SENTRY_ORG || 'jicai-inc',
            project: process.env.SENTRY_PROJECT || 'golemancy-desktop',
            authToken: process.env.SENTRY_AUTH_TOKEN,
            release: { name: appVersion },
          })]
        : []),
    ],
    publicDir: 'src/renderer/public',
    build: {
      sourcemap: sentryEnabled,
    },
  },
})
