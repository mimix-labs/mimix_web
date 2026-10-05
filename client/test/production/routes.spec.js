import {test,expect} from '@playwright/test'
import {prepare,handAt} from '../browser/fixtures.js'
for(const id of ['mathematics','science']) {
  test(`${id} production entry loads all assets and supports rollback`,async({page})=>{
    const {errors}=await prepare(page)
    const buildMode=process.env.MIMIX_TEST_CHALLENGES_MODE || 'package'
    for(const queryMode of ['', '&challengeRuntime=legacy']) {
      await page.goto(`/challenges/${id}/?vision=robot${queryMode}`)
      await expect(page.locator('#three-canvas canvas')).toHaveCount(1)
      await page.waitForFunction(()=>window.sensorStreams.some(stream=>stream.url==='/api/vision/stream'))
      await page.getByRole('button',{name:'Entendido',exact:true}).click()
      if(buildMode==='legacy'||queryMode) expect(page.url()).toContain(`/legacy/challenges/${id}/index.html?vision=robot`)
      else await expect(page.locator('body')).toHaveAttribute('data-challenge-version','1.0.0')
      if(id==='science') {
        await expect(page.locator('button.element-cell')).toHaveCount(118)
        await page.locator('[data-symbol="Mg"]').click()
        await expect(page.locator('#atom-protons')).toHaveText('12')
      } else {
        await handAt(page,'#preview-pyramid')
        await expect(page.locator('#robot-dialogue-text')).toHaveText('Pirámide')
      }
      // Force guide to be visible again for the next document, preserving its real code.
      await page.evaluate(()=>localStorage.clear())
    }
    expect(errors).toEqual([])
  })
}
