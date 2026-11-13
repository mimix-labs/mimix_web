import { World } from './core/World.js'
import { LoadingScreen } from './ui/LoadingScreen.js'
import { Onboarding } from './ui/Onboarding.js'
import { surface } from './surface.js'
import styles from '../dist/styles.js'

/** Explicit browser entrypoint; importing this module never starts a world. */
export function mountWorld(root, { host, existingSurface = false, startInSpace = false, onPhaseChange } = {}) {
  if (!existingSurface) {
    const style = document.createElement('style')
    style.textContent = styles
    root.append(style)
    const template = document.createElement('template')
    template.innerHTML = surface
    root.append(template.content.cloneNode(true))
  }
  const loading = new LoadingScreen(root)
  const onboarding = new Onboarding(root)
  let welcome
  if (startInSpace) {
    welcome = document.createElement('div')
    welcome.className = 'world-welcome'
    welcome.hidden = true
    welcome.innerHTML = '<h1 class="world-welcome-title">MIMIX</h1><button class="world-start-button" type="button" aria-label="Play: comenzar la exploración" title="Play"><svg aria-hidden="true" viewBox="0 0 32 32" width="32" height="32"><path d="M10 5.5 Q10 3.5 12 4.7 L27 14.2 Q29 16 27 17.8 L12 27.3 Q10 28.5 10 26.5Z" fill="currentColor"/></svg></button>'
    root.getElementById('ui')?.append(welcome)
    onboarding.helpButton.hidden = true
  }
  let world, timer, disposed = false, interactionEnabled = true
  const changePhase = phase => {
    if (disposed) return
    if (welcome) {
      welcome.hidden = phase !== 'intro'
      onboarding.helpButton.hidden = phase !== 'exploring'
      if (phase === 'exploring') {
        const canvas = root.getElementById('canvas')
        canvas.setAttribute('tabindex', '-1')
        canvas.focus()
      }
    }
    onPhaseChange?.(phase)
  }
  const start = () => world?.startExploring()
  welcome?.querySelector('button')?.addEventListener('click', start)
  const dispose = () => {
    if (disposed) return
    disposed = true
    clearTimeout(timer)
    loading.dispose()
    welcome?.querySelector('button')?.removeEventListener('click', start)
    welcome?.remove()
    world?.dispose()
    host.dispose()
    if (!existingSurface) root.replaceChildren()
  }
  const ready = Promise.resolve().then(async () => {
    if (disposed) return
    world = new World({ canvas: root.getElementById('canvas'), root, host, onLoadingProgress: status => loading.update(status), startInSpace, onPhaseChange: changePhase })
    world.setInteractionEnabled(interactionEnabled)
    await world.loadCharacter()
    if (disposed) return
    loading.complete()
    if (welcome) welcome.querySelector('button')?.focus()
    else timer = setTimeout(() => { if (!disposed && interactionEnabled) onboarding.showFirstVisit() }, 260)
  }).catch(error => {
    if (disposed) return
    world?.dispose()
    loading.fail()
    changePhase('error')
    throw error
  })
  return {
    ready, dispose, start: () => world?.startExploring() ?? false,
    setInteractionEnabled(enabled) { interactionEnabled = enabled; world?.setInteractionEnabled(enabled) },
    captureView: () => world?.captureView() ?? null,
    restoreView: view => world?.restoreView(view) ?? false,
  }
}
