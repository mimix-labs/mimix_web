import {defineConfig} from '@playwright/test'
import browserConfig from './playwright.config.js'
export default defineConfig({
  ...browserConfig,
  testDir:'./production',outputDir:'../test-results/production',
  use:{...browserConfig.use,baseURL:process.env.MIMIX_TEST_BASE_URL || 'http://127.0.0.1:5184'},
  webServer:process.env.MIMIX_TEST_BASE_URL ? undefined : {
    command:'pnpm preview --host 127.0.0.1 --port 5184 --strictPort',
    url:'http://127.0.0.1:5184',reuseExistingServer:false,
  },
  projects:browserConfig.projects.filter(project=>project.name==='chromium'),
})
