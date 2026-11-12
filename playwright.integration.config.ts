import { defineConfig } from '@playwright/test';

// 전용 통합 산출물 E2E 검사. 기존 CARD STUDIO 개발 서버/E2E와 분리.
export default defineConfig({
  testDir: './tests-integration',
  timeout: 60_000,
  workers: 1,
  retries: 0,
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    headless: true,
    ...(process.env.CI ? { channel: 'chrome' as const } : {}),
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/ygocardganri/',
    reuseExistingServer: false,
    timeout: 45_000,
    env: { GITHUB_PAGES: 'true' },
  },
  reporter: process.env.CI ? 'github' : 'list',
});
