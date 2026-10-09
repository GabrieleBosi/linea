// Playwright UI tests. Default target: the static demo build, served locally by `vite preview`
// on port 4173. Playwright builds and serves it itself; every test gets a new browser context, so
// it starts on a clean copy of the seeded data. `npm run e2e`
//
// Full-stack target: a local `npm run dev:live` on port 8888 in replay mode, never the deployed
// URL. Start the app first, then: npx netlify dev:exec "npm run e2e:full"

import { defineConfig } from '@playwright/test'
import { fullStack as full } from './tests/e2e/target'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 240_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: full ? (process.env.E2E_BASE_URL ?? 'http://localhost:8888') : 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  ...(full
    ? {}
    : {
        webServer: {
          command: 'npm run build:static && npx vite preview --mode static --port 4173 --strictPort',
          url: 'http://localhost:4173',
          reuseExistingServer: !process.env.CI,
          timeout: 300_000,
        },
      }),
})
