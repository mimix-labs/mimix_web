import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './test/browser', workers: 1, timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:3100', trace: 'retain-on-failure' },
  webServer: { command: 'pnpm start', url: 'http://127.0.0.1:3100/healthz', reuseExistingServer: false, env: { PORT: '3100', HOSTNAME: '127.0.0.1', MIMIX_WEB_AUTH_MODE: 'disabled', MIMIX_LEGACY_ORIGIN: 'http://localhost:5173' } },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
