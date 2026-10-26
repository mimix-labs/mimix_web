import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './test', workers: 1, timeout: 90000,
  use: {
    baseURL: process.env.MIMIX_BASE_URL || 'http://127.0.0.1:5175',
    permissions: ['camera'], viewport: { width: 1280, height: 800 },
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
    screenshot: 'only-on-failure',
  },
  outputDir: '../test-results',
  webServer: process.env.MIMIX_BASE_URL ? undefined : {
    command: 'npm run preview -- --host 127.0.0.1 --port 5175 --strictPort',
    url: 'http://127.0.0.1:5175', reuseExistingServer: true,
  },
})
