import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './browser', timeout: 30000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:5183', viewport: { width: 1280, height: 800 }, trace: 'retain-on-failure' },
  webServer: { command: 'pnpm dev --host 127.0.0.1 --port 5183 --strictPort --force', url: 'http://127.0.0.1:5183', reuseExistingServer: false, timeout: 30000 },
  projects: [{name:'chromium',use:{browserName:'chromium',channel:'chromium',launchOptions:{args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}}},{name:'firefox',use:{browserName:'firefox'}},{name:'webkit',use:{browserName:'webkit'}}],
})
