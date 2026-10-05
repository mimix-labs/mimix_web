import { validateManifest, speakInputSchema, behaviorIntentSchema } from '@mimix/challenge-sdk'
import '@mimix/challenge-browser/challengeHelp.css'
import { isRobotVisionMode, startRobotVideo, startRobotHandTracking } from './robotVision.js'
import { startRobotWebBridge } from './robotWebBridge.js'
import { acquireResource } from './resources.js'

/** Transitional first-party host. No plugin URLs, remote factories or sandbox claims. */
export async function bootOfficialChallenge({ createChallenge, manifest, surface }) {
  const validation = validateManifest(manifest)
  if (!validation.ok) throw new Error(validation.error.message)
  const id = validation.manifest.id
  const query = new URLSearchParams(location.search)
  if (query.get('challengeRuntime') === 'legacy' || import.meta.env.VITE_MIMIX_CHALLENGES_MODE === 'legacy') {
    query.delete('challengeRuntime')
    location.replace(`/legacy/challenges/${id}/index.html${query.size ? `?${query}` : ''}`)
    return
  }
  document.body.innerHTML = surface
  document.body.dataset.challengeRuntime = 'package'
  document.body.dataset.challengeVersion = validation.manifest.version
  const controller = new AbortController(), { signal } = controller
  const visionController = new AbortController()
  const visionSignal = visionController.signal
  signal.addEventListener('abort', () => visionController.abort(), {once:true})
  let robot, hideTimer
  const timers = new Set()
  const bridge = startRobotWebBridge(id)
  signal.addEventListener('abort', () => {
    bridge.stop(); robot?.dispose(); clearTimeout(hideTimer)
    timers.forEach(clearTimeout)
    const image = document.getElementById('robot-camera')
    image.removeAttribute('src')
  }, { once: true })
  const requireActive = () => { if (signal.aborted) throw new DOMException('Cancelled', 'AbortError') }
  const capabilities = validation.manifest.capabilities.optional.filter(cap => ['agent','embodiment'].includes(cap))
  const shapeNames = { Cubo:'cubo', Octaedro:'octaedro', Prisma:'prisma', Pirámide:'piramide' }
  const instance = createChallenge({ signal, capabilities, mimix: {
    agent: { async speak(input) {
      requireActive()
      const { text } = speakInputSchema.parse(input)
      if (!capabilities.includes('agent')) throw new Error('CAPABILITY_DENIED')
      bridge.updateContext({ selectedObject: id === 'mathematics' ? shapeNames[text] ?? null : text })
      if (id === 'mathematics') {
        document.getElementById('robot-dialogue-text').textContent = text
        const bubble = document.getElementById('robot-dialogue')
        bubble.classList.add('is-visible'); clearTimeout(hideTimer)
        hideTimer = setTimeout(() => bubble.classList.remove('is-visible'), 3200)
      }
    } },
    embodiment: { async perform(input) {
      requireActive(); const { intent } = behaviorIntentSchema.parse(input)
      if (!capabilities.includes('embodiment')) throw new Error('CAPABILITY_DENIED')
      if (id === 'mathematics' && intent === 'acknowledge') {
        const timer = setTimeout(() => { timers.delete(timer); if (!signal.aborted) robot?.like() }, 500)
        timers.add(timer)
        // Preserve legacy analytics, without claiming a correct answer or completed attempt.
        await fetch('/api/challenges/events', { method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({challenge:id,type:'lenvantarceja',payload:{tipo:'A',timestamp:Date.now()}}), signal }).catch(() => {})
      }
    } },
    progress: { async record() { throw new Error('CAPABILITY_UNAVAILABLE') } },
  } })
  window.addEventListener('pagehide', () => { controller.abort(); void instance.dispose() }, { once:true })
  // pagehide releases sensors even for BFCache; restore with a fresh lifecycle.
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload() })
  document.addEventListener('visibilitychange', () => {
    const action = document.hidden ? instance.pause() : instance.resume()
    void action.catch(() => {})
  }, { signal })
  // Existing help keeps storage keys and copy unchanged; privileged storage stays in host.
  await import('./challengeHelp.js')
  try {
    await instance.initialize(); requireActive(); await instance.start()
    document.body.dataset.challengeState = 'running'
    if (id === 'mathematics') {
      void import('./robotManager.js').then(async ({RobotManager}) => {
        if (signal.aborted) return
        robot = new RobotManager()
        await robot.init()
        if (signal.aborted) robot.dispose()
      }).catch(() => {})
      document.addEventListener('keydown', event => {
        if (!(event.ctrlKey || event.metaKey) || !robot?.isReady()) return
        const action = { '1':'like','2':'wave','3':'jump','4':'dance','5':'walk','0':'idle' }[event.key]
        if (action) { event.preventDefault(); robot[action]() }
      }, {signal})
    }
    const robotVision = await isRobotVisionMode(); requireActive()
    document.body.dataset.visionSource = robotVision ? 'robot' : 'browser'
    const video = document.getElementById('webcam')
    if (robotVision) {
      video.hidden = true; startRobotVideo(document.getElementById('robot-camera'))
      const stop = startRobotHandTracking(results => instance.handleHands(results))
      signal.addEventListener('abort', stop, {once:true})
    } else {
      const stream = await acquireResource(visionSignal,
        () => navigator.mediaDevices.getUserMedia({ video:{facingMode:'user',width:{ideal:640},height:{ideal:480},frameRate:{ideal:30,max:30}} }),
        stream => stream.getTracks().forEach(track => track.stop()))
      video.muted = true
      video.srcObject = stream
      await video.play(); requireActive()
      const {startCpuHandTracking} = await import('./handTrackingCpu.js')
      await acquireResource(visionSignal, () => startCpuHandTracking(video, results => instance.handleHands(results)), stop => stop())
    }
  } catch (error) {
    visionController.abort()
    if (signal.aborted) return
    // Keep the existing view/help usable when a camera or optional service is unavailable.
    document.body.dataset.visionSource = 'unavailable'
    const status = document.createElement('p')
    status.setAttribute('role','status'); status.className = 'challenge-camera-status'
    status.textContent = 'No se pudo iniciar la cámara. Revisa el permiso y recarga para usar las manos.'
    document.body.append(status)
    if (!instance.running) { controller.abort(); await instance.dispose(); document.body.dataset.challengeState = 'error' }
  }
}
