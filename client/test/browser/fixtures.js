import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../../../packages/challenge-browser/package.json', import.meta.url))
const threeRoot = new URL('./', `file://${require.resolve('three/package.json')}`)
export async function prepare(page) {
  const errors = [], posts = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('https://cdn.jsdelivr.net/npm/three@0.128.0/**', async route => {
    const file = route.request().url().includes('GLTFLoader') ? 'examples/js/loaders/GLTFLoader.js' : 'build/three.min.js'
    await route.fulfill({contentType:'text/javascript',body:await readFile(new URL(file,threeRoot),'utf8')})
  })
  await page.route('https://cdn.jsdelivr.net/npm/@mediapipe/**', route => route.fulfill({contentType:'text/javascript',body:'export const FilesetResolver={};export const HandLandmarker={};'}))
  await page.route(/https:\/\/fonts\./,route=>route.abort())
  await page.route('**/api/**', async route => {
    if (route.request().method() === 'POST') posts.push({url:new URL(route.request().url()).pathname,body:route.request().postDataJSON()})
    await route.fulfill({json:{}})
  })
  // Only the external sensor transport is simulated. Real view, gestures and WebGL run.
  await page.addInitScript(() => {
    window.sensorStreams = []
    window.EventSource = class extends EventTarget {
      constructor(url) { super();this.url=url;this.closed=false;window.sensorStreams.push(this) }
      close() {this.closed=true}
    }
  })
  return {errors,posts}
}
export async function openChallenge(page,id,mode='package') {
  await page.goto(`/challenges/${id}/index.html?vision=robot${mode==='legacy'?'&challengeRuntime=legacy':''}`)
  await page.locator('#three-canvas canvas').waitFor()
  await page.waitForFunction(()=>window.sensorStreams.some(stream=>stream.url==='/api/vision/stream'))
  const ready=page.getByRole('button',{name:'Entendido',exact:true})
  if(await ready.isVisible()) await ready.click()
}
export async function handAt(page,selector,{pinch=true,hand='Left',dx=0,dy=0}={}) {
  const bounds=await page.locator(selector).boundingBox()
  await handPoint(page,bounds.x+bounds.width/2+dx,bounds.y+bounds.height/2+dy,{pinch,hand})
}
export async function handPoint(page,x,y,{pinch=true,hand='Left'}={}) {
  await page.evaluate(({x,y,pinch,hand})=>{
    const width=innerWidth, height=innerHeight, rw=Math.max(width,height*4/3), rh=rw*3/4
    const nx=(width-x+(rw-width)/2)/rw, ny=(y+(rh-height)/2)/rh
    const landmarks=Array.from({length:21},()=>({x:nx,y:ny,z:0}))
    landmarks[4]={x:nx+(pinch?0:0.15),y:ny,z:0}
    if(hand==='Right') for(const tip of [8,12,16,20]) landmarks[tip].y=ny+0.1
    const results={landmarks:[landmarks],handedness:[[{categoryName:hand,score:1}]]}
    for(const stream of window.sensorStreams) if(!stream.closed && stream.url==='/api/vision/stream') stream.dispatchEvent(new MessageEvent('hand-landmarks',{data:JSON.stringify(results)}))
  },{x,y,pinch,hand})
}
export async function readScene(page,id,mode) {
  return page.evaluate(async ({id,mode})=>{
    const path=mode==='legacy'?`/challenges/${id}/threeScene.js`:`/@fs${window.packageRoot}/packages/challenge-${id}/dist/threeScene.js`
    const scene=await import(path)
    return {shape:scene.currentShape,corners:scene.cornerMarkers?.map(marker=>marker.position.toArray()),camera:scene.camera.position.toArray(),atomRotation:scene.scene.children[0]?.rotation.toArray().slice(0,3)}
  },{id,mode})
}
