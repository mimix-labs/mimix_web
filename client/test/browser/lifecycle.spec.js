import {test,expect} from '@playwright/test'
import {prepare,openChallenge} from './fixtures.js'
for(const id of ['mathematics','science']) {
  test(`${id} restores a fresh view after BFCache pageshow`,async({page})=>{
    await prepare(page);await openChallenge(page,id)
    await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})))
    await expect(page.locator('#three-canvas canvas')).toHaveCount(0)
    await Promise.all([
      page.waitForEvent('framenavigated',frame=>frame===page.mainFrame()),
      page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))),
    ])
    await expect(page.locator('#three-canvas canvas')).toHaveCount(1)
    await expect(page.locator('body')).toHaveAttribute('data-challenge-state','running')
  })
}
test('science controls cannot select an atom after disposal',async({page})=>{
  const {errors}=await prepare(page);await openChallenge(page,'science')
  await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')))
  await expect(page.locator('#three-canvas canvas')).toHaveCount(0)
  await page.locator('[data-symbol="Mg"]').click()
  expect(errors).toEqual([])
})
