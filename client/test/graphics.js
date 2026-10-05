import assert from 'node:assert/strict'
import * as playwright from '@playwright/test'
import config from './playwright.config.js'

// Fail early with engine diagnostics when CI cannot create the WebGL view.
for(const project of config.projects) {
  const {browserName,channel,launchOptions}=project.use
  const browser=await playwright[browserName].launch({...launchOptions,channel,headless:true})
  try {
    const page=await browser.newPage()
    page.on('console',message=>console.log(`${browserName}: ${message.text()}`))
    const graphics=await page.evaluate(()=>{
      const gl=document.createElement('canvas').getContext('webgl')
      return gl && {renderer:gl.getParameter(gl.RENDERER),version:gl.getParameter(gl.VERSION)}
    })
    console.log({browser:browserName,version:browser.version(),graphics})
    assert.ok(graphics, `${browserName} must support WebGL for official challenges`)
  } finally {await browser.close()}
}
