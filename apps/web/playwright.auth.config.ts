import { defineConfig } from '@playwright/test'

// Run against the local Next dev server with the existing Clerk development
// environment. Fixture accounts are opt-in through MIMIX_AUTH_SMOKE=1.
export default defineConfig({
  testDir: './test/browser', testMatch: 'auth-experience.spec.ts',
  workers: 1, timeout: 120000, outputDir: 'test-results/auth',
  use: { baseURL: 'http://127.0.0.1:4311', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: {
    browserName: 'chromium', channel: 'chromium',
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  } }],
})
