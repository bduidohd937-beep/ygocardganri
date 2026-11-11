import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests-e2e',
  timeout: 60_000,
  workers: 1,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://127.0.0.1:4173', browserName: 'chromium', headless: true },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 45_000,
  },
  reporter: process.env.CI ? 'github' : 'list',
});