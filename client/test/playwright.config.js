import { defineConfig } from '@playwright/test'
// CI has no GPU/X display. Use real EGL/Mesa software WebGL in Firefox.
const firefoxOptions = {
  firefoxUserPrefs: { 'webgl.force-enabled': true },
  ...(process.platform === 'linux' ? { env: { ...process.env, MOZ_WEBGL_FORCE_EGL: '1', LIBGL_ALWAYS_SOFTWARE: '1' } } : {}),
}
export default defineConfig({
  testDir: './browser', timeout: 30000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:5183', viewport: { width: 1280, height: 800 }, trace: 'retain-on-failure' },
  webServer: { command: 'pnpm dev --host 127.0.0.1 --port 5183 --strictPort --force', url: 'http://127.0.0.1:5183', reuseExistingServer: false, timeout: 30000 },
  projects: [{name:'chromium',use:{browserName:'chromium',channel:'chromium',launchOptions:{args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}}},{name:'firefox',use:{browserName:'firefox',launchOptions:firefoxOptions}},{name:'webkit',use:{browserName:'webkit'}}],
})
