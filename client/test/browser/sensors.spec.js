import { test, expect } from '@playwright/test'
import { prepare, openChallenge } from './fixtures.js'
for(const id of ['mathematics','science']) {
  test(`${id} camera denial keeps view and help usable`,async({page})=>{
    const {errors}=await prepare(page)
    await page.addInitScript(()=>{MediaDevices.prototype.getUserMedia=async()=>{throw new DOMException('Denied','NotAllowedError')}})
    await page.goto(`/challenges/${id}/?vision=browser`)
    await expect(page.locator('#three-canvas canvas')).toHaveCount(1)
    await expect(page.getByRole('status').filter({hasText:'No se pudo iniciar la cámara'})).toBeVisible()
    await expect(page.getByRole('button',{name:'Entendido',exact:true})).toBeVisible()
    if(id==='science') {await page.getByRole('button',{name:'Entendido',exact:true}).click();await page.locator('[data-symbol="Mg"]').click();await expect(page.locator('#atom-symbol')).toHaveText('Mg')}
    expect(errors).toEqual([])
  })
  test(`${id} browser video, tracking and camera tracks stop on page exit`,async({page})=>{
    const {errors}=await prepare(page)
    await page.addInitScript(()=>{
      MediaDevices.prototype.getUserMedia=async constraints=>{
        window.cameraConstraints=constraints
        const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480
        const ctx=canvas.getContext('2d');ctx.fillStyle='#245';ctx.fillRect(0,0,640,480)
        const stream=canvas.captureStream(15);window.cameraStream=stream
        window.cameraFrames=setInterval(()=>ctx.fillRect(0,0,640,480),60)
        return stream
      }
    })
    await page.route('https://cdn.jsdelivr.net/npm/@mediapipe/**',route=>route.fulfill({contentType:'text/javascript',body:'export const FilesetResolver = { async forVisionTasks(){return {}} }; export const HandLandmarker = { async createFromOptions(){ window.trackerStarted=true; return {detectForVideo(){return {landmarks:[],handedness:[]}},close(){window.trackerStopped=true}} } };'}))
    await page.goto(`/challenges/${id}/?vision=browser`)
    await expect.poll(()=>page.evaluate(()=>window.trackerStarted)).toBe(true)
    expect(await page.evaluate(()=>window.cameraConstraints.video)).toEqual({facingMode:'user',width:{ideal:640},height:{ideal:480},frameRate:{ideal:30,max:30}})
    expect(await page.locator('#webcam').evaluate(video=>video.videoWidth)).toBe(640)
    await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')))
    await expect.poll(()=>page.evaluate(()=>window.trackerStopped)).toBe(true)
    expect(await page.evaluate(()=>window.cameraStream.getTracks().every(track=>track.readyState==='ended'))).toBe(true)
    expect(await page.evaluate(()=>window.sensorStreams.every(stream=>stream.closed))).toBe(true)
    await expect(page.locator('#three-canvas canvas')).toHaveCount(0)
    expect(errors).toEqual([])
  })
  test(`${id} late camera permission cannot restart a disposed challenge`,async({page})=>{
    await prepare(page)
    await page.addInitScript(()=>{MediaDevices.prototype.getUserMedia=()=>new Promise(resolve=>{window.resolveCamera=resolve})})
    await page.goto(`/challenges/${id}/?vision=browser`)
    await page.waitForFunction(()=>typeof window.resolveCamera==='function')
    await page.evaluate(()=>{
      window.dispatchEvent(new Event('pagehide'))
      window.lateTrackStopped=false
      window.resolveCamera({getTracks:()=>[{stop(){window.lateTrackStopped=true}}]})
    })
    await expect.poll(()=>page.evaluate(()=>window.lateTrackStopped)).toBe(true)
    await expect(page.locator('#three-canvas canvas')).toHaveCount(0)
    expect(await page.locator('#webcam').evaluate(video=>video.srcObject)).toBeNull()
  })
  test(`${id} Jetson command navigation retains the vision override`,async({page})=>{
    await prepare(page);await openChallenge(page,id)
    const destination=id==='science'?'mathematics':'science'
    await page.evaluate(destination=>{
      for(const stream of window.sensorStreams) if(stream.url==='/api/robot/commands/stream') stream.dispatchEvent(new MessageEvent('robot-command',{data:JSON.stringify({action:'navigate_to',destination})}))
    },destination)
    await expect(page).toHaveURL(new RegExp(`/challenges/${destination}/index.html\\?vision=robot$`))
    await expect(page.locator('body')).toHaveAttribute('data-challenge-runtime','package')
  })
}
