import { test, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { prepare, openChallenge, handAt, handPoint, readScene } from './fixtures.js'
const packageRoot=fileURLToPath(new URL('../../../',import.meta.url)).replace(/\/$/,'')
test.beforeEach(async({page})=>{await page.addInitScript(root=>{window.packageRoot=root},packageRoot)})
for(const id of ['mathematics','science']) {
  test(`${id} public route boots versioned package without application globals`,async({page})=>{
    const {errors}=await prepare(page);await openChallenge(page,id)
    await expect(page.locator('body')).toHaveAttribute('data-challenge-runtime','package')
    await expect(page.locator('body')).toHaveAttribute('data-challenge-version','1.0.0')
    expect(await page.evaluate(()=>[typeof window.THREE,typeof window.io,typeof window.robotManager])).toEqual(['undefined','undefined','undefined'])
    expect(errors).toEqual([])
  })
  test(`${id} rollback keeps vision query, guide and original public assets`,async({page})=>{
    const {errors}=await prepare(page);await openChallenge(page,id,'legacy')
    expect(page.url()).toContain(`/legacy/challenges/${id}/index.html?vision=robot`)
    await expect(page.getByRole('button',{name:'Cómo usar las manos'})).toBeVisible()
    await page.getByRole('button',{name:'Cómo usar las manos'}).click()
    await expect(page.getByRole('heading',{name:'Controla con ambas manos'})).toBeVisible()
    expect(errors).toEqual([])
  })
}
test('mathematics preserves four shapes, vertex drag, fist rotation and SDK host effects',async({page},testInfo)=>{
  const {errors,posts}=await prepare(page)
  const snapshots=[]
  for(const mode of ['legacy','package']) {
    await openChallenge(page,'mathematics',mode)
    const postCount=posts.filter(p=>p.url==='/api/challenges/events').length
    const results=[]
    for(const [selector,name,count] of [['#preview-cube','cubo',8],['#preview-octahedron','octaedro',6],['#preview-prism','prisma',12],['#preview-pyramid','piramide',5]]) {
      await handAt(page,selector)
      const state=await readScene(page,'mathematics',mode)
      expect(state.shape).toBe(name);expect(state.corners).toHaveLength(count);results.push(state.corners)
    }
    await expect(page.locator('#robot-dialogue-text')).toHaveText('Pirámide')
    const before=await readScene(page,'mathematics',mode)
    await handPoint(page,600,400,{hand:'Right'});await handPoint(page,660,430,{hand:'Right'})
    const rotated=await readScene(page,'mathematics',mode)
    expect(rotated.camera).not.toEqual(before.camera)
    // Project a real vertex then drag it through the unchanged gesture pipeline.
    const vertex=await page.evaluate(async mode=>{
      const m=await import(mode==='legacy'?'/challenges/mathematics/threeScene.js':`/@fs${window.packageRoot}/packages/challenge-mathematics/dist/threeScene.js`)
      m.camera.updateMatrixWorld()
      const p=m.cornerMarkers[0].position.clone().project(m.camera)
      return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2}
    },mode)
    await handPoint(page,vertex.x,vertex.y,{pinch:false});await handPoint(page,vertex.x,vertex.y);await handPoint(page,vertex.x+20,vertex.y+10)
    const dragged=await readScene(page,'mathematics',mode)
    expect(dragged.corners[0]).not.toEqual(rotated.corners[0])
    snapshots.push({results,camera:rotated.camera,corners:dragged.corners})
    await expect.poll(()=>posts.filter(p=>p.url==='/api/challenges/events').length-postCount).toBe(mode==='legacy'?9:3)
    await page.screenshot({path:testInfo.outputPath(`mathematics-${mode}.png`)})
  }
  expect(snapshots[1]).toEqual(snapshots[0])
  expect(posts.filter(p=>p.url==='/api/challenges/events')).toHaveLength(13)
  expect(posts.filter(p=>p.url==='/api/challenges/events').every(p=>p.body.type==='lenvantarceja')).toBe(true)
  expect(errors).toEqual([])
})
test('science preserves 118 cells, click/pinch selection, ions, limits, rotation and return',async({page},testInfo)=>{
  const {errors,posts}=await prepare(page)
  const snapshots=[]
  for(const mode of ['legacy','package']) {
    await openChallenge(page,'science',mode)
    await expect(page.locator('button.element-cell')).toHaveCount(118)
    await page.locator('[data-symbol="Mg"]').click()
    await expect(page.locator('#atom-protons')).toHaveText('12');await expect(page.locator('#atom-neutrons')).toHaveText('12')
    await page.locator('#atom-charge-up').click();await expect(page.locator('#atom-electrons')).toHaveText('11')
    await page.locator('#atom-charge-up').click();await page.locator('#atom-charge-up').click()
    await expect(page.locator('#atom-charge-up')).toBeDisabled()
    await handAt(page,'#atom-charge-down');await expect(page.locator('#atom-charge')).toHaveText('+2')
    await handAt(page,'#atom-back',{pinch:false});await handAt(page,'#atom-back');await expect(page.locator('#atom-focus')).toBeHidden()
    await handAt(page,'[data-symbol="H"]',{pinch:false});await handAt(page,'[data-symbol="H"]')
    await expect(page.locator('#atom-symbol')).toHaveText('H')
    await page.locator('#atom-charge-up').click();await expect(page.locator('#atom-electrons')).toHaveText('0');await expect(page.locator('#atom-charge-up')).toBeDisabled()
    await page.locator('#atom-back').click();await page.locator('[data-symbol="Og"]').click()
    await expect(page.locator('#atom-protons')).toHaveText('118')
    const before=await readScene(page,'science',mode)
    await handAt(page,'#atom-render-region',{pinch:false});await handAt(page,'#atom-render-region');await handAt(page,'#atom-render-region',{dx:30,dy:20})
    const after=await readScene(page,'science',mode);expect(after.atomRotation).not.toEqual(before.atomRotation)
    snapshots.push(await page.locator('#atom-details').innerText())
    await page.screenshot({path:testInfo.outputPath(`science-${mode}.png`)})
  }
  expect(snapshots[1]).toEqual(snapshots[0]);expect(errors).toEqual([])
  expect(posts.some(p=>p.url==='/api/robot/context'&&p.body.selectedObject==='Mg')).toBe(true)
  expect(posts.some(p=>p.url==='/api/challenges/events')).toBe(false)
})
