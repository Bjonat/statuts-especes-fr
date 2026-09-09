import { defineConfig, devices } from '@playwright/test'

const HOST = process.env.E2E_HOST || '127.0.0.1'
const PORT = process.env.E2E_PORT || '4177'
const baseURL = `http://${HOST}:${PORT}`

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    serviceWorkers: 'allow',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'fr-FR',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'node e2e/test-server.mjs',
    url: `${baseURL}/__test__/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
