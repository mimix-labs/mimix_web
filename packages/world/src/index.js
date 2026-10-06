import { World } from './core/World.js'
import { LoadingScreen } from './ui/LoadingScreen.js'
import { Onboarding } from './ui/Onboarding.js'
import { surface } from './surface.js'
import styles from '../dist/styles.js'

/** Explicit browser entrypoint; importing this module never starts a world. */
export function mountWorld(root, { host, existingSurface = false } = {}) {
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
  let world, timer, disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    clearTimeout(timer)
    loading.dispose()
    world?.dispose()
    host.dispose()
    if (!existingSurface) root.replaceChildren()
  }
  const ready = Promise.resolve().then(async () => {
    if (disposed) return
    world = new World({ canvas: root.getElementById('canvas'), root, host, onLoadingProgress: status => loading.update(status) })
    await world.loadWallE()
    if (disposed) return
    loading.complete()
    timer = setTimeout(() => { if (!disposed) onboarding.showFirstVisit() }, 260)
  }).catch(error => {
    if (disposed) return
    world?.dispose()
    loading.fail()
    throw error
  })
  return { ready, dispose }
}
